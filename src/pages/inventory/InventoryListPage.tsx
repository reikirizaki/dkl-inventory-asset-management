import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Plus,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  AlertTriangle,
  Building2,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';
import {
  collection,
  getDocs,
  setDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { InventoryItem, CompanySettings } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { exportToExcel, exportToCsv } from '../../reports/exportUtils';
import { getCompanySettings, DEFAULT_COMPANY_SETTINGS } from '../../services/companyService';
import { printReport } from '../../services/printService';

export const InventoryListPage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState(branch === 'ALL' ? 'ALL' : branch);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStockStatus, setFilterStockStatus] = useState('ALL');
  const [companySettings, setCompanySettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);

  // New Item Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemCode, setItemCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Suku Cadang & Sparepart');
  const [unit, setUnit] = useState('Pcs');
  const [minStock, setMinStock] = useState<number>(5);
  const [initialStock, setInitialStock] = useState<number>(10);
  const [itemBranch, setItemBranch] = useState<'SINGARAJA' | 'TEJAKULA' | 'ALL'>('ALL');
  const [location, setLocation] = useState('Gudang Utama');
  const [modalSaving, setModalSaving] = useState(false);

  useEffect(() => {
    getCompanySettings().then(setCompanySettings).catch(() => {});
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'inventory_items'));
      const list: InventoryItem[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      setItems(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const getStockStatus = (stock: number, min: number) => {
    if (stock <= 0) return { label: 'HABIS', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (stock <= min) return { label: 'KRITIS', color: 'bg-orange-50 text-orange-700 border-orange-200' };
    if (stock <= min * 1.5) return { label: 'MENIPIS', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'AMAN', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  const filteredItems = items.filter((item) => {
    if (filterBranch !== 'ALL' && item.branch !== 'ALL' && item.branch !== filterBranch) return false;
    if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;

    const status = getStockStatus(item.currentStock, item.minStock).label;
    if (filterStockStatus !== 'ALL' && status !== filterStockStatus) return false;

    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      return (
        item.itemCode.toLowerCase().includes(s) ||
        item.name.toLowerCase().includes(s) ||
        item.category.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setModalSaving(true);

    try {
      const itemId = doc(collection(db, 'inventory_items')).id;
      const code = itemCode.trim() || `ITM-${Date.now().toString().slice(-6)}`;

      const newItem: Partial<InventoryItem> = {
        id: itemId,
        itemCode: code,
        barcode: code,
        name: name.trim(),
        category,
        unit,
        minStock: Number(minStock) || 0,
        currentStock: Number(initialStock) || 0,
        branch: itemBranch,
        location,
        createdAt: new Date().toISOString(),
        createdBy: user?.email || '',
      };

      await setDoc(doc(db, 'inventory_items', itemId), newItem);

      await logAuditEvent({
        action: 'INVENTORY_CREATE',
        module: 'INVENTORY',
        documentId: itemId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: itemBranch,
        details: `Item inventaris baru didaftarkan: ${code} - ${name.trim()} (Stok Awal: ${initialStock} ${unit})`,
      });

      setIsModalOpen(false);
      setName('');
      setItemCode('');
      fetchItems();
    } catch (err) {
      console.error(err);
      alert('Gagal membuat item baru.');
    } finally {
      setModalSaving(false);
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintInventory = () => {
    console.log('[PRINT][INVENTORY] button clicked');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
      return;
    }

    setIsPrinting(true);
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
              <p style="font-weight: 700; margin: 0;">LAPORAN STOK INVENTARIS</p>
              <p style="margin: 2px 0 0 0;">Tgl: ${new Date().toLocaleDateString('id-ID')}</p>
            </div>
          </div>
          <p style="font-size: 10px; color: #64748b; margin-bottom: 10px;">Filter: Cabang: ${filterBranch} | Kategori: ${filterCategory} | Total: ${filteredItems.length} Item</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">No</th>
                <th style="padding: 6px 8px;">Kode Item</th>
                <th style="padding: 6px 8px;">Nama Barang</th>
                <th style="padding: 6px 8px;">Kategori</th>
                <th style="padding: 6px 8px;">Stok Saat Ini</th>
                <th style="padding: 6px 8px;">Satuan</th>
                <th style="padding: 6px 8px;">Min. Stok</th>
                <th style="padding: 6px 8px;">Cabang</th>
                <th style="padding: 6px 8px;">Lokasi Gudang</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.map((item, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 6px 8px; color: #94a3b8; font-weight: 700;">${idx + 1}</td>
                  <td style="padding: 6px 8px; font-weight: 700; color: #0369a1; font-family: monospace;">${item.itemCode}</td>
                  <td style="padding: 6px 8px; font-weight: 700;">${item.name}</td>
                  <td style="padding: 6px 8px;">${item.category}</td>
                  <td style="padding: 6px 8px; font-weight: 700; ${item.currentStock <= item.minStock ? 'color: #dc2626;' : 'color: #16a34a;'}">${item.currentStock}</td>
                  <td style="padding: 6px 8px;">${item.unit}</td>
                  <td style="padding: 6px 8px;">${item.minStock}</td>
                  <td style="padding: 6px 8px;">${item.branch}</td>
                  <td style="padding: 6px 8px;">${item.location || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Stok_Inventaris_DKL', printWindow);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExport = () => {
    exportToExcel({
      title: 'Laporan Stok Inventaris & Suku Cadang',
      companySettings,
      columns: [
        { header: 'Kode Item', dataKey: 'itemCode' },
        { header: 'Nama Barang', dataKey: 'name' },
        { header: 'Kategori', dataKey: 'category' },
        { header: 'Stok Saat Ini', dataKey: 'currentStock' },
        { header: 'Satuan', dataKey: 'unit' },
        { header: 'Min. Stok', dataKey: 'minStock' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Lokasi Gudang', dataKey: 'location' },
      ],
      data: filteredItems,
      filtersText: `Cabang: ${filterBranch} | Kategori: ${filterCategory}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Inventaris Stok & Suku Cadang</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pengelolaan barang pakai habis, consumables, dan komponen teknisi PT DKL
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrintInventory}
            disabled={isPrinting}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan cetakan...' : 'Cetak Stok (Print)'}</span>
          </button>
          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
          <Link
            to="/inventory/inbound"
            className="px-3.5 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold text-xs rounded-xl border border-sky-200 transition flex items-center gap-1.5"
          >
            <ArrowDownLeft className="w-4 h-4" /> Barang Masuk
          </Link>
          <Link
            to="/inventory/outbound"
            className="px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs rounded-xl border border-emerald-200 transition flex items-center gap-1.5"
          >
            <ArrowUpRight className="w-4 h-4" /> Barang Keluar
          </Link>
          {role !== 'AUDITOR' && (
            <button
              onClick={() => {
                setItemCode(`ITM-${Date.now().toString().slice(-5)}`);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Tambah Item
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative lg:col-span-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari kode atau nama barang..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
          />
        </div>

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

        <div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">Semua Kategori</option>
            <option value="Suku Cadang & Sparepart">Suku Cadang & Sparepart</option>
            <option value="Alat Tulis Kantor (ATK)">Alat Tulis Kantor (ATK)</option>
            <option value="Bahan Kimia & Pembersih">Bahan Kimia & Pembersih</option>
            <option value="Perlengkapan Teknisi">Perlengkapan Teknisi</option>
            <option value="Lainnya">Lainnya</option>
          </select>
        </div>

        <div>
          <select
            value={filterStockStatus}
            onChange={(e) => setFilterStockStatus(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">Semua Status Stok</option>
            <option value="AMAN">AMAN</option>
            <option value="MENIPIS">MENIPIS</option>
            <option value="KRITIS">KRITIS</option>
            <option value="HABIS">HABIS</option>
          </select>
        </div>
      </div>

      {/* Item Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat stok inventaris...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">Tidak ada item inventaris</p>
            <p className="text-xs text-slate-400 mt-1">Silakan tambahkan item baru atau sesuaikan filter pencarian.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Kode Item</th>
                  <th className="py-3 px-4">Nama Barang</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Cabang & Lokasi</th>
                  <th className="py-3 px-4 text-center">Batas Min</th>
                  <th className="py-3 px-4 text-center">Stok Saat Ini</th>
                  <th className="py-3 px-4 text-center">Status Stok</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const statusInfo = getStockStatus(item.currentStock, item.minStock);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{item.itemCode}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        <div className="text-[10px] text-slate-400">Satuan: {item.unit}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600">{item.category}</td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-sky-700">{item.branch}</span>
                        <div className="text-[10px] text-slate-400">{item.location || '-'}</div>
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-600">
                        {item.minStock} {item.unit}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-sm font-black text-slate-900">{item.currentStock}</span>{' '}
                        <span className="text-[10px] text-slate-500">{item.unit}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/inventory/adjustment?itemId=${item.id}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition"
                            title="Penyesuaian Stok"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Tambah Item Inventaris Baru</h3>

            <form onSubmit={handleCreateItem} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kode Item *</label>
                  <input
                    type="text"
                    required
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Satuan (Unit) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Pcs, Box, Liter, Roll"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Barang / Part *</label>
                <input
                  type="text"
                  required
                  placeholder="misal: Kabel LAN Cat6 50m / Toner Printer HP 85A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="Suku Cadang & Sparepart">Suku Cadang & Sparepart</option>
                    <option value="Alat Tulis Kantor (ATK)">Alat Tulis Kantor (ATK)</option>
                    <option value="Bahan Kimia & Pembersih">Bahan Kimia & Pembersih</option>
                    <option value="Perlengkapan Teknisi">Perlengkapan Teknisi</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cabang Penempatan *</label>
                  <select
                    value={itemBranch}
                    onChange={(e) => setItemBranch(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="ALL">Semua Cabang (Global)</option>
                    <option value="SINGARAJA">Singaraja</option>
                    <option value="TEJAKULA">Tejakula</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Batas Stok Minimum *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={minStock}
                    onChange={(e) => setMinStock(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stok Awal Saat Ini *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={initialStock}
                    onChange={(e) => setInitialStock(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Lokasi Rak / Gudang</label>
                <input
                  type="text"
                  placeholder="misal: Gudang Sparepart Rak B-3"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {modalSaving ? 'Menyimpan...' : 'Simpan Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
