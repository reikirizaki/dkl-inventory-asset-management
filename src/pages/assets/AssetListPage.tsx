import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Eye,
  Edit2,
  Trash2,
  QrCode,
  Box,
  Building2,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { Asset, CompanySettings } from '../../types';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';
import { getCompanySettings, subscribeCompanySettings, DEFAULT_COMPANY_SETTINGS } from '../../services/companyService';
import { exportToPdf, exportToExcel, exportToCsv } from '../../reports/exportUtils';
import { printReport } from '../../services/printService';

export const AssetListPage: React.FC = () => {
  const { user, profile, role, branch } = useAuth();
  const navigate = useNavigate();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState<string>(branch === 'ALL' ? 'ALL' : branch);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterCondition, setFilterCondition] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Export Modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportWithLogo, setExportWithLogo] = useState(true);
  const [exportWithImage, setExportWithImage] = useState(true);

  useEffect(() => {
    getCompanySettings().then(setCompanySettings).catch(() => {});
    const unsub = subscribeCompanySettings(setCompanySettings);
    return () => unsub();
  }, []);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const q = collection(db, 'assets');
      const snap = await getDocs(q);
      const list: Asset[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      setAssets(list.filter((a) => !a.isDeleted));
    } catch (err) {
      console.error('Failed to fetch assets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a) => {
      if (a.category) set.add(a.category);
    });
    return Array.from(set);
  }, [assets]);

  const filteredAssets = useMemo(() => {
    return assets.filter((item) => {
      // Branch filter
      if (filterBranch !== 'ALL' && item.branch !== filterBranch) return false;
      // Status filter
      if (filterStatus !== 'ALL' && item.status !== filterStatus) return false;
      // Condition filter
      if (filterCondition !== 'ALL' && item.condition !== filterCondition) return false;
      // Category filter
      if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;

      // Search term
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const matches =
          item.assetCode?.toLowerCase().includes(s) ||
          item.barcode?.toLowerCase().includes(s) ||
          item.name?.toLowerCase().includes(s) ||
          item.serialNumber?.toLowerCase().includes(s) ||
          item.brand?.toLowerCase().includes(s) ||
          item.pic?.toLowerCase().includes(s) ||
          item.location?.toLowerCase().includes(s);
        if (!matches) return false;
      }

      return true;
    });
  }, [assets, filterBranch, filterStatus, filterCondition, filterCategory, searchTerm]);

  const handleSoftDelete = async (asset: Asset) => {
    if (role !== 'ADMIN') {
      alert('Hanya Administrator yang berwenang menghapus aset.');
      return;
    }

    const confirmDel = window.confirm(`Apakah Anda yakin ingin menghapus aset ${asset.assetCode} - ${asset.name}?`);
    if (!confirmDel) return;

    try {
      const docRef = doc(db, 'assets', asset.id);
      await updateDoc(docRef, {
        isDeleted: true,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: asset.id,
        assetCode: asset.assetCode,
        action: 'SOFT_DELETE',
        details: `Aset dinonaktifkan/dihapus oleh ${user?.email}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      await logAuditEvent({
        action: 'DELETE',
        module: 'ASSETS',
        documentId: asset.id,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: asset.branch,
        details: `Aset ${asset.assetCode} dihapus secara soft-delete`,
      });

      fetchAssets();
    } catch (e) {
      console.error('Delete error:', e);
      alert('Gagal menghapus aset. Silakan coba kembali.');
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'AKTIF':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'BARU':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'MAINTENANCE':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'RUSAK':
      case 'HILANG':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'DALAM PERBAIKAN':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getConditionBadge = (c: string) => {
    switch (c) {
      case 'BAIK':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200';
      case 'RUSAK RINGAN':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'RUSAK BERAT':
      case 'HILANG':
        return 'text-rose-700 bg-rose-50 border-rose-200';
      default:
        return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  const exportColumns = [
    { header: 'Kode Aset', dataKey: 'assetCode' },
    { header: 'Nama Aset', dataKey: 'name' },
    { header: 'Kategori', dataKey: 'category' },
    { header: 'Merk/Model', dataKey: 'brand' },
    { header: 'No. Seri', dataKey: 'serialNumber' },
    { header: 'Cabang', dataKey: 'branch' },
    { header: 'Lokasi', dataKey: 'location' },
    { header: 'PIC', dataKey: 'pic' },
    { header: 'Kondisi', dataKey: 'condition' },
    { header: 'Status', dataKey: 'status' },
  ];

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintAssetList = () => {
    console.log('[PRINT][ASSETS] button clicked');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
      return;
    }

    setIsPrinting(true);
    try {
      const rowsHtml = filteredAssets.length > 0
        ? filteredAssets.map((a, i) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 8px; color: #94a3b8; font-weight: 700;">${i + 1}</td>
              ${exportWithImage ? `<td style="padding: 6px 8px;">${a.photoUrl ? `<img src="${a.photoUrl}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px;" />` : '-'}</td>` : ''}
              <td style="padding: 6px 8px; font-weight: 700; color: #0369a1; font-family: monospace;">${a.assetCode}</td>
              <td style="padding: 6px 8px; font-weight: 700;">${a.name}</td>
              <td style="padding: 6px 8px;">${a.category}</td>
              <td style="padding: 6px 8px;">${a.brand || '-'}</td>
              <td style="padding: 6px 8px; font-family: monospace;">${a.serialNumber || '-'}</td>
              <td style="padding: 6px 8px;">${a.branch}</td>
              <td style="padding: 6px 8px;">${a.location || '-'}</td>
              <td style="padding: 6px 8px;">${a.pic || '-'}</td>
              <td style="padding: 6px 8px;"><span style="font-weight: 700;">${a.condition}</span></td>
              <td style="padding: 6px 8px;">${a.status}</td>
            </tr>
          `).join('')
        : `<tr><td colspan="12" style="padding: 16px; text-align: center; color: #94a3b8; font-style: italic;">Tidak ada data aset terdaftar sesuai kriteria filter.</td></tr>`;

      const reportHtml = `
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 12px; color: #0f172a;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              ${exportWithLogo && companySettings.logoUrl ? `<img src="${companySettings.logoUrl}" style="height: 48px; object-fit: contain;" alt="Logo" />` : ''}
              <div>
                <h2 style="font-size: 16px; font-weight: 800; margin: 0; text-transform: uppercase;">${companySettings.companyName || 'PT DARMA KARYA LESTARI'}</h2>
                <p style="font-size: 11px; font-weight: 700; color: #0284c7; margin: 2px 0 0 0; text-transform: uppercase;">DKL INVENTORY & ASSET MANAGEMENT</p>
                <p style="font-size: 10px; color: #64748b; margin: 2px 0 0 0;">${companySettings.companyAddress || 'Singaraja & Tejakula, Bali'}</p>
              </div>
            </div>
            <div style="text-align: right; font-size: 10px; color: #475569;">
              <p style="font-weight: 700; margin: 0;">LAPORAN ASET TETAP</p>
              <p style="margin: 2px 0 0 0;">Tgl: ${new Date().toLocaleDateString('id-ID')}</p>
            </div>
          </div>
          <p style="font-size: 10px; color: #64748b; margin-bottom: 10px;">Filter: Cabang: ${filterBranch} | Status: ${filterStatus} | Kondisi: ${filterCondition} | Total: ${filteredAssets.length} Aset</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">No</th>
                ${exportWithImage ? '<th style="padding: 6px 8px;">Foto</th>' : ''}
                <th style="padding: 6px 8px;">Kode Aset</th>
                <th style="padding: 6px 8px;">Nama Aset</th>
                <th style="padding: 6px 8px;">Kategori</th>
                <th style="padding: 6px 8px;">Merk/Model</th>
                <th style="padding: 6px 8px;">No. Seri</th>
                <th style="padding: 6px 8px;">Cabang</th>
                <th style="padding: 6px 8px;">Lokasi</th>
                <th style="padding: 6px 8px;">PIC</th>
                <th style="padding: 6px 8px;">Kondisi</th>
                <th style="padding: 6px 8px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Aset_Tetap_DKL', printWindow);
      setShowExportModal(false);
    } catch (error) {
      console.error('[PRINT ERROR]', error);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExport = async (type: 'pdf' | 'excel' | 'csv') => {
    const opts = {
      title: 'Laporan Registrasi Aset',
      companySettings,
      columns: exportColumns,
      data: filteredAssets,
      filtersText: `Cabang: ${filterBranch} | Status: ${filterStatus} | Kondisi: ${filterCondition}`,
      includeLogo: exportWithLogo,
      includeImages: exportWithImage,
    };

    if (type === 'pdf') await exportToPdf(opts);
    if (type === 'excel') await exportToExcel(opts);
    if (type === 'csv') exportToCsv(opts);
    setShowExportModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Manajemen Aset Tetap</h1>
          <p className="text-xs text-slate-500 mt-1">
            Total {filteredAssets.length} aset terdata sesuai filter yang aktif
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrintAssetList}
            disabled={isPrinting}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan cetakan...' : 'Cetak Aset'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <Link
            to="/barcode"
            className="px-3.5 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold text-xs rounded-xl border border-sky-200 transition flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" /> Cetak Label Barcode
          </Link>
          {role !== 'AUDITOR' && (
            <Link
              to="/assets/new"
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Tambah Aset
            </Link>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari Kode Aset, Barcode, Nama, PIC, Serial..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Branch Filter */}
          <div>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Semua Cabang</option>
              <option value="SINGARAJA">Singaraja</option>
              <option value="TEJAKULA">Tejakula</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="AKTIF">AKTIF</option>
              <option value="BARU">BARU</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
              <option value="RUSAK">RUSAK</option>
              <option value="DALAM PERBAIKAN">DALAM PERBAIKAN</option>
              <option value="HILANG">HILANG</option>
              <option value="DIPINJAM">DIPINJAM</option>
              <option value="DISPOSAL">DISPOSAL</option>
            </select>
          </div>

          {/* Condition Filter */}
          <div>
            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="BAIK">BAIK</option>
              <option value="RUSAK RINGAN">RUSAK RINGAN</option>
              <option value="RUSAK BERAT">RUSAK BERAT</option>
              <option value="HILANG">HILANG</option>
            </select>
          </div>
        </div>
      </div>

      {/* Asset Table / List */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat data aset...</p>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="py-20 text-center">
            <Box className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">Tidak ada aset ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau filter yang dipilih.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Foto</th>
                  <th className="py-3 px-4">Kode & Barcode</th>
                  <th className="py-3 px-4">Nama Aset</th>
                  <th className="py-3 px-4">Kategori / Merk</th>
                  <th className="py-3 px-4">Cabang & Lokasi</th>
                  <th className="py-3 px-4">PIC</th>
                  <th className="py-3 px-4">Kondisi</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      {asset.photoUrl ? (
                        <img
                          src={asset.photoUrl}
                          alt={asset.name}
                          className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                          <Box className="w-5 h-5" />
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <div className="font-bold text-slate-900">{asset.assetCode}</div>
                      <div className="text-[10px] text-slate-400">{asset.barcode}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{asset.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {asset.serialNumber ? `SN: ${asset.serialNumber}` : '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-700">{asset.category}</div>
                      <div className="text-[10px] text-slate-500">
                        {asset.brand} {asset.model}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-sky-700">{asset.branch}</div>
                      <div className="text-[10px] text-slate-500">{asset.location}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">{asset.pic || '-'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getConditionBadge(asset.condition)}`}>
                        {asset.condition}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(asset.status)}`}>
                        {asset.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={`/assets/${asset.id}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition"
                          title="Detail Aset"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {role !== 'AUDITOR' && (
                          <Link
                            to={`/assets/edit/${asset.id}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition"
                            title="Edit Aset"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Link>
                        )}
                        {role === 'ADMIN' && (
                          <button
                            onClick={() => handleSoftDelete(asset)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Hapus Aset"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Options Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-2">Export Laporan Aset</h3>
            <p className="text-xs text-slate-500 mb-4">
              Pilih format dokumen untuk mengekspor {filteredAssets.length} aset yang sedang ditampilkan.
            </p>

            <div className="mb-4 space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={exportWithLogo}
                  onChange={(e) => setExportWithLogo(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <span>Sertakan Logo Perusahaan (Include Logo)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={exportWithImage}
                  onChange={(e) => setExportWithImage(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <span>Sertakan Foto Aset (Include Asset Image)</span>
              </label>
            </div>

            <div className="space-y-2 mb-4">
              <button
                type="button"
                onClick={handlePrintAssetList}
                disabled={isPrinting}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                <Printer className="w-4 h-4" /> {isPrinting ? 'Mempersiapkan cetakan...' : 'Cetak Dokumen Sekarang (Print)'}
              </button>
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
              >
                <FileText className="w-4 h-4" /> Unduh Dokumen PDF
              </button>
              <button
                type="button"
                onClick={() => handleExport('excel')}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
              >
                <FileSpreadsheet className="w-4 h-4" /> Unduh Lembar Kerja Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
              >
                <Download className="w-4 h-4" /> Unduh Format CSV (.csv)
              </button>
            </div>

            <button
              onClick={() => setShowExportModal(false)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
