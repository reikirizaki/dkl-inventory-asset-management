import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Plus,
  CheckCircle,
  AlertOctagon,
  Camera,
  Upload,
  Calendar,
  DollarSign,
  Wrench,
  Trash2,
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
import { Asset, Repair, RepairStatus } from '../../types';
import { uploadImageToCloudinary } from '../../services/cloudinary';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';
import { getCachedCompanySettings } from '../../services/companyService';
import { printReport } from '../../services/printService';

export const RepairsPage: React.FC = () => {
  const { user, role } = useAuth();
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [problem, setProblem] = useState('');
  const [repairAction, setRepairAction] = useState('');
  const [technician, setTechnician] = useState('');
  const [vendor, setVendor] = useState('');
  const [cost, setCost] = useState<number | ''>('');
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [beforePreview, setBeforePreview] = useState<string | null>(null);

  // Finish modal
  const [finishingRepair, setFinishingRepair] = useState<Repair | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [finishActionNotes, setFinishActionNotes] = useState('');
  const [finalCost, setFinalCost] = useState<number | ''>('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'repairs'));
      const list: Repair[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setRepairs(list);

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

  const handleCreateRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;

    setSubmitting(true);
    try {
      let beforePhotoUrl = '';
      let beforePhotoPublicId = '';

      if (beforeFile) {
        const uploadRes = await uploadImageToCloudinary(beforeFile);
        beforePhotoUrl = uploadRes.secure_url;
        beforePhotoPublicId = uploadRes.public_id;
      }

      const repairId = doc(collection(db, 'repairs')).id;
      const repairNumber = `REP-${Date.now().toString().slice(-8)}`;

      const newRepair: Repair = {
        id: repairId,
        repairNumber,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        repairDate: new Date().toISOString().split('T')[0],
        problem,
        repairAction,
        technician,
        vendor,
        cost: cost === '' ? 0 : Number(cost),
        startDate: new Date().toISOString().split('T')[0],
        status: 'DALAM PERBAIKAN',
        beforePhoto: beforePhotoUrl,
        beforePhotoPublicId,
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'repairs', repairId), newRepair);

      // Update asset condition to RUSAK and status to DALAM PERBAIKAN
      await updateDoc(doc(db, 'assets', asset.id), {
        status: 'DALAM PERBAIKAN',
        condition: 'RUSAK BERAT',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: asset.id,
        assetCode: asset.assetCode,
        action: 'REPAIR_STARTED',
        details: `Tiket perbaikan ${repairNumber} dibuat. Masalah: ${problem}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      await logAuditEvent({
        action: 'REPAIR',
        module: 'REPAIRS',
        documentId: repairId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: asset.branch,
        details: `Pengajuan perbaikan aset: ${asset.assetCode} - Masalah: ${problem}`,
      });

      setModalOpen(false);
      setProblem('');
      setBeforeFile(null);
      setBeforePreview(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Gagal membuat tiket perbaikan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishRepairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finishingRepair) return;

    setSubmitting(true);
    try {
      let afterPhotoUrl = '';
      let afterPhotoPublicId = '';

      if (afterFile) {
        const uploadRes = await uploadImageToCloudinary(afterFile);
        afterPhotoUrl = uploadRes.secure_url;
        afterPhotoPublicId = uploadRes.public_id;
      }

      await updateDoc(doc(db, 'repairs', finishingRepair.id), {
        status: 'SELESAI DIPERBAIKI',
        finishDate: new Date().toISOString().split('T')[0],
        afterPhoto: afterPhotoUrl,
        afterPhotoPublicId,
        repairAction: finishActionNotes || finishingRepair.repairAction,
        cost: finalCost === '' ? finishingRepair.cost : Number(finalCost),
        updatedAt: new Date().toISOString(),
      });

      // Restore asset to AKTIF and condition BAIK
      await updateDoc(doc(db, 'assets', finishingRepair.assetId), {
        status: 'AKTIF',
        condition: 'BAIK',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: finishingRepair.assetId,
        assetCode: finishingRepair.assetCode,
        action: 'REPAIR_FINISHED',
        details: `Perbaikan selesai. Tindakan: ${finishActionNotes}. Aset kembali berstatus AKTIF.`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      setFinishingRepair(null);
      setAfterFile(null);
      setAfterPreview(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Gagal menyelesaikan perbaikan.');
    } finally {
      setSubmitting(false);
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintRepairs = () => {
    console.log('[PRINT][REPAIR] button clicked');
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
              <p style="font-weight: 700; margin: 0;">LAPORAN PERBAIKAN ASET (REPAIR)</p>
              <p style="margin: 2px 0 0 0;">Tgl: ${new Date().toLocaleDateString('id-ID')}</p>
            </div>
          </div>
          <p style="font-size: 10px; color: #64748b; margin-bottom: 10px;">Total: ${repairs.length} Tiket Perbaikan</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">No</th>
                <th style="padding: 6px 8px;">No. Perbaikan</th>
                <th style="padding: 6px 8px;">Kode Aset</th>
                <th style="padding: 6px 8px;">Nama Aset</th>
                <th style="padding: 6px 8px;">Tgl Lapor</th>
                <th style="padding: 6px 8px;">Keluhan Kerusakan</th>
                <th style="padding: 6px 8px;">Teknisi / Vendor</th>
                <th style="padding: 6px 8px;">Biaya (Rp)</th>
                <th style="padding: 6px 8px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${repairs.map((r, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 6px 8px; color: #94a3b8; font-weight: 700;">${idx + 1}</td>
                  <td style="padding: 6px 8px; font-weight: 700; color: #0369a1; font-family: monospace;">${r.repairNumber}</td>
                  <td style="padding: 6px 8px; font-family: monospace;">${r.assetCode}</td>
                  <td style="padding: 6px 8px; font-weight: 700;">${r.assetName}</td>
                  <td style="padding: 6px 8px;">${r.repairDate}</td>
                  <td style="padding: 6px 8px;">${r.problem}</td>
                  <td style="padding: 6px 8px;">${r.technician || r.vendor || '-'}</td>
                  <td style="padding: 6px 8px; font-family: monospace;">${r.cost ? `Rp ${Number(r.cost).toLocaleString('id-ID')}` : '-'}</td>
                  <td style="padding: 6px 8px;"><span style="font-weight: 700;">${r.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Perbaikan_Aset_DKL', printWindow);
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
            <RefreshCw className="w-5 h-5 text-sky-600" />
            <span>Manajemen Perbaikan (Repairs)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Penanganan aset rusak, dokumentasi foto Sebelum & Sesudah perbaikan via Cloudinary
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintRepairs}
            disabled={isPrinting}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan...' : 'Cetak Perbaikan'}</span>
          </button>
          {role !== 'AUDITOR' && (
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Ajukan Perbaikan
            </button>
          )}
        </div>
      </div>

      {/* Repairs Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat tiket perbaikan...</p>
          </div>
        ) : repairs.length === 0 ? (
          <div className="py-16 text-center">
            <AlertOctagon className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">Tidak ada tiket perbaikan</p>
            <p className="text-xs text-slate-400 mt-1">Semua aset saat ini dalam kondisi baik atau belum dilaporkan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Foto Bukti</th>
                  <th className="py-3 px-4">No. Tiket & Aset</th>
                  <th className="py-3 px-4">Masalah Kerusakan</th>
                  <th className="py-3 px-4">Teknisi / Bengkel</th>
                  <th className="py-3 px-4">Biaya (Rp)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repairs.map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {rep.beforePhoto ? (
                          <img
                            src={rep.beforePhoto}
                            alt="Before"
                            className="w-10 h-10 object-cover rounded-lg border border-rose-300 shadow-2xs"
                            title="Foto Sebelum Perbaikan"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-[9px] font-bold">
                            No Foto
                          </div>
                        )}
                        {rep.afterPhoto && (
                          <img
                            src={rep.afterPhoto}
                            alt="After"
                            className="w-10 h-10 object-cover rounded-lg border border-emerald-300 shadow-2xs"
                            title="Foto Sesudah Selesai"
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-sky-800">{rep.repairNumber}</div>
                      <div className="font-bold text-slate-900 mt-0.5">{rep.assetName}</div>
                      <div className="text-[10px] text-slate-400">{rep.assetCode}</div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-rose-700">{rep.problem}</p>
                      {rep.repairAction && (
                        <p className="text-[10px] text-emerald-700 mt-0.5">Tindakan: {rep.repairAction}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">
                      {rep.technician || rep.vendor || '-'}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {rep.cost ? `Rp ${Number(rep.cost).toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          rep.status === 'SELESAI DIPERBAIKI'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {rep.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {rep.status !== 'SELESAI DIPERBAIKI' && role !== 'AUDITOR' && (
                        <button
                          onClick={() => {
                            setFinishingRepair(rep);
                            setFinalCost(rep.cost ?? '');
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg transition"
                        >
                          Selesaikan
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

      {/* Modal Ajukan Perbaikan */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Ajukan Tiket Perbaikan Aset</h3>

            <form onSubmit={handleCreateRepair} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Aset Fisik Rusak *</label>
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
                <label className="block font-bold text-slate-700 mb-1">Rincian Masalah / Kerusakan *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="misal: Mati total, layar pecah, motor mesin mengeluarkan asap"
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Teknisi Penanggung Jawab</label>
                  <input
                    type="text"
                    placeholder="Nama teknisi internal"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vendor / Bengkel Eksternal</label>
                  <input
                    type="text"
                    placeholder="Nama bengkel rekanan"
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

              {/* Foto Bukti Kerusakan (Before) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Foto Bukti Kerusakan (Sebelum Perbaikan - Cloudinary)
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {beforePreview ? (
                      <img src={beforePreview} alt="Before" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 font-bold rounded-lg cursor-pointer">
                    <span>Pilih Foto</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setBeforeFile(e.target.files[0]);
                          setBeforePreview(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
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
                  {submitting ? 'Menyimpan...' : 'Ajukan Tiket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Selesaikan Perbaikan (After Photo) */}
      {finishingRepair && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Konfirmasi Selesai Perbaikan ({finishingRepair.repairNumber})
            </h3>
            <p className="text-xs text-slate-500">
              Aset: <strong className="text-slate-800">{finishingRepair.assetName}</strong>
            </p>

            <form onSubmit={handleFinishRepairSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tindakan Perbaikan yang Dilakukan *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Part yang diganti, hasil uji kelayakan, kondisi terakhir..."
                  value={finishActionNotes}
                  onChange={(e) => setFinishActionNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Total Biaya Riil (Rp)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={finalCost}
                  onChange={(e) => setFinalCost(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              {/* Foto Sesudah Perbaikan (After) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Foto Bukti Kondisi Selesai (Sesudah Perbaikan - Cloudinary)
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {afterPreview ? (
                      <img src={afterPreview} alt="After" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 font-bold rounded-lg cursor-pointer">
                    <span>Pilih Foto</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setAfterFile(e.target.files[0]);
                          setAfterPreview(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setFinishingRepair(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {submitting ? 'Memproses...' : 'Selesaikan & Aktifkan Kembali Aset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
