import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  CheckCircle,
  Clock,
  Wrench,
  AlertOctagon,
  RefreshCw,
  Search,
  Users,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  ClipboardCheck,
  QrCode,
  Scan,
  AlertTriangle,
  Building2,
  TrendingUp,
  Filter,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { CompanyLogo } from '../components/common/CompanyLogo';
import {
  Asset,
  InventoryItem,
  AuditLog,
  AssetTransfer,
  InventoryTransaction,
  Maintenance,
  StockOpname,
} from '../types';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const { branch, role } = useAuth();
  const navigate = useNavigate();

  // Global Filters
  const [selectedBranch, setSelectedBranch] = useState<string>(branch === 'ALL' ? 'ALL' : branch);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [inOutRange, setInOutRange] = useState<'7d' | '30d' | '3m' | '6m' | '12m'>('30d');
  const [categoryTopN, setCategoryTopN] = useState<'5' | '10' | 'all'>('5');
  const [loading, setLoading] = useState(true);

  // Raw Database Collections
  const [assets, setAssets] = useState<Asset[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [maintenanceList, setMaintenanceList] = useState<Maintenance[]>([]);
  const [opnameList, setOpnameList] = useState<StockOpname[]>([]);
  const [recentAudits, setRecentAudits] = useState<AuditLog[]>([]);
  const [totalUserCount, setTotalUserCount] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Assets
        const assetSnap = await getDocs(collection(db, 'assets'));
        const aList: Asset[] = [];
        assetSnap.forEach((doc) => aList.push({ id: doc.id, ...(doc.data() as any) }));
        setAssets(aList.filter((a) => !a.isDeleted));

        // 2. Inventory Items
        const invSnap = await getDocs(collection(db, 'inventory_items'));
        const iList: InventoryItem[] = [];
        invSnap.forEach((doc) => iList.push({ id: doc.id, ...(doc.data() as any) }));
        setInventoryItems(iList);

        // 3. Transactions
        const txSnap = await getDocs(collection(db, 'inventory_transactions'));
        const txList: InventoryTransaction[] = [];
        txSnap.forEach((doc) => txList.push({ id: doc.id, ...(doc.data() as any) }));
        setTransactions(txList);

        // 4. Transfers
        const trSnap = await getDocs(collection(db, 'asset_transfers'));
        const trList: AssetTransfer[] = [];
        trSnap.forEach((doc) => trList.push({ id: doc.id, ...(doc.data() as any) }));
        setTransfers(trList);

        // 5. Maintenance
        const mSnap = await getDocs(collection(db, 'maintenance'));
        const mList: Maintenance[] = [];
        mSnap.forEach((doc) => mList.push({ id: doc.id, ...(doc.data() as any) }));
        setMaintenanceList(mList);

        // 6. Stock Opname
        const oSnap = await getDocs(collection(db, 'stock_opname'));
        const oList: StockOpname[] = [];
        oSnap.forEach((doc) => oList.push({ id: doc.id, ...(doc.data() as any) }));
        setOpnameList(oList);

        // 7. Users Count
        const uSnap = await getDocs(collection(db, 'users'));
        setTotalUserCount(uSnap.size || 1);

        // 8. Recent Audits
        const auditSnap = await getDocs(collection(db, 'audit_logs'));
        const auditList: AuditLog[] = [];
        auditSnap.forEach((doc) => auditList.push({ id: doc.id, ...(doc.data() as any) }));
        auditList.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        setRecentAudits(auditList.slice(0, 8));
      } catch (err) {
        console.error('Dashboard data load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filtered Assets based on Branch & Category
  const filteredAssets = useMemo(() => {
    return assets.filter((item) => {
      if (selectedBranch !== 'ALL' && item.branch !== selectedBranch) return false;
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      return true;
    });
  }, [assets, selectedBranch, selectedCategory]);

  // Categories list for dropdown
  const allCategories = useMemo(() => {
    const s = new Set<string>();
    assets.forEach((a) => {
      if (a.category) s.add(a.category);
    });
    return Array.from(s);
  }, [assets]);

  // SECTION 1: Summary Counts
  const totalAssets = filteredAssets.length;
  const activeAssets = filteredAssets.filter((a) => a.status === 'AKTIF').length;
  const maintenanceAssets = filteredAssets.filter((a) => a.status === 'MAINTENANCE').length;
  const damagedAssets = filteredAssets.filter((a) => a.status === 'RUSAK').length;
  const repairingAssets = filteredAssets.filter((a) => a.status === 'DALAM PERBAIKAN').length;
  const lostAssets = filteredAssets.filter((a) => a.status === 'HILANG').length;
  const borrowedAssets = filteredAssets.filter((a) => a.status === 'DIPINJAM').length;

  const filteredInventory = useMemo(() => {
    return inventoryItems.filter((i) => {
      if (selectedBranch !== 'ALL' && i.branch !== 'ALL' && i.branch !== selectedBranch) return false;
      if (selectedCategory !== 'ALL' && i.category !== selectedCategory) return false;
      return true;
    });
  }, [inventoryItems, selectedBranch, selectedCategory]);

  const totalInventoryStock = filteredInventory.reduce((acc, curr) => acc + (curr.currentStock || 0), 0);
  const lowStockItems = filteredInventory.filter((i) => i.currentStock <= i.minStock);

  // SECTION 2: Chart 1 - Asset Status Distribution (Pie)
  const statusCounts = filteredAssets.reduce((acc: Record<string, number>, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});

  const statusChartData = Object.keys(statusCounts).map((key) => ({
    name: key,
    value: statusCounts[key],
  }));

  const STATUS_COLORS: Record<string, string> = {
    AKTIF: '#10b981',
    BARU: '#0284c7',
    MAINTENANCE: '#f59e0b',
    RUSAK: '#ef4444',
    'DALAM PERBAIKAN': '#3b82f6',
    HILANG: '#dc2626',
    DIPINJAM: '#8b5cf6',
    DISPOSAL: '#64748b',
    'TIDAK AKTIF': '#94a3b8',
  };

  // SECTION 2: Chart 2 - Physical Condition (Donut with Count and Percentage)
  const conditionCounts = useMemo(() => {
    const counts = {
      BAIK: filteredAssets.filter((a) => a.condition === 'BAIK').length,
      'RUSAK RINGAN': filteredAssets.filter((a) => a.condition === 'RUSAK RINGAN').length,
      'RUSAK BERAT': filteredAssets.filter((a) => a.condition === 'RUSAK BERAT').length,
      HILANG: filteredAssets.filter((a) => a.condition === 'HILANG').length,
    };
    const total = filteredAssets.length || 1;
    return [
      { name: 'BAIK', count: counts['BAIK'], percentage: Math.round((counts['BAIK'] / total) * 100), color: '#10b981' },
      { name: 'RUSAK RINGAN', count: counts['RUSAK RINGAN'], percentage: Math.round((counts['RUSAK RINGAN'] / total) * 100), color: '#f59e0b' },
      { name: 'RUSAK BERAT', count: counts['RUSAK BERAT'], percentage: Math.round((counts['RUSAK BERAT'] / total) * 100), color: '#ef4444' },
      { name: 'HILANG', count: counts['HILANG'], percentage: Math.round((counts['HILANG'] / total) * 100), color: '#8b5cf6' },
    ];
  }, [filteredAssets]);

  // SECTION 3: Chart 3 - Distribusi Barang Masuk & Keluar (IN vs OUT)
  const inOutChartData = useMemo(() => {
    const daysLimit =
      inOutRange === '7d' ? 7 : inOutRange === '30d' ? 30 : inOutRange === '3m' ? 90 : inOutRange === '6m' ? 180 : 365;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysLimit);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const relevantTx = transactions.filter((t) => {
      if (selectedBranch !== 'ALL' && t.branch !== selectedBranch) return false;
      if (t.date && t.date < cutoffStr) return false;
      return true;
    });

    // Group by month or date depending on range
    const grouped: Record<string, { period: string; masuk: number; keluar: number }> = {};

    relevantTx.forEach((t) => {
      const dateKey = inOutRange === '7d' || inOutRange === '30d' ? t.date || 'Lainnya' : t.date?.slice(0, 7) || 'Lainnya';
      if (!grouped[dateKey]) {
        grouped[dateKey] = { period: dateKey, masuk: 0, keluar: 0 };
      }
      if (t.transactionType === 'IN') {
        grouped[dateKey].masuk += t.quantity || 0;
      } else if (t.transactionType === 'OUT') {
        grouped[dateKey].keluar += t.quantity || 0;
      }
    });

    const list = Object.values(grouped);
    list.sort((a, b) => a.period.localeCompare(b.period));
    return list.slice(-12);
  }, [transactions, selectedBranch, inOutRange]);

  // SECTION 3: Chart 4 - Lalu Lintas Transfer Antar Cabang (Singaraja <-> Tejakula)
  const transferTrafficData = useMemo(() => {
    const sgrToTjk = transfers.filter(
      (t) => t.fromBranch === 'SINGARAJA' && t.toBranch === 'TEJAKULA'
    ).length;
    const tjkToSgr = transfers.filter(
      (t) => t.fromBranch === 'TEJAKULA' && t.toBranch === 'SINGARAJA'
    ).length;

    return [
      { route: 'Singaraja → Tejakula', jumlah: sgrToTjk, color: '#0284c7' },
      { route: 'Tejakula → Singaraja', jumlah: tjkToSgr, color: '#0ea5e9' },
    ];
  }, [transfers]);

  // SECTION 4: Chart 5 - Perbandingan Asset per Cabang (Dynamic branch comparison)
  const branchComparisonData = useMemo(() => {
    const branchCounts: Record<string, number> = {};
    assets.forEach((a) => {
      const b = a.branch || 'Lainnya';
      branchCounts[b] = (branchCounts[b] || 0) + 1;
    });

    return Object.keys(branchCounts).map((b) => ({
      branch: b,
      total: branchCounts[b],
    }));
  }, [assets]);

  // SECTION 4: Chart 6 - Top Asset Categories (Horizontal Bar Chart)
  const topCategoriesData = useMemo(() => {
    const catCounts: Record<string, number> = {};
    filteredAssets.forEach((a) => {
      const c = a.category || 'Tanpa Kategori';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });

    const sorted = Object.keys(catCounts)
      .map((c) => ({ category: c, total: catCounts[c] }))
      .sort((a, b) => b.total - a.total);

    if (categoryTopN === '5') return sorted.slice(0, 5);
    if (categoryTopN === '10') return sorted.slice(0, 10);
    return sorted;
  }, [filteredAssets, categoryTopN]);

  // Pending transfers count
  const pendingTransfersCount = transfers.filter((t) =>
    ['DIAJUKAN', 'DALAM PENGIRIMAN'].includes(t.status)
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Title & Global Filter Bar */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <CompanyLogo size="lg" />
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Dashboard Operasional & Analitik Aset</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Data analitik riil Cloud Firestore PT Darma Karya Lestari • Cabang Singaraja & Tejakula
            </p>
          </div>
        </div>

        {/* Global Filter Controls */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Building2 className="w-3.5 h-3.5 text-sky-600" />
            <span className="font-bold text-slate-700">Cabang:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-transparent font-bold text-sky-700 focus:outline-none"
            >
              <option value="ALL">Semua Cabang</option>
              <option value="SINGARAJA">Singaraja</option>
              <option value="TEJAKULA">Tejakula</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Filter className="w-3.5 h-3.5 text-sky-600" />
            <span className="font-bold text-slate-700">Kategori:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none max-w-[150px] truncate"
            >
              <option value="ALL">Semua Kategori</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Quick Action Ribbon */}
      <div className="bg-gradient-to-r from-sky-600 to-sky-700 p-4 rounded-2xl shadow-md shadow-sky-600/15 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
          <TrendingUp className="w-4 h-4 text-sky-200" />
          <span>Aksi Cepat Sistem</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {role !== 'AUDITOR' && (
            <Link
              to="/assets/new"
              className="px-3.5 py-1.5 bg-white text-sky-700 hover:bg-sky-50 font-bold text-xs rounded-xl shadow-xs transition"
            >
              + Aset Baru
            </Link>
          )}
          <Link
            to="/inventory/inbound"
            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl transition flex items-center gap-1"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" /> Barang Masuk
          </Link>
          <Link
            to="/inventory/outbound"
            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl transition flex items-center gap-1"
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> Barang Keluar
          </Link>
          <Link
            to="/transfers"
            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl transition flex items-center gap-1"
          >
            <Send className="w-3.5 h-3.5" /> Transfer
          </Link>
          <Link
            to="/scanner"
            className="px-3 py-1.5 bg-sky-800 hover:bg-sky-900 text-sky-100 font-bold text-xs rounded-xl transition flex items-center gap-1"
          >
            <Scan className="w-3.5 h-3.5" /> Scan Barcode/QR
          </Link>
        </div>
      </div>

      {/* SECTION 1: Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Total Asset */}
        <Link
          to="/assets"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-sky-300 transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Aset</span>
            <Box className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{loading ? '...' : totalAssets}</p>
          <span className="text-[10px] text-sky-600 font-semibold mt-1">Lihat Aset →</span>
        </Link>

        {/* Aktif */}
        <Link
          to="/assets"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aktif</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600">{loading ? '...' : activeAssets}</p>
          <span className="text-[10px] text-emerald-600 font-semibold mt-1">Siap Beroperasi</span>
        </Link>

        {/* Maintenance */}
        <Link
          to="/maintenance"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Maintenance</span>
            <Wrench className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-600">{loading ? '...' : maintenanceAssets}</p>
          <span className="text-[10px] text-amber-600 font-semibold mt-1">Perawatan Rutin</span>
        </Link>

        {/* Rusak */}
        <Link
          to="/repairs"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-rose-300 transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rusak/Repair</span>
            <AlertOctagon className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-600">{loading ? '...' : damagedAssets + repairingAssets}</p>
          <span className="text-[10px] text-rose-600 font-semibold mt-1">{repairingAssets} dlm perbaikan</span>
        </Link>

        {/* Hilang */}
        <Link
          to="/lost-found"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-300 transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hilang</span>
            <Search className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-black text-purple-600">{loading ? '...' : lostAssets}</p>
          <span className="text-[10px] text-purple-600 font-semibold mt-1">Pencarian</span>
        </Link>

        {/* Dipinjam */}
        <Link
          to="/assets"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dipinjam</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-600">{loading ? '...' : borrowedAssets}</p>
          <span className="text-[10px] text-blue-600 font-semibold mt-1">Penggunaan Unit</span>
        </Link>

        {/* Total Inventory */}
        <Link
          to="/inventory"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-sky-300 transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stok Item</span>
            <Package className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-black text-sky-600">{loading ? '...' : totalInventoryStock}</p>
          <span className="text-[10px] text-sky-600 font-semibold mt-1">{filteredInventory.length} SKU</span>
        </Link>

        {/* Total User */}
        <Link
          to="/users"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-400 transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total User</span>
            <Users className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-black text-slate-800">{loading ? '...' : totalUserCount}</p>
          <span className="text-[10px] text-slate-500 font-semibold mt-1">Staf Terdaftar</span>
        </Link>
      </div>

      {/* Attention Required / Critical Alerts */}
      {(lowStockItems.length > 0 || damagedAssets > 0 || lostAssets > 0 || pendingTransfersCount > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span>Perhatian Khusus / Tindakan Diperlukan (Attention Required)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {lowStockItems.length > 0 && (
              <div className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col justify-between">
                <div>
                  <span className="font-bold text-amber-700">Stok Menipis / Kritis</span>
                  <p className="text-slate-600 mt-1">
                    {lowStockItems.length} item inventaris berada di bawah batas minimum stok.
                  </p>
                </div>
                <Link to="/inventory" className="text-sky-600 font-bold hover:underline mt-2 inline-block">
                  Cek Inventaris →
                </Link>
              </div>
            )}

            {damagedAssets > 0 && (
              <div className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col justify-between">
                <div>
                  <span className="font-bold text-rose-700">Aset Rusak</span>
                  <p className="text-slate-600 mt-1">
                    {damagedAssets} aset mengalami kerusakan dan memerlukan penanganan.
                  </p>
                </div>
                <Link to="/repairs" className="text-sky-600 font-bold hover:underline mt-2 inline-block">
                  Ajukan Perbaikan →
                </Link>
              </div>
            )}

            {lostAssets > 0 && (
              <div className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col justify-between">
                <div>
                  <span className="font-bold text-purple-700">Aset Hilang</span>
                  <p className="text-slate-600 mt-1">{lostAssets} aset tercatat dalam status hilang/pencarian.</p>
                </div>
                <Link to="/lost-found" className="text-sky-600 font-bold hover:underline mt-2 inline-block">
                  Cek Pelacakan →
                </Link>
              </div>
            )}

            {pendingTransfersCount > 0 && (
              <div className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col justify-between">
                <div>
                  <span className="font-bold text-sky-700">Transfer Menunggu</span>
                  <p className="text-slate-600 mt-1">
                    {pendingTransfersCount} pengiriman transfer aset menunggu persetujuan / konfirmasi terima.
                  </p>
                </div>
                <Link to="/transfers" className="text-sky-600 font-bold hover:underline mt-2 inline-block">
                  Tinjau Transfer →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: Asset Status Distribution & Physical Condition Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Distribusi Status Aset */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Distribusi Status Aset</h2>
            <Link to="/assets" className="text-xs text-sky-600 font-semibold hover:underline">
              Semua Aset ({totalAssets})
            </Link>
          </div>
          <div className="h-64">
            {statusChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Belum ada data aset untuk cabang / kategori ini.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#0284c7'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Kondisi Fisik Asset (Donut with % & Count, Clickable) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Kondisi Fisik Asset</h2>
              <p className="text-[11px] text-slate-500">Klik kondisi untuk memfilter daftar aset</p>
            </div>
            <Link to="/assets" className="text-xs text-sky-600 font-semibold hover:underline">
              Daftar Aset →
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={conditionCounts}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  onClick={(entry) => {
                    if (entry && entry.name) {
                      navigate(`/assets?condition=${encodeURIComponent(entry.name)}`);
                    }
                  }}
                  cursor="pointer"
                  label={(entry: any) => `${entry.name} (${entry.percentage ?? (entry.percent ? Math.round(entry.percent * 100) : 0)}%)`}
                >
                  {conditionCounts.map((entry, index) => (
                    <Cell key={`cond-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any, name: any, props: any) => [`${value} unit (${props.payload.percentage}%)`, name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SECTION 3: Distribusi Barang Masuk & Keluar vs Lalu Lintas Transfer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 3: Distribusi Barang Masuk & Keluar (2 Columns) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Distribusi Barang Masuk & Keluar</h2>
              <p className="text-[11px] text-slate-500">Perbandingan kuantitas barang masuk (IN) vs keluar (OUT)</p>
            </div>

            {/* Time range selector */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
              {(['7d', '30d', '3m', '6m', '12m'] as const).map((rng) => (
                <button
                  key={rng}
                  onClick={() => setInOutRange(rng)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    inOutRange === rng ? 'bg-sky-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {rng === '7d' ? '7 Hari' : rng === '30d' ? '30 Hari' : rng === '3m' ? '3 Bln' : rng === '6m' ? '6 Bln' : '12 Bln'}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64">
            {inOutChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Belum ada transaksi inventaris dalam rentang periode ini.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inOutChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="masuk" name="Barang Masuk (IN)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="keluar" name="Barang Keluar (OUT)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4: Lalu Lintas Transfer Antar Cabang (1 Column) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-slate-900">Lalu Lintas Transfer Antar Cabang</h2>
              <Link to="/transfers" className="text-xs text-sky-600 font-semibold hover:underline">
                Buka Transfer →
              </Link>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">Volume pengiriman aset antara Singaraja & Tejakula</p>

            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={transferTrafficData}>
                  <XAxis dataKey="route" tick={{ fontSize: 9 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar
                    dataKey="jumlah"
                    name="Total Transfer"
                    fill="#0284c7"
                    radius={[6, 6, 0, 0]}
                    onClick={() => navigate('/transfers')}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Total Pengiriman Tercatat:</span>
            <span className="font-bold text-sky-700">{transfers.length} kali</span>
          </div>
        </div>
      </div>

      {/* SECTION 4: Perbandingan Asset Cabang & Top Asset Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 5: Perbandingan Asset per Cabang */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Perbandingan Aset per Cabang</h2>
              <p className="text-[11px] text-slate-500">Kapasitas dan jumlah aset fisik di tiap cabang</p>
            </div>
            <span className="text-xs font-bold text-slate-700">Total: {assets.length} Aset</span>
          </div>

          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="total" name="Jumlah Aset" fill="#0284c7" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 6: Top Asset Categories (Horizontal Bar Chart) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Kategori Aset Terbanyak (Top Categories)</h2>
              <p className="text-[11px] text-slate-500">Klasifikasi aset berdasarkan kuantitas terbanyak</p>
            </div>

            {/* Toggle Top 5 / Top 10 / All */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
              {(['5', '10', 'all'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setCategoryTopN(opt)}
                  className={`px-2 py-0.5 rounded-lg font-bold transition ${
                    categoryTopN === opt ? 'bg-sky-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt === '5' ? 'Top 5' : opt === '10' ? 'Top 10' : 'Semua'}
                </button>
              ))}
            </div>
          </div>

          <div className="h-60">
            {topCategoriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Belum ada data kategori aset.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCategoriesData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="category" type="category" width={110} tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Bar
                    dataKey="total"
                    name="Jumlah Aset"
                    fill="#38bdf8"
                    radius={[0, 4, 4, 0]}
                    onClick={(entry: any) => {
                      if (entry && (entry.category || entry.name)) {
                        navigate(`/assets?category=${encodeURIComponent(entry.category || entry.name)}`);
                      }
                    }}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 5: Maintenance, Stock Opname & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Maintenance Summary Box */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-amber-600" />
                <span>Status Perawatan (Maintenance)</span>
              </h2>
              <Link to="/maintenance" className="text-xs text-sky-600 font-bold hover:underline">
                Kelola →
              </Link>
            </div>

            <div className="space-y-3 mt-4 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-semibold text-slate-700">Dalam Penjadwalan:</span>
                <span className="font-bold text-amber-600">
                  {maintenanceList.filter((m) => m.status === 'OPEN').length} Jadwal
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-semibold text-slate-700">Sedang Dikerjakan:</span>
                <span className="font-bold text-blue-600">
                  {maintenanceList.filter((m) => m.status === 'IN PROGRESS').length} Pengerjaan
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-semibold text-slate-700">Telah Selesai:</span>
                <span className="font-bold text-emerald-600">
                  {maintenanceList.filter((m) => m.status === 'COMPLETED').length} Selesai
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Total Log: {maintenanceList.length}</span>
            <Link to="/maintenance" className="font-bold text-sky-600 hover:underline">
              Lihat Detail
            </Link>
          </div>
        </div>

        {/* Stock Opname Progress Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 text-sky-600" />
                <span>Audit & Stock Opname Terkini</span>
              </h2>
              <Link to="/stock-opname" className="text-xs text-sky-600 font-bold hover:underline">
                Buka Opname →
              </Link>
            </div>

            {opnameList.length > 0 ? (
              <div className="space-y-3 mt-4 text-xs">
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-100">
                  <span className="font-bold text-sky-950 block">{opnameList[0].title}</span>
                  <span className="text-[11px] text-sky-700">Cabang: {opnameList[0].branch}</span>
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] font-bold mb-1">
                      <span>Progres Audit Fisik</span>
                      <span>{opnameList[0].completionPercentage}%</span>
                    </div>
                    <div className="w-full bg-sky-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-sky-600 h-full rounded-full"
                        style={{ width: `${opnameList[0].completionPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100 font-bold">
                    {opnameList[0].foundCount} Terverifikasi
                  </div>
                  <div className="p-2 rounded-lg bg-rose-50 text-rose-800 border border-rose-100 font-bold">
                    {opnameList[0].notFoundCount} Belum Ditemukan
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                Belum ada sesi stock opname yang dibuat.
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Total Sesi: {opnameList.length}</span>
            <Link to="/stock-opname" className="font-bold text-sky-600 hover:underline">
              Mulai Sesi Baru
            </Link>
          </div>
        </div>

        {/* SECTION 6: Recent Activity (Audit logs & timeline) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900">Aktivitas Terkini (Log Audit)</h2>
              <Link to="/audit-logs" className="text-xs text-sky-600 font-bold hover:underline">
                Semua Log
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {recentAudits.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Belum ada aktivitas tercatat.</div>
              ) : (
                recentAudits.slice(0, 5).map((log) => (
                  <div key={log.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.2 rounded bg-sky-50 text-sky-800 font-bold text-[9px]">
                          {log.action}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <p className="text-slate-700 truncate font-medium text-[11px] mt-0.5">{log.details}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-right">
            <Link to="/audit-logs" className="text-xs font-bold text-sky-600 hover:underline inline-flex items-center gap-1">
              <span>Buka Seluruh Audit Trail</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
