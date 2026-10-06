import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, profile, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-600">Memverifikasi otorisasi...</p>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (!profile.isActive) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-rose-100 text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Akun Tidak Aktif</h2>
          <p className="text-slate-600 text-sm mb-6">
            Akun Anda saat ini dinonaktifkan. Silakan hubungi Administrator PT Darma Karya Lestari.
          </p>
          <a
            href="/login"
            className="inline-block px-5 py-2.5 bg-sky-600 text-white font-semibold text-sm rounded-xl hover:bg-sky-500 transition"
          >
            Kembali ke Login
          </a>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-amber-100 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
            403
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Akses Terbatas</h2>
          <p className="text-slate-600 text-sm mb-6">
            Anda tidak memiliki izin (Permission) untuk mengakses halaman ini. Peran Anda adalah{' '}
            <span className="font-semibold text-sky-600">{role}</span>.
          </p>
          <a
            href="/"
            className="inline-block px-5 py-2.5 bg-sky-600 text-white font-semibold text-sm rounded-xl hover:bg-sky-500 transition"
          >
            Kembali ke Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
