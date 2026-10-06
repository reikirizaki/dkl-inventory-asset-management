import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Printer,
  FileSpreadsheet,
  Filter,
  Eye,
  Building2,
  Calendar,
  CheckCircle,
  Image as ImageIcon,
  CheckSquare,
  Square,
  Box,
  Wrench,
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Asset,
  InventoryItem,
  InventoryTransaction,
  AssetTransfer,
  StockOpname,
  Maintenance,
  Repair,
  Disposal,
  AuditLog,
  CompanySettings,
} from '../../types';
import {
  getCachedCompanySettings,
  getCompanySettings,
  subscribeCompanySettings,
} from '../../services/companyService';
import {
  exportToPdf,
  exportToExcel,
  exportToCsv,
  ExportColumn,
} from '../../reports/exportUtils';
import { CompanyLogo } from '../../components/common/CompanyLogo';
import { printElement } from '../../services/printService';

export const ReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState<string>('asset_register');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Logo & Image toggles (Default ON)
  const [includeLogo, setIncludeLogo] = useState<boolean>(true);
  const [includeImage, setIncludeImage] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [isPrintingReport, setIsPrintingReport] = useState(false);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(getCachedCompanySettings());

  // Raw data collections
  const [assets, setAssets] = useState<Asset[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [opnames, setOpnames] = useState<StockOpname[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [disposals, setDisposals] = useState<Disposal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    getCompanySettings().then((s) => {
      if (s) setCompanySettings(s);
    });
    const unsub = subscribeCompanySettings(setCompanySettings);
    return () => unsub();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Assets
      const aSnap = await getDocs(collection(db, 'assets'));
      const aList: Asset[] = [];
      aSnap.forEach((d) => aList.push({ id: d.id, ...(d.data() as any) }));
      setAssets(aList.filter((a) => !a.isDeleted));

      // 2. Inventory Items
      const iSnap = await getDocs(collection(db, 'inventory_items'));
      const iList: InventoryItem[] = [];
      iSnap.forEach((d) => iList.push({ id: d.id, ...(d.data() as any) }));
      setInventoryItems(iList);

      // 3. Transactions
      const tSnap = await getDocs(collection(db, 'inventory_transactions'));
      const tList: InventoryTransaction[] = [];
      tSnap.forEach((d) => tList.push({ id: d.id, ...(d.data() as any) }));
      setTransactions(tList);

      // 4. Transfers
      const trSnap = await getDocs(collection(db, 'asset_transfers'));
      const trList: AssetTransfer[] = [];
      trSnap.forEach((d) => trList.push({ id: d.id, ...(d.data() as any) }));
      setTransfers(trList);

      // 5. Stock Opname
      const opSnap = await getDocs(collection(db, 'stock_opnames'));
      const opList: StockOpname[] = [];
      opSnap.forEach((d) => opList.push({ id: d.id, ...(d.data() as any) }));
      setOpnames(opList);

      // 6. Maintenance
      const mSnap = await getDocs(collection(db, 'maintenances'));
      const mList: Maintenance[] = [];
      mSnap.forEach((d) => mList.push({ id: d.id, ...(d.data() as any) }));
      setMaintenances(mList);

      // 7. Repairs
      const rSnap = await getDocs(collection(db, 'repairs'));
      const rList: Repair[] = [];
      rSnap.forEach((d) => rList.push({ id: d.id, ...(d.data() as any) }));
      setRepairs(rList);

      // 8. Disposals
      const dSnap = await getDocs(collection(db, 'disposals'));
      const dList: Disposal[] = [];
      dSnap.forEach((d) => dList.push({ id: d.id, ...(d.data() as any) }));
      setDisposals(dList);

      // 9. Audit Logs
      const alSnap = await getDocs(collection(db, 'audit_logs'));
      const alList: AuditLog[] = [];
      alSnap.forEach((d) => alList.push({ id: d.id, ...(d.data() as any) }));
      setAuditLogs(alList);
    } catch (e) {
      console.error('Error fetching report data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const periodText = useMemo(() => {
    if (startDate && endDate) return `${startDate} s/d ${endDate}`;
    if (startDate) return `Mulai ${startDate}`;
    if (endDate) return `Hingga ${endDate}`;
    return 'Semua Periode';
  }, [startDate, endDate]);

  const filtersSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (branchFilter !== 'ALL') parts.push(`Cabang: ${branchFilter}`);
    if (categoryFilter !== 'ALL') parts.push(`Kategori: ${categoryFilter}`);
    if (statusFilter !== 'ALL') parts.push(`Status: ${statusFilter}`);
    if (periodText !== 'Semua Periode') parts.push(`Periode: ${periodText}`);
    return parts.length > 0 ? parts.join(' • ') : 'Semua Data';
  }, [branchFilter, categoryFilter, statusFilter, periodText]);

  // Compute table data based on reportType & filters
  const reportData = useMemo(() => {
    let raw: any[] = [];
    let cols: ExportColumn[] = [];
    let title = 'Laporan Registrasi Aset';

    if (
      reportType === 'asset_register' ||
      reportType === 'asset_branch' ||
      reportType === 'asset_condition'
    ) {
      title =
        reportType === 'asset_branch'
          ? 'Laporan Aset per Cabang'
          : reportType === 'asset_condition'
          ? 'Laporan Kondisi Fisik Aset'
          : 'Laporan Registrasi Aset Tetap';

      cols = [
        { header: 'Kode Aset', dataKey: 'assetCode' },
        { header: 'Nama Aset', dataKey: 'name' },
        { header: 'Kategori', dataKey: 'category' },
        { header: 'Merk/Model', dataKey: 'brand' },
        { header: 'No. Seri', dataKey: 'serialNumber' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Lokasi', dataKey: 'location' },
        { header: 'PIC', dataKey: 'pic' },
        { header: 'Kondisi', dataKey: 'condition' },
        { header: 'Status', dataKey: 'status' },
      ];

      raw = assets.filter((item) => {
        if (branchFilter !== 'ALL' && item.branch !== branchFilter) return false;
        if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
        if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
        if (startDate && item.purchaseDate && item.purchaseDate < startDate) return false;
        if (endDate && item.purchaseDate && item.purchaseDate > endDate) return false;
        return true;
      });
    } else if (reportType === 'inventory_stock') {
      title = 'Laporan Stok Suku Cadang & Barang Habis Pakai';
      cols = [
        { header: 'Kode Item', dataKey: 'itemCode' },
        { header: 'Nama Barang', dataKey: 'name' },
        { header: 'Kategori', dataKey: 'category' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Lokasi', dataKey: 'location' },
        { header: 'Stok Saat Ini', dataKey: 'currentStock' },
        { header: 'Satuan', dataKey: 'unit' },
        { header: 'Min. Stok', dataKey: 'minStock' },
      ];
      raw = inventoryItems.filter((i) => {
        if (branchFilter !== 'ALL' && i.branch !== 'ALL' && i.branch !== branchFilter) return false;
        if (categoryFilter !== 'ALL' && i.category !== categoryFilter) return false;
        return true;
      });
    } else if (reportType === 'inbound') {
      title = 'Laporan Transaksi Barang Masuk (Inbound)';
      cols = [
        { header: 'No. Transaksi', dataKey: 'transactionNumber' },
        { header: 'Tanggal', dataKey: 'date' },
        { header: 'Nama Barang', dataKey: 'itemName' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Kuantitas Masuk', dataKey: 'quantity' },
        { header: 'Satuan', dataKey: 'unit' },
        { header: 'Pemasok / Vendor', dataKey: 'vendor' },
        { header: 'Penerima', dataKey: 'receivedBy' },
      ];
      raw = transactions.filter((t) => {
        if (t.transactionType !== 'IN') return false;
        if (branchFilter !== 'ALL' && t.branch !== branchFilter) return false;
        if (startDate && t.date && t.date < startDate) return false;
        if (endDate && t.date && t.date > endDate) return false;
        return true;
      });
    } else if (reportType === 'outbound') {
      title = 'Laporan Transaksi Barang Keluar (Outbound)';
      cols = [
        { header: 'No. Transaksi', dataKey: 'transactionNumber' },
        { header: 'Tanggal', dataKey: 'date' },
        { header: 'Nama Barang', dataKey: 'itemName' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Kuantitas Keluar', dataKey: 'quantity' },
        { header: 'Satuan', dataKey: 'unit' },
        { header: 'Penerima / Teknisi', dataKey: 'recipient' },
        { header: 'Keperluan', dataKey: 'purpose' },
      ];
      raw = transactions.filter((t) => {
        if (t.transactionType !== 'OUT') return false;
        if (branchFilter !== 'ALL' && t.branch !== branchFilter) return false;
        if (startDate && t.date && t.date < startDate) return false;
        if (endDate && t.date && t.date > endDate) return false;
        return true;
      });
    } else if (reportType === 'transfers') {
      title = 'Laporan Mutasi & Transfer Aset Antar Cabang';
      cols = [
        { header: 'No. Transfer', dataKey: 'transferNumber' },
        { header: 'Kode Aset', dataKey: 'assetCode' },
        { header: 'Nama Aset', dataKey: 'assetName' },
        { header: 'Cabang Asal', dataKey: 'fromBranch' },
        { header: 'Cabang Tujuan', dataKey: 'toBranch' },
        { header: 'Pemohon', dataKey: 'requestedBy' },
        { header: 'Tanggal', dataKey: 'requestDate' },
        { header: 'Status', dataKey: 'status' },
      ];
      raw = transfers.filter((t) => {
        if (branchFilter !== 'ALL' && t.fromBranch !== branchFilter && t.toBranch !== branchFilter) return false;
        if (startDate && t.requestDate && t.requestDate < startDate) return false;
        if (endDate && t.requestDate && t.requestDate > endDate) return false;
        return true;
      });
    } else if (reportType === 'stock_opname') {
      title = 'Laporan Hasil Stock Opname & Audit Fisik';
      cols = [
        { header: 'No. Opname', dataKey: 'opnameNumber' },
        { header: 'Judul / Sesi', dataKey: 'title' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Tanggal', dataKey: 'date' },
        { header: 'Total Aset', dataKey: 'totalAssets' },
        { header: 'Ditemukan', dataKey: 'foundCount' },
        { header: 'Tidak Ditemukan', dataKey: 'notFoundCount' },
        { header: 'Progress (%)', dataKey: 'completionPercentage' },
        { header: 'Status', dataKey: 'status' },
      ];
      raw = opnames.filter((o) => {
        if (branchFilter !== 'ALL' && o.branch !== branchFilter) return false;
        if (startDate && o.date && o.date < startDate) return false;
        if (endDate && o.date && o.date > endDate) return false;
        return true;
      });
    } else if (reportType === 'maintenance') {
      title = 'Laporan Jadwal & Riwayat Maintenance Aset';
      cols = [
        { header: 'Kode Aset', dataKey: 'assetCode' },
        { header: 'Nama Aset', dataKey: 'assetName' },
        { header: 'Jenis Maintenance', dataKey: 'maintenanceType' },
        { header: 'Tanggal Mulai', dataKey: 'startDate' },
        { header: 'Teknisi / Vendor', dataKey: 'technician' },
        { header: 'Biaya (Rp)', dataKey: 'cost' },
        { header: 'Status', dataKey: 'status' },
        { header: 'Keterangan', dataKey: 'description' },
      ];
      raw = maintenances.filter((m) => {
        if (startDate && m.startDate && m.startDate < startDate) return false;
        if (endDate && m.startDate && m.startDate > endDate) return false;
        return true;
      });
    } else if (reportType === 'repairs') {
      title = 'Laporan Perbaikan & Servis Aset (Repair)';
      cols = [
        { header: 'No. Perbaikan', dataKey: 'repairNumber' },
        { header: 'Kode Aset', dataKey: 'assetCode' },
        { header: 'Nama Aset', dataKey: 'assetName' },
        { header: 'Tanggal Lapor', dataKey: 'repairDate' },
        { header: 'Masalah / Kerusakan', dataKey: 'problem' },
        { header: 'Teknisi / Vendor', dataKey: 'technician' },
        { header: 'Biaya (Rp)', dataKey: 'cost' },
        { header: 'Status', dataKey: 'status' },
      ];
      raw = repairs.filter((r) => {
        if (startDate && r.repairDate && r.repairDate < startDate) return false;
        if (endDate && r.repairDate && r.repairDate > endDate) return false;
        return true;
      });
    } else if (reportType === 'damaged') {
      title = 'Laporan Barang Rusak & Usulan Disposal';
      cols = [
        { header: 'Kode Aset', dataKey: 'assetCode' },
        { header: 'Nama Aset', dataKey: 'name' },
        { header: 'Kategori', dataKey: 'category' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Lokasi', dataKey: 'location' },
        { header: 'Kondisi', dataKey: 'condition' },
        { header: 'Status', dataKey: 'status' },
        { header: 'Catatan Kerusakan', dataKey: 'notes' },
      ];
      raw = assets.filter((a) => {
        const isDamaged =
          a.condition === 'RUSAK BERAT' ||
          a.condition === 'RUSAK RINGAN' ||
          a.status === 'RUSAK' ||
          a.status === 'DISPOSAL';
        if (!isDamaged) return false;
        if (branchFilter !== 'ALL' && a.branch !== branchFilter) return false;
        return true;
      });
    } else if (reportType === 'lost') {
      title = 'Laporan Barang Hilang & Insiden Aset';
      cols = [
        { header: 'Kode Aset', dataKey: 'assetCode' },
        { header: 'Nama Aset', dataKey: 'name' },
        { header: 'Kategori', dataKey: 'category' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Lokasi Terakhir', dataKey: 'location' },
        { header: 'PIC', dataKey: 'pic' },
        { header: 'Status', dataKey: 'status' },
        { header: 'Keterangan', dataKey: 'notes' },
      ];
      raw = assets.filter((a) => {
        const isLost = a.condition === 'HILANG' || a.status === 'HILANG';
        if (!isLost) return false;
        if (branchFilter !== 'ALL' && a.branch !== branchFilter) return false;
        return true;
      });
    } else if (reportType === 'warranty') {
      title = 'Laporan Masa Garansi Aset';
      cols = [
        { header: 'Kode Aset', dataKey: 'assetCode' },
        { header: 'Nama Aset', dataKey: 'name' },
        { header: 'Kategori', dataKey: 'category' },
        { header: 'Vendor / Toko', dataKey: 'vendor' },
        { header: 'Tgl Beli', dataKey: 'purchaseDate' },
        { header: 'Mulai Garansi', dataKey: 'warrantyStart' },
        { header: 'Akhir Garansi', dataKey: 'warrantyEnd' },
        { header: 'Cabang', dataKey: 'branch' },
      ];
      raw = assets.filter((a) => {
        if (!a.warrantyEnd) return false;
        if (branchFilter !== 'ALL' && a.branch !== branchFilter) return false;
        return true;
      });
    } else if (reportType === 'audit_log') {
      title = 'Laporan Jejak Audit Sistem (Audit Log)';
      cols = [
        { header: 'Waktu', dataKey: 'timestamp' },
        { header: 'Modul', dataKey: 'module' },
        { header: 'Aksi', dataKey: 'action' },
        { header: 'Pengguna', dataKey: 'userEmail' },
        { header: 'Role', dataKey: 'userRole' },
        { header: 'Cabang', dataKey: 'branch' },
        { header: 'Keterangan Detail', dataKey: 'details' },
      ];
      raw = auditLogs.filter((al) => {
        if (branchFilter !== 'ALL' && al.branch && al.branch !== branchFilter) return false;
        return true;
      });
    }

    return { title, cols, data: raw };
  }, [
    reportType,
    branchFilter,
    categoryFilter,
    statusFilter,
    startDate,
    endDate,
    assets,
    inventoryItems,
    transactions,
    transfers,
    opnames,
    maintenances,
    repairs,
    disposals,
    auditLogs,
  ]);

  const handleExportPdf = () => {
    exportToPdf({
      title: reportData.title,
      companySettings,
      columns: reportData.cols,
      data: reportData.data,
      filtersText: filtersSummaryText,
      periodText,
      includeLogo,
      includeImages: includeImage,
    });
  };

  const handleExportExcel = async () => {
    await exportToExcel({
      title: reportData.title,
      companySettings,
      columns: reportData.cols,
      data: reportData.data,
      filtersText: filtersSummaryText,
      periodText,
      includeLogo,
      includeImages: includeImage,
    });
  };

  const handleExportCsv = () => {
    exportToCsv({
      title: reportData.title,
      companySettings,
      columns: reportData.cols,
      data: reportData.data,
      includeImages: includeImage,
    });
  };

  const handlePrint = () => {
    console.log("[PRINT DEBUG] BUTTON CLICKED");

    if (reportData.data.length === 0) {
      alert("Tidak ada item yang dapat dicetak.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
      return;
    }

    setIsPrintingReport(true);
    try {
      const printableArea = document.getElementById('printable-report-area');
      if (printableArea) {
        printElement(printableArea, {
          title: `${reportData.title} - PT DARMA KARYA LESTARI`,
          landscape: true,
        }, printWindow);
      } else {
        printWindow.close();
      }
    } catch (err) {
      console.error('Print failed:', err);
    } finally {
      setIsPrintingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Header - hidden when printing */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-600" />
            <span>Pusat Laporan & Ekspor Data (Reports Center)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Ekspor resmi PDF, Excel (.xlsx), CSV, dan Cetak dengan kop surat PT Darma Karya Lestari
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" /> Download Excel
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrintingReport}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrintingReport ? 'Mempersiapkan cetakan...' : 'Cetak (Print)'}</span>
          </button>
        </div>
      </div>

      {/* Filter Parameters & Configuration Card - hidden when printing */}
      <div className="print:hidden bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Parameter & Kategori Laporan
            </span>
          </div>

          <button
            onClick={loadData}
            className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1"
          >
            Refresh Data
          </button>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Report Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Jenis Laporan</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
            >
              <optgroup label="Manajemen Aset Tetap">
                <option value="asset_register">Laporan Registrasi Aset Tetap</option>
                <option value="asset_branch">Laporan Aset per Cabang</option>
                <option value="asset_condition">Laporan Kondisi Fisik Aset</option>
                <option value="damaged">Laporan Barang Rusak & Afkir</option>
                <option value="lost">Laporan Barang Hilang & Insiden</option>
                <option value="warranty">Laporan Masa Garansi Aset</option>
              </optgroup>
              <optgroup label="Operasional & Inventaris">
                <option value="inventory_stock">Laporan Stok Suku Cadang & Bahan</option>
                <option value="inbound">Laporan Barang Masuk (Inbound)</option>
                <option value="outbound">Laporan Barang Keluar (Outbound)</option>
                <option value="transfers">Laporan Transfer & Mutasi Cabang</option>
                <option value="stock_opname">Laporan Stock Opname</option>
              </optgroup>
              <optgroup label="Pemeliharaan & Audit">
                <option value="maintenance">Laporan Maintenance & Pemeliharaan</option>
                <option value="repairs">Laporan Perbaikan & Servis</option>
                <option value="audit_log">Laporan Log Aktivitas & Jejak Audit</option>
              </optgroup>
            </select>
          </div>

          {/* Branch Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Filter Cabang</label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">Semua Cabang (Singaraja & Tejakula)</option>
              <option value="SINGARAJA">Kantor Singaraja</option>
              <option value="TEJAKULA">Gudang / Cabang Tejakula</option>
            </select>
          </div>

          {/* Date Start */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Awal</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Date End */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Akhir</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Toggles for Logo & Image inclusion */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
              <input
                type="checkbox"
                checked={includeLogo}
                onChange={(e) => setIncludeLogo(e.target.checked)}
                className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
              />
              <span>Include Company Logo</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
              <input
                type="checkbox"
                checked={includeImage}
                onChange={(e) => setIncludeImage(e.target.checked)}
                className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
              />
              <span>Include Asset Image</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              Total Data Ditemukan: <strong className="text-slate-800 font-bold">{reportData.data.length}</strong> baris
            </span>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrintingReport}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-sky-600" />
              <span>{isPrintingReport ? 'Mempersiapkan...' : 'Cetak Preview Report'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Screen Preview & Printable Container */}
      <div id="printable-report-area" className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden printable-report">
        {/* Official Report Header Banner */}
        <div className="p-6 border-b border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {includeLogo && (
                <div className="flex-shrink-0">
                  <CompanyLogo
                    size="lg"
                    logoUrl={companySettings.logoUrl}
                    companyName={companySettings.companyName}
                  />
                </div>
              )}
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">
                  {companySettings.companyName || 'PT DARMA KARYA LESTARI'}
                </h2>
                <p className="text-xs font-bold text-sky-700 uppercase tracking-wider">
                  DKL INVENTORY & ASSET MANAGEMENT
                </p>
                <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
                  {companySettings.companyAddress || 'Singaraja & Tejakula, Bali - Indonesia'}
                </p>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="font-mono text-[10px] uppercase font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                DOKUMEN RESMI
              </span>
              <p className="font-bold text-slate-700 mt-1">
                Tanggal Cetak: {new Date().toLocaleDateString('id-ID')}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
            <div>
              <span className="font-bold text-slate-900 uppercase">{reportData.title}</span>
              <span className="mx-2">•</span>
              <span>Periode: <strong className="text-slate-800">{periodText}</strong></span>
            </div>
            <div>
              <span>Filter: <strong className="text-slate-800">{filtersSummaryText}</strong></span>
            </div>
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Mengambil data laporan...</p>
          </div>
        ) : reportData.data.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Tidak ada rekaman data yang sesuai dengan kriteria filter yang dipilih.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-black tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  {includeImage && <th className="py-3 px-4 w-16">Foto</th>}
                  {reportData.cols.map((col) => (
                    <th key={col.dataKey} className="py-3 px-4">
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.data.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 text-center font-bold text-slate-400 text-[11px]">{idx + 1}</td>
                    {includeImage && (
                      <td className="py-3 px-4">
                        {row.photoUrl ? (
                          <img
                            src={row.photoUrl}
                            alt=""
                            className="w-10 h-10 object-cover rounded-lg border border-slate-200 bg-white"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300">
                            <Box className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                    )}
                    {reportData.cols.map((col) => (
                      <td key={col.dataKey} className="py-3 px-4 text-slate-700">
                        {col.dataKey === 'condition' ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              row.condition === 'BAIK'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.condition === 'RUSAK RINGAN'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {row.condition}
                          </span>
                        ) : col.dataKey === 'status' ? (
                          <span className="font-semibold text-slate-800">{row.status || '-'}</span>
                        ) : (
                          row[col.dataKey] ?? '-'
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            DKL Inventory & Asset Management • Dokumen ini digenerate secara otomatis oleh sistem
          </span>
          <span className="font-semibold">
            Halaman 1 dari 1 (Total: {reportData.data.length} baris)
          </span>
        </div>
      </div>
    </div>
  );
};
