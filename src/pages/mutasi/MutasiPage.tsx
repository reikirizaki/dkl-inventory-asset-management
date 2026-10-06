import React, { useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  Plus,
  Building2,
  MapPin,
  User,
  ArrowRight,
  CheckCircle,
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
import { Asset } from '../../types';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';

interface MutasiRecord {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  fromLocation: string;
  toLocation: string;
  fromPIC: string;
  toPIC: string;
  reason: string;
  date: string;
  createdBy: string;
  createdAt: string;
}

export const MutasiPage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [records, setRecords] = useState<MutasiRecord[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [toPIC, setToPIC] = useState('');
  const [reason, setReason] = useState('Rotasi Tugas / Penataan Ruangan');
  const [notes, setNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'mutasi'));
      const list: MutasiRecord[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setRecords(list);

      const aSnap = await getDocs(collection(db, 'assets'));
      const aList: Asset[] = [];
      aSnap.forEach((d) => {
        const a = { id: d.id, ...(d.data() as any) } as Asset;
        if (!a.isDeleted) aList.push(a);
      });
      setAssets(aList);
      if (aList.length > 0 && !selectedAssetId) {
        setSelectedAssetId(aList[0].id);
        setToLocation(aList[0].location || '');
        setToPIC(aList[0].pic || '');
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

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  const handleAssetChange = (id: string) => {
    setSelectedAssetId(id);
    const a = assets.find((item) => item.id === id);
    if (a) {
      setToLocation(a.location || '');
      setToPIC(a.pic || '');
    }
  };

  const handleCreateMutasi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

    setSubmitting(true);
    try {
      const mutasiId = doc(collection(db, 'mutasi')).id;

      const newRecord: MutasiRecord = {
        id: mutasiId,
        assetId: selectedAsset.id,
        assetCode: selectedAsset.assetCode,
        assetName: selectedAsset.name,
        fromLocation: selectedAsset.location || '-',
        toLocation: toLocation.trim() || selectedAsset.location,
        fromPIC: selectedAsset.pic || '-',
        toPIC: toPIC.trim() || selectedAsset.pic,
        reason,
        date: new Date().toISOString().split('T')[0],
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'mutasi', mutasiId), newRecord);

      // Update asset's location and PIC
      await updateDoc(doc(db, 'assets', selectedAsset.id), {
        location: toLocation.trim() || selectedAsset.location,
        pic: toPIC.trim() || selectedAsset.pic,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: selectedAsset.id,
        assetCode: selectedAsset.assetCode,
        action: 'MUTASI_ASSIGNMENT',
        details: `Mutasi internal: Lokasi (${selectedAsset.location} -> ${toLocation}), PIC (${selectedAsset.pic} -> ${toPIC}). Alasan: ${reason}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      await logAuditEvent({
        action: 'MUTATION',
        module: 'ASSETS',
        documentId: mutasiId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: selectedAsset.branch,
        details: `Mutasi internal aset ${selectedAsset.assetCode} ke lokasi ${toLocation}, PIC ${toPIC}`,
      });

      setModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Gagal memproses mutasi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-sky-600" />
            <span>Mutasi & Pemindahan Internal</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan perpindahan lokasi ruangan dan serah terima penanggung jawab (PIC) aset
          </p>
        </div>

        {role !== 'AUDITOR' && (
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Mutasi Aset
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat riwayat mutasi...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            Belum ada catatan mutasi internal aset.
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Kode & Nama Aset</th>
                  <th className="py-3 px-4">Perpindahan Lokasi</th>
                  <th className="py-3 px-4">Serah Terima PIC</th>
                  <th className="py-3 px-4">Alasan</th>
                  <th className="py-3 px-4">Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 text-slate-500">{r.date}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{r.assetName}</div>
                      <div className="text-[10px] font-mono text-sky-700">{r.assetCode}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="text-slate-400">{r.fromLocation}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-sky-600" />
                        <span className="font-bold text-slate-800">{r.toLocation}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="text-slate-400">{r.fromPIC}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-bold text-slate-800">{r.toPIC}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.reason}</td>
                    <td className="py-3 px-4 text-slate-400">{r.createdBy?.split('@')[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Mutasi */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Formulir Mutasi & Pemindahan Aset</h3>

            <form onSubmit={handleCreateMutasi} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Aset *</label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => handleAssetChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} - {a.name} ({a.branch})
                    </option>
                  ))}
                </select>
              </div>

              {selectedAsset && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1">
                  <p>
                    Lokasi Saat Ini: <strong className="text-slate-800">{selectedAsset.location || '-'}</strong>
                  </p>
                  <p>
                    PIC Saat Ini: <strong className="text-slate-800">{selectedAsset.pic || '-'}</strong>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Lokasi Ruangan Baru *</label>
                  <input
                    type="text"
                    required
                    placeholder="misal: Ruang Rapat Lt 2"
                    value={toLocation}
                    onChange={(e) => setToLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">PIC Baru (Penanggung Jawab) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nama staf penerima"
                    value={toPIC}
                    onChange={(e) => setToPIC(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alasan Pemindahan *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="Rotasi Tugas / Penataan Ruangan">Rotasi Tugas / Penataan Ruangan</option>
                  <option value="Serah Terima Jabatan / Karyawan Baru">Serah Terima Jabatan / Karyawan Baru</option>
                  <option value="Kebutuhan Proyek Khusus">Kebutuhan Proyek Khusus</option>
                  <option value="Penyimpanan Gudang Sementara">Penyimpanan Gudang Sementara</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
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
                  {submitting ? 'Memproses...' : 'Simpan Mutasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
