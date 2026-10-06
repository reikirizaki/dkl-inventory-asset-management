import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  Save,
  Package,
  CheckCircle,
  AlertCircle,
  Calendar,
  Building2,
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

export const InboundPage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form
  const [selectedItemId, setSelectedItemId] = useState('');
  const [transactionType, setTransactionType] = useState<'PEMBELIAN' | 'PENERIMAAN' | 'TRANSFER MASUK' | 'PENAMBAHAN STOK'>('PEMBELIAN');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState<number>(1);
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [vendor, setVendor] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [receivedBy, setReceivedBy] = useState(user?.displayName || '');
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

      // Recent inbound
      const txSnap = await getDocs(query(collection(db, 'inventory_transactions'), limit(15)));
      const txList: InventoryTransaction[] = [];
      txSnap.forEach((d) => {
        const data = d.data() as InventoryTransaction;
        if (data.transactionType === 'IN' || (data.transactionType as string).includes('MASUK') || (data.transactionType as string).includes('PEMBELIAN')) {
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
      setErrorMsg('Pilih item barang yang masuk.');
      return;
    }
    if (quantity <= 0) {
      setErrorMsg('Jumlah barang masuk harus lebih besar dari 0.');
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const txId = doc(collection(db, 'inventory_transactions')).id;
      const txNumber = `IN-${Date.now().toString().slice(-8)}`;

      const priceNum = purchasePrice === '' ? 0 : Number(purchasePrice);
      const totalPrice = priceNum * quantity;

      // 1. Create transaction document
      const txPayload: InventoryTransaction = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'IN',
        date,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        category: selectedItem.category,
        branch: txBranch,
        location: selectedItem.location || '',
        quantity,
        unit: selectedItem.unit,
        purchasePrice: priceNum,
        totalPrice,
        vendor,
        invoiceNumber,
        documentNumber,
        receivedBy,
        notes,
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };
      batch.set(doc(db, 'inventory_transactions', txId), txPayload);

      // 2. Increment stock in inventory_items
      const newStock = (selectedItem.currentStock || 0) + quantity;
      batch.update(doc(db, 'inventory_items', selectedItem.id), {
        currentStock: newStock,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await batch.commit();

      // Log audit
      await logAuditEvent({
        action: 'INVENTORY_IN',
        module: 'INVENTORY',
        documentId: txId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: txBranch,
        details: `Barang Masuk (${txNumber}): +${quantity} ${selectedItem.unit} untuk ${selectedItem.name}. Stok akhir: ${newStock}`,
      });

      setSuccessMsg(`Penerimaan barang berhasil dicatat (${txNumber}). Stok sekarang: ${newStock} ${selectedItem.unit}`);
      setQuantity(1);
      setInvoiceNumber('');
      setNotes('');
      fetchItemsAndLogs();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Gagal memproses transaksi barang masuk.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <ArrowDownLeft className="w-5 h-5 text-sky-600" />
          <span>Transaksi Barang Masuk (Inbound)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Penerimaan barang, pembelian suku cadang baru, atau penambahan stok logistik PT DKL
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
                  {i.itemCode} - {i.name} (Stok Saat Ini: {i.currentStock} {i.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Jenis Penerimaan */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Jenis Transaksi *</label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
            >
              <option value="PEMBELIAN">PEMBELIAN BARU</option>
              <option value="PENERIMAAN">PENERIMAAN DARI PUSAT</option>
              <option value="TRANSFER MASUK">TRANSFER MASUK CABANG</option>
              <option value="PENAMBAHAN STOK">PENAMBAHAN / RETUR</option>
            </select>
          </div>

          {/* Tanggal */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tanggal Transaksi</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          {/* Cabang */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Cabang Penerima *</label>
            <select
              value={txBranch}
              onChange={(e) => setTxBranch(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
            >
              <option value="SINGARAJA">SINGARAJA</option>
              <option value="TEJAKULA">TEJAKULA</option>
            </select>
          </div>

          {/* Kuantitas */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Kuantitas Masuk ({selectedItem?.unit || 'Qty'}) *
            </label>
            <input
              type="number"
              required
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900 text-sm"
            />
          </div>

          {/* Harga Satuan */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Harga Satuan (Rp)</label>
            <input
              type="number"
              placeholder="0"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          {/* Vendor */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Pemasok / Vendor</label>
            <input
              type="text"
              placeholder="Nama vendor atau supplier"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          {/* Invoice */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Nomor Surat Jalan / Faktur</label>
            <input
              type="text"
              placeholder="SJ-2026-001"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
            />
          </div>

          {/* Diterima Oleh */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Diterima Oleh (Staf Penerima)</label>
            <input
              type="text"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        {/* Catatan */}
        <div className="text-xs">
          <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan</label>
          <textarea
            rows={2}
            placeholder="Keterangan kondisi kemasan, peruntukan khusus, dsb."
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
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Memproses...' : 'Simpan Barang Masuk'}
          </button>
        </div>
      </form>

      {/* Recent Inbound Log Table */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Riwayat Barang Masuk Terkini
        </h3>
        {recentTransactions.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Belum ada transaksi barang masuk.</p>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">No. Transaksi</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Nama Barang</th>
                  <th className="py-2.5 px-3">Cabang</th>
                  <th className="py-2.5 px-3 text-right">Qty Masuk</th>
                  <th className="py-2.5 px-3">Penerima</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-sky-700">{tx.transactionNumber}</td>
                    <td className="py-2.5 px-3">{tx.date}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{tx.itemName}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-700">{tx.branch}</td>
                    <td className="py-2.5 px-3 text-right font-black text-emerald-600">
                      +{tx.quantity} {tx.unit}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{tx.receivedBy || '-'}</td>
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
