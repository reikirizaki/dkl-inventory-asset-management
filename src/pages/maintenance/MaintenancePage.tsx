import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Plus,
  CheckCircle,
  Clock,
  Building2,
  Calendar,
  DollarSign,
  AlertCircle,
  Printer,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  query,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { Asset, Maintenance } from '../../types';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';
import { getCachedCompanySettings } from '../../services/companyService';
import { printReport } from '../../services/printService';

export const MaintenancePage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [records, setRecords] = useState<Maintenance[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [maintenanceType, setMaintenanceType] = useState('Servis Rutin Berkala');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [technician, setTechnician] = useState('');
  const [cost, setCost] = useState<number | ''>('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'maintenance'));
      const list: Maintenance[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setRecords(list);

      const assetSnap = await getDocs(collection(db, 'assets'));
      const assetList: Asset[] = [];
      assetSnap.forEach((d) => {
        const a = { id: d.id, ...(d.data() as any) } as Asset;
        if (!a.isDeleted) assetList.push(a);
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

  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;

    setSubmitting(true);
    try {
      const maintId = doc(collection(db, 'maintenance')).id;
      const newMaint: Maintenance = {
        id: maintId,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        maintenanceType,
        description,
        vendor,
        technician,
        cost: cost === '' ? 0 : Number(cost),
        startDate,
        status: 'OPEN',
        notes,
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'maintenance', maintId), newMaint);

      // Update asset status to MAINTENANCE
      await updateDoc(doc(db, 'assets', asset.id), {
        status: 'MAINTENANCE',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: asset.id,
        assetCode: asset.assetCode,
        action: 'MAINTENANCE_SCHEDULED',
        details: `Jadwal maintenance (${maintenanceType}) dimulai oleh ${user?.email}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      await logAuditEvent({
        action: 'MAINTENANCE',
        module: 'MAINTENANCE',
        documentId: maintId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: asset.branch,
        details: `Jadwal maintenance dibuat untuk ${asset.assetCode} - ${asset.name}`,
      });

      setModalOpen(false);
      setDescription('');
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Gagal menjadwalkan maintenance.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteMaintenance = async (maint: Maintenance) => {
    try {
      await updateDoc(doc(db, 'maintenance', maint.id), {
        status: 'COMPLETED',
        endDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
      });

      // Restore asset status to AKTIF
      await updateDoc(doc(db, 'assets', maint.assetId), {
        status: 'AKTIF',
        condition: 'BAIK',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: maint.assetId,
        assetCode: maint.assetCode,
        action: 'MAINTENANCE_COMPLETED',
        details: `Maintenance selesai. Aset kembali berstatus AKTIF dan kondisi BAIK.`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      fetchData();
    } catch (e) {
      console.error(e);
      alert('Gagal menyelesaikan tiket maintenance.');
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintMaintenance = () => {
    console.log('[PRINT][MAINTENANCE] button clicked');
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
              <p style="font-weight: 700; margin: 0;">LAPORAN MAINTENANCE & PERAWATAN</p>
              <p style="margin: 2px 0 0 0;">Tgl: ${new Date().toLocaleDateString('id-ID')}</p>
            </div>
          </div>
          <p style="font-size: 10px; color: #64748b; margin-bottom: 10px;">Total: ${records.length} Jadwal & Riwayat Maintenance</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">No</th>
                <th style="padding: 6px 8px;">Kode Aset</th>
                <th style="padding: 6px 8px;">Nama Aset</th>
                <th style="padding: 6px 8px;">Jenis Maintenance</th>
                <th style="padding: 6px 8px;">Teknisi / Vendor</th>
                <th style="padding: 6px 8px;">Biaya (Rp)</th>
                <th style="padding: 6px 8px;">Tgl Mulai</th>
                <th style="padding: 6px 8px;">Status</th>
                <th style="padding: 6px 8px;">Deskripsi</th>
              </tr>
            </thead>
            <tbody>
              ${records.map((r, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 6px 8px; color: #94a3b8; font-weight: 700;">${idx + 1}</td>
                  <td style="padding: 6px 8px; font-weight: 700; color: #0369a1; font-family: monospace;">${r.assetCode}</td>
                  <td style="padding: 6px 8px; font-weight: 700;">${r.assetName}</td>
                  <td style="padding: 6px 8px;">${r.maintenanceType}</td>
                  <td style="padding: 6px 8px;">${r.technician || r.vendor || '-'}</td>
                  <td style="padding: 6px 8px; font-family: monospace;">${r.cost ? `Rp ${Number(r.cost).toLocaleString('id-ID')}` : '-'}</td>
                  <td style="padding: 6px 8px;">${r.startDate}</td>
                  <td style="padding: 6px 8px;"><span style="font-weight: 700;">${r.status}</span></td>
                  <td style="padding: 6px 8px;">${r.description || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Maintenance_Aset_DKL', printWindow);
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
            <Wrench className="w-5 h-5 text-sky-600" />
            <span>Perawatan Berkala & Maintenance</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Penjadwalan servis rutin, ganti oli, kalibrasi alat, dan perawatan preventif PT DKL
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintMaintenance}
            disabled={isPrinting}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan...' : 'Cetak Maintenance'}</span>
          </button>
          {role !== 'AUDITOR' && (
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Jadwalkan Perawatan
            </button>
          )}
        </div>
      </div>

      {/* Maintenance Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat catatan perawatan...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center">
            <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">Belum ada catatan maintenance</p>
            <p className="text-xs text-slate-400 mt-1">Jadwalkan perawatan berkala untuk menjaga keandalan aset.</p>
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Kode & Nama Aset</th>
                  <th className="py-3 px-4">Tipe Perawatan</th>
                  <th className="py-3 px-4">Teknisi / Vendor</th>
                  <th className="py-3 px-4">Biaya (Rp)</th>
                  <th className="py-3 px-4">Tanggal Mulai</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{r.assetName}</div>
                      <div className="text-[10px] font-mono text-sky-700">{r.assetCode}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {r.maintenanceType}
                      {r.description && <p className="text-[10px] text-slate-400 font-normal">{r.description}</p>}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-600">
                      {r.technician || r.vendor || '-'}
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-700">
                      {r.cost ? `Rp ${Number(r.cost).toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.startDate}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          r.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {r.status !== 'COMPLETED' && role !== 'AUDITOR' && (
                        <button
                          onClick={() => handleCompleteMaintenance(r)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg transition"
                        >
                          Selesai
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

      {/* Modal Jadwalkan */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Jadwalkan Perawatan (Maintenance)</h3>

            <form onSubmit={handleCreateMaintenance} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Aset Fisik *</label>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipe Maintenance *</label>
                  <select
                    value={maintenanceType}
                    onChange={(e) => setMaintenanceType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  >
                    <option value="Servis Rutin Berkala">Servis Rutin Berkala</option>
                    <option value="Pembersihan & Kalibrasi">Pembersihan & Kalibrasi</option>
                    <option value="Penggantian Sparepart Aus">Penggantian Sparepart Aus</option>
                    <option value="Inspeksi Kelayakan Keselamatan">Inspeksi Kelayakan Keselamatan</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Mulai *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Teknisi / Montir</label>
                  <input
                    type="text"
                    placeholder="Nama teknisi internal"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vendor Eksternal</label>
                  <input
                    type="text"
                    placeholder="Bengkel / Service Center"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Estimasi Biaya (Rp)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Deskripsi Tindakan Perawatan</label>
                <textarea
                  rows={2}
                  placeholder="Rincian part yang diganti, batas jam pakai, dsb."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {submitting ? 'Menjadwalkan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
