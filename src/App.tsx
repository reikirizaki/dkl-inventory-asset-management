/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';

// Pages
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AssetListPage } from './pages/assets/AssetListPage';
import { AssetFormPage } from './pages/assets/AssetFormPage';
import { AssetDetailPage } from './pages/assets/AssetDetailPage';
import { BarcodeStudioPage } from './pages/barcode/BarcodeStudioPage';
import { ScannerPage } from './pages/scanner/ScannerPage';
import { InventoryListPage } from './pages/inventory/InventoryListPage';
import { InboundPage } from './pages/inventory/InboundPage';
import { OutboundPage } from './pages/inventory/OutboundPage';
import { AdjustmentPage } from './pages/inventory/AdjustmentPage';
import { MutasiPage } from './pages/mutasi/MutasiPage';
import { TransferPage } from './pages/transfers/TransferPage';
import { StockOpnamePage } from './pages/opname/StockOpnamePage';
import { MaintenancePage } from './pages/maintenance/MaintenancePage';
import { RepairsPage } from './pages/repairs/RepairsPage';
import { LostFoundPage } from './pages/incidents/LostFoundPage';
import { DisposalPage } from './pages/disposal/DisposalPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { MasterDataPage } from './pages/master/MasterDataPage';
import { UserManagementPage } from './pages/users/UserManagementPage';
import { AuditLogsPage } from './pages/audit/AuditLogsPage';
import { SettingsPage } from './pages/settings/SettingsPage';

export default function App() {
  useEffect(() => {
    // Register PWA Service Worker if available
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.debug('ServiceWorker registration note:', err);
        });
      });
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Login Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Closed Registration Redirect */}
          <Route
            path="/register"
            element={
              <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-slate-200 text-center">
                  <h2 className="text-lg font-bold text-slate-900 mb-2">Registrasi Tertutup</h2>
                  <p className="text-slate-600 text-xs mb-6">
                    Registrasi akun hanya dapat dilakukan oleh Administrator PT Darma Karya Lestari.
                  </p>
                  <a
                    href="/login"
                    className="inline-block px-5 py-2.5 bg-sky-600 text-white font-bold text-xs rounded-xl hover:bg-sky-500 transition"
                  >
                    Kembali ke Login
                  </a>
                </div>
              </div>
            }
          />

          {/* Protected Application Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <DashboardPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/scanner"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ScannerPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/assets"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <AssetListPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/assets/new"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'USER']}>
                <MainLayout>
                  <AssetFormPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/assets/edit/:id"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'USER']}>
                <MainLayout>
                  <AssetFormPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/assets/:id"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <AssetDetailPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/barcode"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <BarcodeStudioPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <InventoryListPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventory/inbound"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'USER']}>
                <MainLayout>
                  <InboundPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventory/outbound"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'USER']}>
                <MainLayout>
                  <OutboundPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventory/adjustment"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'USER']}>
                <MainLayout>
                  <AdjustmentPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/mutasi"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <MutasiPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/transfers"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <TransferPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/stock-opname"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <StockOpnamePage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/maintenance"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <MaintenancePage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/repairs"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <RepairsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/lost-found"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <LostFoundPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/disposal"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <DisposalPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ReportsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/master-data"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <MasterDataPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <MainLayout>
                  <UserManagementPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <AuditLogsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <SettingsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
