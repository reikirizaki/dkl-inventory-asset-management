import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle,
  AlertTriangle,
  Building2,
  Calendar,
  User,
  MapPin,
  RefreshCw,
  Printer,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { Asset, AssetCondition } from '../../types';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';
import { getCachedCompanySettings } from '../../services/companyService';
import { printReport } from '../../services/printService';

export const LostFoundPage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [lostAssets, setLostAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  // Recovery modal
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [foundLocation, setFoundLocation] = useState('');
  const [foundBy, setFoundBy] = useState(user?.displayName || '');
  const [conditionAfterFound, setConditionAfterFound] = useState<AssetCondition>('BAIK');
  const [recoveryNotes, setRecoveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchLostAssets = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'assets'), where('status', '==', 'HILANG'));
      const snap = await getDocs(q);
      const list: Asset[] = [];
      snap.forEach((d) => {
        const data = { id: d.id, ...(d.data() as any) } as Asset;
        if (!data.isDeleted) list.push(data);
      });
      setLostAssets(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLostAssets();
  }, []);

  const handleRecoverAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

    setSubmitting(true);
    try {
      // 1. Update asset back to AKTIF and set new location/condition
      await updateDoc(doc(db, 'assets', selectedAsset.id), {
        status: 'AKTIF',
        condition: conditionAfterFound,
        location: foundLocation || selectedAsset.location,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      // 2. Log asset history
      await logAssetHistory({
        assetId: selectedAsset.id,
        assetCode: selectedAsset.assetCode,
        action: 'ASSET_FOUND_RECOVERED',
        details: `Aset ditemukan kembali di ${foundLocation} oleh ${foundBy}. Kondisi fisik: ${conditionAfterFound}. Catatan: ${recoveryNotes}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      // 3. Log audit
      await logAuditEvent({
        action: 'ASSET_RECOVERY',
        module: 'ASSETS',
        documentId: selectedAsset.id,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: selectedAsset.branch,
        details: `Aset hilang ${selectedAsset.assetCode} berhasil ditemukan kembali dan diaktifkan.`,
      });

      setSelectedAsset(null);
      setFoundLocation('');
      setRecoveryNotes('');
      fetchLostAssets();
    } catch (err) {
      console.error(err);
      alert('Gagal memproses pemulihan aset.');
    } finally {
      setSubmitting(false);
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintLost = () => {
    console.log('[PRINT][LOST] button clicked');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
      return;
    }

    setIsPrinting(true);
    const companySettings = getCachedCompanySettings();
    try {
      const reportHtml = `
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 12px; color: #0f172a;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              ${companySettings.logoUrl ? `<img src="${companySettings.logoUrl}" style="height: 48px; object-fit: contain;" alt="Logo" />` : ''}
              <div>
                <h2 style="font-size: 16px; font-weight: 800; margin: 0; text-transform: uppercase;">${companySettings.companyName || 'PT DARMA KARYA LESTARI'}</h2>
                <p style="font-size: 11px; font-weight: 700; color: #0284c7; margin: 2px 0 0 0; text-transform: uppercase;">DKL INVENTORY & ASSET MANAGEMENT</p>
                <p style="font-size: 10px; color: #64748b; margin: 2px 0 0 0;">${companySettings.companyAddress || 'Singaraja & Tejakula, Bali'}</p>
              </div>
            </div>
            <div style="text-align: right; font-size: 10px; color: #475569;">
              <p style="font-weight: 700; margin: 0;">LAPORAN BARANG HILANG (LOST & FOUND)</p>
              <p style="margin: 2px 0 0 0;">Tgl: ${new Date().toLocaleDateString('id-ID')}</p>
            </div>
          </div>
          <p style="font-size: 10px; color: #64748b; margin-bottom: 10px;">Total: ${lostAssets.length} Aset Dalam Pencarian</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">No</th>
                <th style="padding: 6px 8px;">Kode Aset</th>
                <th style="padding: 6px 8px;">Nama Aset</th>
                <th style="padding: 6px 8px;">Kategori</th>
                <th style="padding: 6px 8px;">Cabang</th>
                <th style="padding: 6px 8px;">Lokasi Terakhir</th>
                <th style="padding: 6px 8px;">PIC Terakhir</th>
                <th style="padding: 6px 8px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${lostAssets.map((a, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 6px 8px; color: #94a3b8; font-weight: 700;">${idx + 1}</td>
                  <td style="padding: 6px 8px; font-weight: 700; color: #0369a1; font-family: monospace;">${a.assetCode}</td>
                  <td style="padding: 6px 8px; font-weight: 700;">${a.name}</td>
                  <td style="padding: 6px 8px;">${a.category}</td>
                  <td style="padding: 6px 8px;">${a.branch}</td>
                  <td style="padding: 6px 8px;">${a.location || '-'}</td>
                  <td style="padding: 6px 8px;">${a.pic || '-'}</td>
                  <td style="padding: 6px 8px;"><span style="font-weight: 700; color: #9333ea;">DALAM PENCARIAN</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Barang_Hilang_DKL', printWindow);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Search className="w-5 h-5 text-purple-600" />
            <span>Pelacakan Barang Hilang & Ditemukan (Lost & Found)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Daftar seluruh aset berstatus HILANG yang dalam proses pencarian atau siap dikonfirmasi penemuannya
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handlePrintLost}
            disabled={isPrinting}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan...' : 'Cetak Laporan Hilang'}</span>
          </button>
        </div>
      </div>

      {/* Lost Assets Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat data barang hilang...</p>
          </div>
        ) : lostAssets.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">Tidak ada aset dalam status hilang</p>
            <p className="text-xs text-slate-400 mt-1">Semua aset fisik terdata dengan aman di lokasi masing-masing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Kode & Nama Aset</th>
                  <th className="py-3 px-4">Kategori / Merk</th>
                  <th className="py-3 px-4">Cabang</th>
                  <th className="py-3 px-4">Lokasi Terakhir</th>
                  <th className="py-3 px-4">PIC Terakhir</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lostAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-purple-700">{asset.assetCode}</div>
                      <div className="font-bold text-slate-900 mt-0.5">{asset.name}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {asset.category} {asset.brand && `• ${asset.brand}`}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700">{asset.branch}</td>
                    <td className="py-3 px-4 text-slate-600">{asset.location || '-'}</td>
                    <td className="py-3 px-4 text-slate-700 font-medium">{asset.pic || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        DALAM PENCARIAN
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {role !== 'AUDITOR' && (
                        <button
                          onClick={() => {
                            setSelectedAsset(asset);
                            setFoundLocation(asset.location || '');
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-2xs transition"
                        >
                          Konfirmasi Ditemukan
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Recovery */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Konfirmasi Aset Ditemukan Kembali
            </h3>
            <p className="text-xs text-slate-500">
              Aset: <strong className="text-slate-800">{selectedAsset.assetCode} - {selectedAsset.name}</strong>
            </p>

            <form onSubmit={handleRecoverAsset} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Lokasi Tempat Ditemukan *</label>
                <input
                  type="text"
                  required
                  placeholder="misal: Gudang Belakang, Ruang Arsip Lantai 1"
                  value={foundLocation}
                  onChange={(e) => setFoundLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ditemukan Oleh *</label>
                <input
                  type="text"
                  required
                  value={foundBy}
                  onChange={(e) => setFoundBy(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Kondisi Fisik Saat Ditemukan *</label>
                <select
                  value={conditionAfterFound}
                  onChange={(e) => setConditionAfterFound(e.target.value as AssetCondition)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="BAIK">BAIK (Normal Operasional)</option>
                  <option value="RUSAK RINGAN">RUSAK RINGAN (Perlu Perawatan)</option>
                  <option value="RUSAK BERAT">RUSAK BERAT</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Pemeriksaan</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan kondisi kelengkapan part, pengujian kelayakan..."
                  value={recoveryNotes}
                  onChange={(e) => setRecoveryNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {submitting ? 'Memproses...' : 'Aktifkan Kembali Aset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
