import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { AppNotification } from '../types';

export async function createNotification(notif: {
  type: string;
  title: string;
  message: string;
  link?: string;
  targetRole?: string;
  targetBranch?: string;
}) {
  try {
    const colRef = collection(db, 'notifications');
    await addDoc(colRef, {
      ...notif,
      read: false,
      createdAt: new Date().toISOString(),
      createdAtServer: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

export async function markNotificationAsRead(id: string) {
  try {
    const docRef = doc(db, 'notifications', id);
    await updateDoc(docRef, { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
  }
}
