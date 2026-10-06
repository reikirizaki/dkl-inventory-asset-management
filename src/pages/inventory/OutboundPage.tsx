import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Package,
  CheckCircle,
  AlertCircle,
  Wrench,
  Building2,
  User,
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
import { InventoryItem, InventoryTransaction } from '../../types';
import { logAuditEvent } from '../../services/auditService';

export const OutboundPage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form
  const [selectedItemId, setSelectedItemId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState<number>(1);
  const [recipient, setRecipient] = useState('');
  const [technician, setTechnician] = useState('');
  const [targetUnit, setTargetUnit] = useState('');
  const [purpose, setPurpose] = useState('Pemeliharaan Rutin');
  const [notes, setNotes] = useState('');
  const [txBranch, setTxBranch] = useState<'SINGARAJA' | 'TEJAKULA'>(branch === 'TEJAKULA' ? 'TEJAKULA' : 'SINGARAJA');

  const fetchItemsAndLogs = async () => {
    try {
      const snap = await getDocs(collection(db, 'inventory_items'));
      const list: InventoryItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setItems(list);
      if (list.length > 0 && !selectedItemId) {
        setSelectedItemId(list[0].id);
      }

      // Recent outbound
      const txSnap = await getDocs(query(collection(db, 'inventory_transactions'), limit(15)));
      const txList: InventoryTransaction[] = [];
      txSnap.forEach((d) => {
        const data = d.data() as InventoryTransaction;
        if (data.transactionType === 'OUT' || (data.transactionType as string).includes('KELUAR')) {
          txList.push({ ...data, id: d.id });
        }
      });
      txList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setRecentTransactions(txList);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchItemsAndLogs();
  }, []);

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedItem) {
      setErrorMsg('Pilih item barang yang akan dikeluarkan.');
      return;
    }
    if (quantity <= 0) {
      setErrorMsg('Jumlah barang keluar harus minimal 1.');
      return;
    }

    // Critical validation: check available stock
    if (quantity > (selectedItem.currentStock || 0)) {
      setErrorMsg(
        `Stok tidak mencukupi! Stok yang tersedia saat ini hanya ${selectedItem.currentStock} ${selectedItem.unit}. Permintaan pengeluaran (${quantity}) ditolak.`
      );
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const txId = doc(collection(db, 'inventory_transactions')).id;
      const txNumber = `OUT-${Date.now().toString().slice(-8)}`;

      // 1. Transaction doc
      const txPayload: InventoryTransaction = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'OUT',
        date,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        category: selectedItem.category,
        branch: txBranch,
        location: selectedItem.location || '',
        quantity,
        unit: selectedItem.unit,
        recipient,
        technician,
        purpose: `${purpose}${targetUnit ? ` - Unit: ${targetUnit}` : ''}`,
        notes,
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };
      batch.set(doc(db, 'inventory_transactions', txId), txPayload);

      // 2. Decrement stock
      const newStock = (selectedItem.currentStock || 0) - quantity;
      batch.update(doc(db, 'inventory_items', selectedItem.id), {
        currentStock: newStock,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await batch.commit();

      // Log audit
      await logAuditEvent({
        action: 'INVENTORY_OUT',
        module: 'INVENTORY',
        documentId: txId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: txBranch,
        details: `Barang Keluar (${txNumber}): -${quantity} ${selectedItem.unit} untuk ${selectedItem.name} (${purpose}). Sisa stok: ${newStock}`,
      });

      setSuccessMsg(`Pengeluaran barang berhasil dicatat (${txNumber}). Sisa stok: ${newStock} ${selectedItem.unit}`);
      setQuantity(1);
      setRecipient('');
      setTechnician('');
      setNotes('');
      fetchItemsAndLogs();
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal memproses transaksi barang keluar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <ArrowUpRight className="w-5 h-5 text-emerald-600" />
          <span>Transaksi Barang Keluar (Outbound)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Pengeluaran suku cadang untuk perbaikan teknisi, pemakaian unit operasional, atau konsumsi rutin
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
          {/* Item Selector */}
          <div className="lg:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">Pilih Item Barang / Suku Cadang *</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-sky-500"
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.itemCode} - {i.name} (Tersedia: {i.currentStock} {i.unit})
                </option>
              ))}
            </select>
            {selectedItem && (
              <p className="mt-1 text-[11px] text-slate-500">
                Stok tersedia di sistem: <strong className="text-sky-700">{selectedItem.currentStock} {selectedItem.unit}</strong> | Min. Stok: {selectedItem.minStock} {selectedItem.unit}
              </p>
            )}
          </div>

          {/* Kuantitas Keluar */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Kuantitas Keluar ({selectedItem?.unit || 'Qty'}) *
            </label>
            <input
              type="number"
              required
              min={1}
              max={selectedItem?.currentStock || 9999}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-rose-600 text-sm"
            />
          </div>

          {/* Tanggal */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tanggal Keluar</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          {/* Cabang */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Cabang *</label>
            <select
              value={txBranch}
              onChange={(e) => setTxBranch(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
            >
              <option value="SINGARAJA">SINGARAJA</option>
              <option value="TEJAKULA">TEJAKULA</option>
            </select>
          </div>

          {/* Keperluan / Tujuan */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Keperluan Pengeluaran</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
            >
              <option value="Perbaikan / Maintenance Teknisi">Perbaikan / Maintenance Teknisi</option>
              <option value="Kebutuhan Operasional Harian">Kebutuhan Operasional Harian</option>
              <option value="Penggantian Part Rusak">Penggantian Part Rusak</option>
              <option value="Pengiriman ke Unit Lapangan">Pengiriman ke Unit Lapangan</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>

          {/* Teknisi / Penerima */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Teknisi Pengguna</label>
            <input
              type="text"
              placeholder="Nama teknisi / montir"
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          {/* Penerima / PIC */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Penerima Barang (Nama Staf)</label>
            <input
              type="text"
              placeholder="Nama staf yang menerima barang"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          {/* Unit Operasional */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Unit / Aset Target (Jika Ada)</label>
            <input
              type="text"
              placeholder="misal: Genset No. 2, Mobil Operasional DK-102"
              value={targetUnit}
              onChange={(e) => setTargetUnit(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        {/* Catatan */}
        <div className="text-xs">
          <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan</label>
          <textarea
            rows={2}
            placeholder="Keterangan nomor SPK teknisi atau rincian pekerjaan"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Memproses...' : 'Keluarkan Barang'}
          </button>
        </div>
      </form>

      {/* Recent Outbound Log Table */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Riwayat Barang Keluar Terkini
        </h3>
        {recentTransactions.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Belum ada transaksi barang keluar.</p>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">No. Transaksi</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Nama Barang</th>
                  <th className="py-2.5 px-3 text-right">Qty Keluar</th>
                  <th className="py-2.5 px-3">Penerima / Teknisi</th>
                  <th className="py-2.5 px-3">Keperluan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{tx.transactionNumber}</td>
                    <td className="py-2.5 px-3">{tx.date}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{tx.itemName}</td>
                    <td className="py-2.5 px-3 text-right font-black text-rose-600">
                      -{tx.quantity} {tx.unit}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {tx.recipient || tx.technician || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{tx.purpose || '-'}</td>
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
