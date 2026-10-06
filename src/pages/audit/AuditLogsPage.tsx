import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, Filter, Calendar, User, Building2, Printer } from 'lucide-react';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { AuditLog } from '../../types';
import { getCachedCompanySettings } from '../../services/companyService';
import { printReport } from '../../services/printService';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'audit_logs'), limit(250)));
      const list: AuditLog[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      setLogs(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (filterModule !== 'ALL' && log.module !== filterModule) return false;
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      return (
        log.details?.toLowerCase().includes(s) ||
        log.userEmail?.toLowerCase().includes(s) ||
        log.action?.toLowerCase().includes(s) ||
        log.documentId?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintAuditLogs = () => {
    console.log('[PRINT][AUDIT] button clicked');
    if (filteredLogs.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
      return;
    }

    setIsPrinting(true);
    try {
      const companySettings = getCachedCompanySettings();
      const reportHtml = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; padding: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
            <div>
              <h1 style="font-size: 16px; font-weight: 900; margin: 0; text-transform: uppercase;">${companySettings.companyName || 'PT DARMA KARYA LESTARI'}</h1>
              <p style="font-size: 12px; font-weight: bold; margin: 2px 0 0 0; color: #0284c7;">LAPORAN LOG AUDIT & JEJAK SISTEM</p>
              <p style="font-size: 10px; color: #64748b; margin: 2px 0 0 0;">Dicetak pada: ${new Date().toLocaleString('id-ID')} | Modul: ${filterModule}</p>
            </div>
            ${companySettings.logoUrl ? `<img src="${companySettings.logoUrl}" style="height: 48px; object-fit: contain;" />` : ''}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">Waktu</th>
                <th style="padding: 6px 8px;">Modul</th>
                <th style="padding: 6px 8px;">Aksi</th>
                <th style="padding: 6px 8px;">Rincian</th>
                <th style="padding: 6px 8px;">Operator</th>
                <th style="padding: 6px 8px;">Cabang</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLogs.map((log) => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 6px 8px; font-family: monospace;">${log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '-'}</td>
                  <td style="padding: 6px 8px; font-weight: bold;">${log.module}</td>
                  <td style="padding: 6px 8px;">${log.action}</td>
                  <td style="padding: 6px 8px;">${log.details}</td>
                  <td style="padding: 6px 8px;">${log.userEmail || '-'}</td>
                  <td style="padding: 6px 8px;">${log.branch || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Log_Audit_DKL', printWindow);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-600" />
            <span>Log Audit Sistem Terpadu (Tamper-Evident Trail)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Catatan riwayat append-only untuk setiap autentikasi, mutasi aset, perubahan status, dan transaksi inventaris
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handlePrintAuditLogs}
            disabled={isPrinting || filteredLogs.length === 0}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50 flex-shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan cetakan...' : 'Cetak Log Audit'}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari rincian aktivitas, email operator, atau ID dokumen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
          />
        </div>

        <div>
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">Semua Modul</option>
            <option value="AUTHENTICATION">Autentikasi & Login</option>
            <option value="ASSETS">Manajemen Aset</option>
            <option value="INVENTORY">Inventaris & Stok</option>
            <option value="TRANSFERS">Transfer Antar Cabang</option>
            <option value="REPAIRS">Perbaikan & Kerusakan</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="STOCK_OPNAME">Stock Opname</option>
            <option value="DISPOSALS">Penghapusan (Disposal)</option>
            <option value="USER_MANAGEMENT">Kelola Pengguna</option>
            <option value="SETTINGS">Pengaturan Perusahaan</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Mengambil catatan audit...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">Tidak ada log audit ditemukan.</div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Modul</th>
                  <th className="py-3 px-4">Aksi</th>
                  <th className="py-3 px-4">Rincian Aktivitas</th>
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-4">Cabang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700">{log.module}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-bold text-[10px] border border-sky-100">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-800 font-medium max-w-md">
                      {log.details}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-600">
                      <div className="font-semibold">{log.userEmail?.split('@')[0]}</div>
                      <div className="text-[10px] text-slate-400">{log.userRole}</div>
                    </td>
                    <td className="py-3 px-4 font-sans font-bold text-sky-700">{log.branch || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
