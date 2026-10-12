import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, UserRole, BranchScope } from '../types';
import { logAuditEvent } from './auditService';

export interface CreateUserPayload {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  branch: BranchScope;
  department: string;
  phone: string;
  isActive: boolean;
  adminEmail: string;
  adminUid: string;
  adminRole: UserRole;
}

export interface UpdateUserPayload {
  displayName: string;
  role: UserRole;
  branch: BranchScope;
  department: string;
  phone: string;
  isActive: boolean;
  adminEmail: string;
  adminUid: string;
  adminRole: UserRole;
}

/**
 * Creates a new user in Firebase Authentication and stores the profile in Cloud Firestore.
 * CRITICAL: Uses a secondary isolated Firebase App instance so the currently logged-in
 * Administrator session is NEVER modified or signed out.
 */
export async function createUserWithAuthAndProfile(
  payload: CreateUserPayload
): Promise<UserProfile> {
  const normalizedEmail = payload.email.trim().toLowerCase();

  // Basic validation
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Alamat email tidak valid.');
  }
  if (!payload.password || payload.password.length < 8) {
    throw new Error('Password wajib diisi dan minimal 8 karakter.');
  }
  if (!payload.displayName.trim()) {
    throw new Error('Nama lengkap pengguna wajib diisi.');
  }

  // 1. Check if Firestore already has a user with this email
  const existingQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail));
  const existingDocs = await getDocs(existingQuery);
  if (!existingDocs.empty) {
    throw new Error(`Email "${normalizedEmail}" sudah terdaftar di sistem profil pengguna.`);
  }

  // 2. Instantiate a temporary isolated secondary Firebase app
  const secondaryAppName = `SecondaryAuth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  let newUid = '';
  let authUserCreated = false;

  try {
    // 3. Create account in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizedEmail,
      payload.password
    );

    newUid = userCredential.user.uid;
    authUserCreated = true;

    // Immediately sign out from secondary auth instance
    await signOut(secondaryAuth);
  } catch (authError: any) {
    console.error('Secondary Auth account creation failed:', authError);
    if (authError?.code === 'auth/email-already-in-use') {
      throw new Error(`Email "${normalizedEmail}" sudah terdaftar di Firebase Authentication.`);
    } else if (authError?.code === 'auth/weak-password') {
      throw new Error('Password terlalu lemah. Pastikan minimal 8 karakter dengan kombinasi huruf dan angka.');
    } else if (authError?.code === 'auth/invalid-email') {
      throw new Error('Format alamat email tidak valid.');
    } else if (authError?.code === 'auth/operation-not-allowed') {
      throw new Error('Metode pendaftaran Email/Password belum diaktifkan di Firebase Console.');
    } else {
      throw new Error(authError?.message || 'Gagal membuat akun autentikasi Firebase.');
    }
  } finally {
    // Clean up secondary app instance safely
    try {
      await deleteApp(secondaryApp);
    } catch {
      // non-blocking cleanup
    }
  }

  // 4. Save user profile to Cloud Firestore with UID as document ID
  const newProfile: UserProfile = {
    uid: newUid,
    email: normalizedEmail,
    displayName: payload.displayName.trim(),
    role: payload.role,
    branch: payload.branch,
    department: payload.department.trim() || 'Operasional',
    phone: payload.phone.trim() || '-',
    isActive: payload.isActive,
    createdAt: new Date().toISOString(),
    createdBy: payload.adminEmail,
  };

  try {
    await setDoc(doc(db, 'users', newUid), newProfile);
  } catch (firestoreError: any) {
    console.error('Firestore profile save failed after Auth creation:', firestoreError);
    throw new Error(
      `Akun autentikasi berhasil dibuat (UID: ${newUid}), namun gagal menyimpan profil ke Firestore: ${
        firestoreError?.message || 'Izin akses ditolak'
      }. Silakan hubungi teknisi.`
    );
  }

  // 5. Log audit trail
  try {
    await logAuditEvent({
      action: 'USER_CREATE',
      module: 'USER_MANAGEMENT',
      documentId: newUid,
      userId: payload.adminUid,
      userEmail: payload.adminEmail,
      userRole: payload.adminRole,
      branch: payload.branch,
      details: `Akun baru dibuat: ${normalizedEmail} (Role: ${payload.role}, Cabang: ${payload.branch}, Status: ${
        payload.isActive ? 'Aktif' : 'Nonaktif'
      })`,
    });
  } catch (auditError) {
    console.warn('Audit log creation non-blocking notice:', auditError);
  }

  return newProfile;
}

/**
 * Updates an existing user's profile in Firestore.
 */
export async function updateUserProfile(
  uid: string,
  payload: UpdateUserPayload
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw new Error('Pengguna tidak ditemukan di database.');
  }

  const existing = snap.data() as UserProfile;

  await updateDoc(userRef, {
    displayName: payload.displayName.trim(),
    role: payload.role,
    branch: payload.branch,
    department: payload.department.trim() || '-',
    phone: payload.phone.trim() || '-',
    isActive: payload.isActive,
    updatedAt: new Date().toISOString(),
    updatedBy: payload.adminEmail,
  });

  try {
    await logAuditEvent({
      action: 'USER_UPDATE',
      module: 'USER_MANAGEMENT',
      documentId: uid,
      userId: payload.adminUid,
      userEmail: payload.adminEmail,
      userRole: payload.adminRole,
      branch: payload.branch,
      details: `Profil ${existing.email} diubah: Role=${payload.role}, Cabang=${payload.branch}, Status=${
        payload.isActive ? 'Aktif' : 'Nonaktif'
      }`,
    });
  } catch (auditError) {
    console.warn('Audit log notice:', auditError);
  }
}

/**
 * Toggles user active/inactive status.
 */
export async function toggleUserStatus(
  targetUser: UserProfile,
  adminUid: string,
  adminEmail: string,
  adminRole: UserRole
): Promise<boolean> {
  const nextStatus = !targetUser.isActive;
  const userRef = doc(db, 'users', targetUser.uid);

  await updateDoc(userRef, {
    isActive: nextStatus,
    updatedAt: new Date().toISOString(),
    updatedBy: adminEmail,
  });

  try {
    await logAuditEvent({
      action: nextStatus ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
      module: 'USER_MANAGEMENT',
      documentId: targetUser.uid,
      userId: adminUid,
      userEmail: adminEmail,
      userRole: adminRole,
      branch: targetUser.branch,
      details: `Status akun ${targetUser.email} diubah menjadi: ${nextStatus ? 'AKTIF' : 'NON-AKTIF'}`,
    });
  } catch (auditError) {
    console.warn('Audit log notice:', auditError);
  }

  return nextStatus;
}

/**
 * Sends a password reset email via Firebase Authentication.
 */
export async function sendUserPasswordReset(
  email: string,
  adminUid?: string,
  adminEmail?: string,
  adminRole?: UserRole
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await sendPasswordResetEmail(auth, normalized);

  if (adminUid && adminEmail) {
    try {
      await logAuditEvent({
        action: 'PASSWORD_RESET_SENT',
        module: 'USER_MANAGEMENT',
        documentId: normalized,
        userId: adminUid,
        userEmail: adminEmail,
        userRole: adminRole || 'ADMIN',
        branch: 'ALL',
        details: `Tautan reset kata sandi dikirimkan ke email: ${normalized}`,
      });
    } catch {}
  }
}

/**
 * Reconciles profile if user was previously saved under a legacy synthetic document ID.
 */
export async function reconcileUserProfile(uid: string, email: string): Promise<UserProfile | null> {
  const normalized = email.trim().toLowerCase();
  const directRef = doc(db, 'users', uid);
  const directSnap = await getDoc(directRef);

  if (directSnap.exists()) {
    return directSnap.data() as UserProfile;
  }

  // Look for document with matching email
  const q = query(collection(db, 'users'), where('email', '==', normalized));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const legacyDoc = snap.docs[0];
    const legacyData = legacyDoc.data() as UserProfile;

    const reconciled: UserProfile = {
      ...legacyData,
      uid,
      email: normalized,
      updatedAt: new Date().toISOString(),
      updatedBy: 'SYSTEM_RECONCILIATION',
    };

    // Save with the actual Firebase Auth UID as document ID
    await setDoc(directRef, reconciled);

    // If legacy doc had a different ID, clean it up
    if (legacyDoc.id !== uid) {
      try {
        await deleteDoc(doc(db, 'users', legacyDoc.id));
      } catch (err) {
        console.warn('Failed to delete legacy user doc:', err);
      }
    }

    return reconciled;
  }

  return null;
}
