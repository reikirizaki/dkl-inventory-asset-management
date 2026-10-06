import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { CompanySettings } from '../types';

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  companyName: 'PT DARMA KARYA LESTARI',
  companyAddress: 'Jl. Ahmad Yani No. 88, Singaraja, Buleleng, Bali - Indonesia',
  companyPhone: '+62 362 21888',
  companyEmail: 'info@darmakaryalestari.co.id',
  primaryColor: '#0284c7', // Sky Blue primary
  secondaryColor: '#0ea5e9',
};

const SETTINGS_CACHE_KEY = 'dkl_company_settings_cache';

export function getCachedCompanySettings(): CompanySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      return { ...DEFAULT_COMPANY_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_COMPANY_SETTINGS;
}

export async function getCompanySettings(): Promise<CompanySettings> {
  try {
    const docRef = doc(db, 'company_settings', 'main');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = { ...DEFAULT_COMPANY_SETTINGS, ...(snap.data() as CompanySettings) };
      try {
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
      } catch {}
      return data;
    }
    return DEFAULT_COMPANY_SETTINGS;
  } catch (error) {
    console.error('Error fetching company settings, using defaults/cache:', error);
    return getCachedCompanySettings();
  }
}

export function subscribeCompanySettings(callback: (settings: CompanySettings) => void) {
  try {
    const docRef = doc(db, 'company_settings', 'main');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = { ...DEFAULT_COMPANY_SETTINGS, ...(snap.data() as CompanySettings) };
          try {
            localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
          } catch {}
          callback(data);
        } else {
          callback(DEFAULT_COMPANY_SETTINGS);
        }
      },
      (error) => {
        console.warn('Real-time company settings subscription warning:', error);
        callback(getCachedCompanySettings());
      }
    );
  } catch {
    callback(getCachedCompanySettings());
    return () => {};
  }
}

export async function updateCompanySettings(data: Partial<CompanySettings>, updatedBy: string): Promise<void> {
  try {
    const docRef = doc(db, 'company_settings', 'main');
    const updatePayload = {
      ...data,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    await setDoc(docRef, updatePayload, { merge: true });

    // Instantly update local cache so other components reading from cache have the new logo immediately
    try {
      const current = getCachedCompanySettings();
      const updated = { ...current, ...updatePayload };
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(updated));
    } catch {}
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'company_settings/main');
  }
}
