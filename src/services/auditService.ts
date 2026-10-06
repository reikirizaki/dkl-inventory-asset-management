import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AuditLog, AssetHistory } from '../types';

function generateUniqueLogId(): string {
  const timestamp = Date.now().toString(36);
  const rand1 = Math.random().toString(36).substring(2, 8);
  const rand2 = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${rand1}_${rand2}`;
}

export async function logAuditEvent(entry: {
  action: string;
  module: string;
  documentId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  branch: string;
  details: string;
}) {
  try {
    const docId = generateUniqueLogId();
    const docRef = doc(collection(db, 'audit_logs'), docId);
    await setDoc(docRef, {
      ...entry,
      timestamp: new Date().toISOString(),
      createdAtServer: serverTimestamp(),
    });
  } catch (error: any) {
    const errStr = String(error?.message || error || '');
    const isAlreadyExists =
      error?.code === 'already-exists' ||
      errStr.toLowerCase().includes('already exists') ||
      errStr.toLowerCase().includes('already-exists');

    if (isAlreadyExists) {
      // The audit event is already stored; ignore duplicate without throwing error
      return;
    }
    console.warn('Non-blocking audit log notice:', errStr);
  }
}

export async function logAssetHistory(entry: {
  assetId: string;
  assetCode: string;
  action: string;
  details: string;
  performedBy: string;
  userEmail: string;
}) {
  try {
    const docId = generateUniqueLogId();
    const docRef = doc(collection(db, 'asset_history'), docId);
    await setDoc(docRef, {
      ...entry,
      timestamp: new Date().toISOString(),
      createdAtServer: serverTimestamp(),
    });
  } catch (error: any) {
    const errStr = String(error?.message || error || '');
    const isAlreadyExists =
      error?.code === 'already-exists' ||
      errStr.toLowerCase().includes('already exists') ||
      errStr.toLowerCase().includes('already-exists');

    if (isAlreadyExists) {
      return;
    }
    console.warn('Non-blocking asset history notice:', errStr);
  }
}
