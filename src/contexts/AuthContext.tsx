import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { UserProfile, UserRole, BranchScope } from '../types';
import { logAuditEvent } from '../services/auditService';
import { reconcileUserProfile } from '../services/userService';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  role: UserRole;
  branch: BranchScope;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INITIAL_SUPERADMIN_EMAIL = 'reikirizaki@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrCreateProfile = async (fbUser: FirebaseUser): Promise<UserProfile | null> => {
    const userDocRef = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(userDocRef);

    const isInitialAdmin = fbUser.email?.toLowerCase() === INITIAL_SUPERADMIN_EMAIL;

    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      // If user is the initial superadmin, ensure role is ADMIN and isActive is true
      if (isInitialAdmin && (!data.isActive || data.role !== 'ADMIN')) {
        const updated: UserProfile = {
          ...data,
          role: 'ADMIN',
          branch: 'ALL',
          isActive: true,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, updated, { merge: true });
        return updated;
      }
      return data;
    }

    // Attempt reconciliation if document by UID not found (e.g., legacy doc or created before UID sync)
    if (fbUser.email) {
      const reconciled = await reconcileUserProfile(fbUser.uid, fbUser.email);
      if (reconciled) {
        return reconciled;
      }
    }

    // Closed registration check: only initial superadmin can bootstrap their own profile
    if (isInitialAdmin) {
      const initialProfile: UserProfile = {
        uid: fbUser.uid,
        email: fbUser.email || INITIAL_SUPERADMIN_EMAIL,
        displayName: fbUser.displayName || 'Administrator DKL',
        photoURL: fbUser.photoURL || '',
        role: 'ADMIN',
        branch: 'ALL',
        department: 'Direksi / IT Management',
        phone: '',
        isActive: true,
        createdAt: new Date().toISOString(),
        createdBy: 'SYSTEM_BOOTSTRAP',
      };
      await setDoc(userDocRef, initialProfile);
      return initialProfile;
    }

    return null;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          const userProfile = await fetchOrCreateProfile(currentUser);
          if (!userProfile) {
            // Profile does not exist and not initial admin -> Closed Registration DENIED
            await signOut(auth);
            setUser(null);
            setProfile(null);
          } else if (!userProfile.isActive) {
            // Account is deactivated by Admin
            await signOut(auth);
            setUser(null);
            setProfile(null);
          } else {
            setUser(currentUser);
            setProfile(userProfile);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Auth state initialization error:', err);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !pass) {
      setLoading(false);
      throw new Error('Alamat email dan kata sandi wajib diisi.');
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, normalizedEmail, pass);
      const userProfile = await fetchOrCreateProfile(cred.user);

      if (!userProfile) {
        await signOut(auth);
        throw new Error('Akun terdaftar di sistem autentikasi, tetapi profil pengguna belum dikonfigurasi oleh Administrator. Silakan hubungi admin.');
      }

      if (!userProfile.isActive) {
        await signOut(auth);
        throw new Error('Akun Anda berstatus NONAKTIF. Silakan hubungi Administrator untuk mengaktifkan kembali akun Anda.');
      }

      // Record last login timestamp in Firestore
      try {
        await updateDoc(doc(db, 'users', cred.user.uid), {
          lastLoginAt: new Date().toISOString(),
        });
        userProfile.lastLoginAt = new Date().toISOString();
      } catch (e) {
        // non-blocking
      }

      setUser(cred.user);
      setProfile(userProfile);

      await logAuditEvent({
        action: 'LOGIN',
        module: 'AUTHENTICATION',
        documentId: cred.user.uid,
        userId: cred.user.uid,
        userEmail: cred.user.email || '',
        userRole: userProfile.role,
        branch: userProfile.branch,
        details: 'User logged in successfully via Email/Password',
      });
    } catch (error: any) {
      console.error('Email login error:', error);
      // Friendly, non-leaking error messages
      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password'
      ) {
        throw new Error('Email atau kata sandi tidak sesuai. Silakan periksa kembali.');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('Akun ini telah dinonaktifkan oleh administrator.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Terlalu banyak percobaan masuk yang gagal. Silakan coba kembali beberapa saat lagi.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Koneksi jaringan terputus. Periksa sambungan internet Anda.');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      const userProfile = await fetchOrCreateProfile(cred.user);

      if (!userProfile) {
        await signOut(auth);
        throw new Error('Akun Google ini belum terdaftar pada sistem. Silakan hubungi Administrator.');
      }

      if (!userProfile.isActive) {
        await signOut(auth);
        throw new Error('Akun Anda tidak aktif. Silakan hubungi Administrator.');
      }

      setUser(cred.user);
      setProfile(userProfile);

      await logAuditEvent({
        action: 'LOGIN',
        module: 'AUTHENTICATION',
        documentId: cred.user.uid,
        userId: cred.user.uid,
        userEmail: cred.user.email || '',
        userRole: userProfile.role,
        branch: userProfile.branch,
        details: 'User logged in successfully via Google Sign-In',
      });
    } catch (error: any) {
      console.error('Google login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (user && profile) {
      try {
        await logAuditEvent({
          action: 'LOGOUT',
          module: 'AUTHENTICATION',
          documentId: user.uid,
          userId: user.uid,
          userEmail: user.email || '',
          userRole: profile.role,
          branch: profile.branch,
          details: 'User logged out',
        });
      } catch (e) {
        // non-blocking
      }
    }
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchOrCreateProfile(user);
      setProfile(p);
    }
  };

  const role: UserRole = profile?.role || 'USER';
  const branch: BranchScope = profile?.branch || 'SINGARAJA';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        branch,
        loading,
        login,
        googleLogin,
        logout,
        resetPassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
