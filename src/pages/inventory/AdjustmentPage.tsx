import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  SlidersHorizontal,
  Package,
  CheckCircle,
  AlertCircle,
  Building2,
  Calendar,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  query,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { InventoryItem, StockAdjustment } from '../../types';
import { logAuditEvent } from '../../services/auditService';

export const AdjustmentPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedItemId = searchParams.get('itemId');

  const { user, role, branch } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [newStock, setNewStock] = useState<number | ''>('');
  const [reason, setReason] = useState('Hasil Stock Opname Fisik');
  const [customReason, setCustomReason] = useState('');

  const fetchItemsAndLogs = async () => {
    try {
      const snap = await getDocs(collection(db, 'inventory_items'));
      const list: InventoryItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setItems(list);

      if (preselectedItemId && list.some((i) => i.id === preselectedItemId)) {
        setSelectedItemId(preselectedItemId);
      } else if (list.length > 0 && !selectedItemId) {
        setSelectedItemId(list[0].id);
      }

      const adjSnap = await getDocs(query(collection(db, 'stock_adjustments'), limit(20)));
      const adjList: StockAdjustment[] = [];
      adjSnap.forEach((d) => adjList.push({ id: d.id, ...(d.data() as any) }));
      adjList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setAdjustments(adjList);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchItemsAndLogs();
  }, [preselectedItemId]);

  const selectedItem = items.find((i) => i.id === selectedItemId);

  useEffect(() => {
    if (selectedItem) {
      setNewStock(selectedItem.currentStock);
    }
  }, [selectedItem]);

  const difference = selectedItem && newStock !== '' ? Number(newStock) - selectedItem.currentStock : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedItem) {
      setErrorMsg('Pilih item barang yang disesuaikan.');
      return;
    }

    if (newStock === '' || Number(newStock) < 0) {
      setErrorMsg('Stok baru harus berupa angka positif atau nol.');
      return;
    }

    if (difference === 0) {
      setErrorMsg('Stok baru sama dengan stok saat ini (tidak ada perubahan).');
      return;
    }

    const finalReason = reason === 'Lainnya' ? customReason.trim() : reason;
    if (!finalReason) {
      setErrorMsg('Alasan penyesuaian stok wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const adjId = doc(collection(db, 'stock_adjustments')).id;

      const adjPayload: StockAdjustment = {
        id: adjId,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        branch: selectedItem.branch,
        oldStock: selectedItem.currentStock,
        newStock: Number(newStock),
        difference,
        reason: finalReason,
        performedBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };
      batch.set(doc(db, 'stock_adjustments', adjId), adjPayload);

      // Update currentStock
      batch.update(doc(db, 'inventory_items', selectedItem.id), {
        currentStock: Number(newStock),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await batch.commit();

      // Log audit
      await logAuditEvent({
        action: 'STOCK_ADJUSTMENT',
        module: 'INVENTORY',
        documentId: adjId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: selectedItem.branch,
        details: `Penyesuaian stok ${selectedItem.name}: ${selectedItem.currentStock} -> ${newStock} (${difference > 0 ? '+' : ''}${difference} ${selectedItem.unit}). Alasan: ${finalReason}`,
      });

      setSuccessMsg(`Stok berhasil disesuaikan menjadi ${newStock} ${selectedItem.unit}.`);
      fetchItemsAndLogs();
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal memproses penyesuaian stok.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-sky-600" />
          <span>Penyesuaian Stok (Stock Adjustment)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Koreksi fisik selisih stok karena opname, barang rusak tidak terduga, atau kesalahan entri
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-700 flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-start gap-2.5">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* Select Item */}
          <div className="lg:col-span-3">
            <label className="block font-bold text-slate-700 mb-1">Pilih Item Barang *</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-sky-500"
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.itemCode} - {i.name} (Stok Sistem: {i.currentStock} {i.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Current Stock Preview */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-400">Stok Sistem Saat Ini</span>
            <p className="text-xl font-black text-slate-800 mt-1">
              {selectedItem?.currentStock ?? 0} <span className="text-xs text-slate-500 font-normal">{selectedItem?.unit}</span>
            </p>
          </div>

          {/* New Stock Input */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Stok Fisik Baru (Hasil Koreksi) *
            </label>
            <input
              type="number"
              required
              min={0}
              value={newStock}
              onChange={(e) => setNewStock(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900 text-lg"
            />
          </div>

          {/* Difference Calculation */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-400">Selisih Penyesuaian</span>
            <p
              className={`text-xl font-black mt-1 ${
                difference > 0
                  ? 'text-emerald-600'
                  : difference < 0
                  ? 'text-rose-600'
                  : 'text-slate-500'
              }`}
            >
              {difference > 0 ? `+${difference}` : difference}{' '}
              <span className="text-xs text-slate-500 font-normal">{selectedItem?.unit}</span>
            </p>
          </div>

          {/* Reason */}
          <div className="lg:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">Alasan Penyesuaian *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
            >
              <option value="Hasil Stock Opname Fisik">Hasil Stock Opname Fisik</option>
              <option value="Barang Rusak / Kadaluarsa di Gudang">Barang Rusak / Kadaluarsa di Gudang</option>
              <option value="Barang Hilang / Selisih Hitung">Barang Hilang / Selisih Hitung</option>
              <option value="Koreksi Salah Input Transaksi Sebelumnya">Koreksi Salah Input Transaksi Sebelumnya</option>
              <option value="Lainnya">Lainnya (Tulis Manual)</option>
            </select>
          </div>

          {reason === 'Lainnya' && (
            <div className="lg:col-span-3">
              <label className="block font-bold text-slate-700 mb-1">Rincian Alasan Khusus *</label>
              <input
                type="text"
                required
                placeholder="Tuliskan alasan penyesuaian secara spesifik..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Menyimpan...' : 'Simpan Penyesuaian Stok'}
          </button>
        </div>
      </form>

      {/* Adjustments History Table */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Riwayat Penyesuaian Stok Terkini
        </h3>
        {adjustments.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Belum ada catatan penyesuaian stok.</p>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Nama Barang</th>
                  <th className="py-2.5 px-3">Cabang</th>
                  <th className="py-2.5 px-3 text-center">Stok Lama</th>
                  <th className="py-2.5 px-3 text-center">Stok Baru</th>
                  <th className="py-2.5 px-3 text-center">Selisih</th>
                  <th className="py-2.5 px-3">Alasan</th>
                  <th className="py-2.5 px-3">Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adjustments.map((adj) => (
                  <tr key={adj.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-500">
                      {adj.createdAt ? new Date(adj.createdAt).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{adj.itemName}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-700">{adj.branch}</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">{adj.oldStock}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-900">{adj.newStock}</td>
                    <td
                      className={`py-2.5 px-3 text-center font-black ${
                        adj.difference > 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {adj.difference > 0 ? `+${adj.difference}` : adj.difference}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{adj.reason}</td>
                    <td className="py-2.5 px-3 text-slate-400">{adj.performedBy?.split('@')[0]}</td>
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
