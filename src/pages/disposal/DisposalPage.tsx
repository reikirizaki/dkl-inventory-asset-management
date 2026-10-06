import React, { useState, useEffect } from 'react';
import {
  Trash2,
  Plus,
  Building2,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Printer,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { Asset, Disposal } from '../../types';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';
import { getCachedCompanySettings } from '../../services/companyService';
import { printReport } from '../../services/printService';

export const DisposalPage: React.FC = () => {
  const { user, role } = useAuth();
  const [disposals, setDisposals] = useState<Disposal[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [reason, setReason] = useState('Rusak Berat & Tidak Ekonomis Diperbaiki');
  const [method, setMethod] = useState('Scrap / Besi Tua');
  const [value, setValue] = useState<number | ''>('');
  const [approvedBy, setApprovedBy] = useState(user?.displayName || 'Direksi');
  const [notes, setNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'disposals'));
      const list: Disposal[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setDisposals(list);

      const assetSnap = await getDocs(collection(db, 'assets'));
      const assetList: Asset[] = [];
      assetSnap.forEach((d) => {
        const a = { id: d.id, ...(d.data() as any) } as Asset;
        if (!a.isDeleted && a.status !== 'DISPOSAL') assetList.push(a);
      });
      setAssets(assetList);
      if (assetList.length > 0 && !selectedAssetId) {
        setSelectedAssetId(assetList[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateDisposal = async (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;

    if (role !== 'ADMIN') {
      alert('Hanya Administrator yang memiliki wewenang menyetujui penghapusan aset.');
      return;
    }

    setSubmitting(true);
    try {
      const disposalId = doc(collection(db, 'disposals')).id;
      const newDisposal: Disposal = {
        id: disposalId,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        reason,
        method,
        date: new Date().toISOString().split('T')[0],
        approvedBy,
        value: value === '' ? 0 : Number(value),
        notes,
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'disposals', disposalId), newDisposal);

      // Update asset status to DISPOSAL (preserves history, does not delete row)
      await updateDoc(doc(db, 'assets', asset.id), {
        status: 'DISPOSAL',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: asset.id,
        assetCode: asset.assetCode,
        action: 'ASSET_DISPOSED',
        details: `Aset resmi dihapuskan (Disposal) melalui metode: ${method}. Disetujui oleh: ${approvedBy}. Nilai sisa: Rp ${value || 0}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      await logAuditEvent({
        action: 'DISPOSAL',
        module: 'DISPOSALS',
        documentId: disposalId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: asset.branch,
        details: `Penghapusan aset: ${asset.assetCode} (${asset.name}) disetujui oleh ${approvedBy}`,
      });

      setModalOpen(false);
      setNotes('');
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Gagal memproses penghapusan aset.');
    } finally {
      setSubmitting(false);
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintDisposal = () => {
    console.log('[PRINT][DISPOSAL] button clicked');
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
              <p style="font-weight: 700; margin: 0;">LAPORAN PENGHAPUSAN ASET (DISPOSAL)</p>
              <p style="margin: 2px 0 0 0;">Tgl: ${new Date().toLocaleDateString('id-ID')}</p>
            </div>
          </div>
          <p style="font-size: 10px; color: #64748b; margin-bottom: 10px;">Total: ${disposals.length} Aset Dihapuskan</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">No</th>
                <th style="padding: 6px 8px;">Kode Aset</th>
                <th style="padding: 6px 8px;">Nama Aset</th>
                <th style="padding: 6px 8px;">Alasan Penghapusan</th>
                <th style="padding: 6px 8px;">Disetujui Oleh</th>
                <th style="padding: 6px 8px;">Nilai Residu (Rp)</th>
                <th style="padding: 6px 8px;">Metode</th>
                <th style="padding: 6px 8px;">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              ${disposals.map((d, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 6px 8px; color: #94a3b8; font-weight: 700;">${idx + 1}</td>
                  <td style="padding: 6px 8px; font-weight: 700; color: #0369a1; font-family: monospace;">${d.assetCode}</td>
                  <td style="padding: 6px 8px; font-weight: 700;">${d.assetName}</td>
                  <td style="padding: 6px 8px;">${d.reason}</td>
                  <td style="padding: 6px 8px;">${d.approvedBy}</td>
                  <td style="padding: 6px 8px; font-family: monospace;">${d.value ? `Rp ${Number(d.value).toLocaleString('id-ID')}` : '-'}</td>
                  <td style="padding: 6px 8px;">${d.method || '-'}</td>
                  <td style="padding: 6px 8px;">${d.date}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Disposal_Aset_DKL', printWindow);
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
            <Trash2 className="w-5 h-5 text-slate-600" />
            <span>Penghapusan Aset (Disposal & Write-off)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan resmi aset yang tidak lagi ekonomis, dilelang, atau dimusnahkan dengan persetujuan pimpinan
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintDisposal}
            disabled={isPrinting}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan...' : 'Cetak Disposal'}</span>
          </button>
          {role === 'ADMIN' && (
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Ajukan Penghapusan Aset
            </button>
          )}
        </div>
      </div>

      {/* Disposals Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat riwayat disposal...</p>
          </div>
        ) : disposals.length === 0 ? (
          <div className="py-16 text-center">
            <Trash2 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">Belum ada aset yang dihapuskan</p>
            <p className="text-xs text-slate-400 mt-1">
              Seluruh aset fisik masih beroperasi atau berada dalam siklus pemeliharaan aktif.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Kode & Nama Aset</th>
                  <th className="py-3 px-4">Alasan Penghapusan</th>
                  <th className="py-3 px-4">Metode Disposal</th>
                  <th className="py-3 px-4">Nilai Sisa (Rp)</th>
                  <th className="py-3 px-4">Disetujui Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {disposals.map((disp) => (
                  <tr key={disp.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 text-slate-500">{disp.date}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{disp.assetName}</div>
                      <div className="text-[10px] font-mono text-slate-500">{disp.assetCode}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">{disp.reason}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-800">
                        {disp.method}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {disp.value ? `Rp ${Number(disp.value).toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">{disp.approvedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Ajukan Disposal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Formulir Persetujuan Penghapusan Aset</h3>
            <p className="text-xs text-rose-600 font-semibold">
              Perhatian: Tindakan ini akan mengakhiri masa operasional aset. Riwayat dan audit aset tetap tersimpan.
            </p>

            <form onSubmit={handleCreateDisposal} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Aset yang Dihapuskan *</label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} - {a.name} ({a.branch})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alasan Penghapusan *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="Rusak Berat & Tidak Ekonomis Diperbaiki">Rusak Berat & Tidak Ekonomis Diperbaiki</option>
                  <option value="Habis Masa Manfaat / Usang (Obsolete)">Habis Masa Manfaat / Usang (Obsolete)</option>
                  <option value="Hilang Tidak Ditemukan Setelah Investigasi">Hilang Tidak Ditemukan Setelah Investigasi</option>
                  <option value="Pelelangan Aset">Pelelangan Aset</option>
                  <option value="Hibah / Donasi">Hibah / Donasi</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Metode Eksekusi *</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  >
                    <option value="Scrap / Besi Tua">Scrap / Besi Tua</option>
                    <option value="Lelang Terbuka">Lelang Terbuka</option>
                    <option value="Pemusnahan Fisik">Pemusnahan Fisik</option>
                    <option value="Tukar Tambah (Trade-in)">Tukar Tambah (Trade-in)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nilai Sisa / Hasil Lelang (Rp)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Disetujui Oleh (Otoritas) *</label>
                <input
                  type="text"
                  required
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Berita Acara / Catatan</label>
                <textarea
                  rows={2}
                  placeholder="Nomor Berita Acara Pemusnahan/Pelelangan dan saksi..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {submitting ? 'Memproses...' : 'Setujui & Hapus Aset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
