import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Plus,
  Scan,
  CheckCircle,
  AlertTriangle,
  Search,
  Building2,
  Calendar,
  Camera,
  Save,
  Printer,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { Asset, StockOpname, StockOpnameItem } from '../../types';
import { UniversalScanner } from '../../scanner/UniversalScanner';
import { logAuditEvent } from '../../services/auditService';
import { getCachedCompanySettings } from '../../services/companyService';
import { printReport } from '../../services/printService';

export const StockOpnamePage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [sessions, setSessions] = useState<StockOpname[]>([]);
  const [activeSession, setActiveSession] = useState<StockOpname | null>(null);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // New session state
  const [title, setTitle] = useState('');
  const [targetBranch, setTargetBranch] = useState<'SINGARAJA' | 'TEJAKULA'>(
    branch === 'TEJAKULA' ? 'TEJAKULA' : 'SINGARAJA'
  );
  const [targetLocation, setTargetLocation] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'stock_opname'));
      const list: StockOpname[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setSessions(list);
      if (list.length > 0 && !activeSession) {
        setActiveSession(list[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleStartNewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    try {
      // Fetch all assets in targetBranch
      let q = query(
        collection(db, 'assets'),
        where('branch', '==', targetBranch)
      );
      const snap = await getDocs(q);
      const expectedAssets: Asset[] = [];
      snap.forEach((d) => {
        const data = { id: d.id, ...(d.data() as any) } as Asset;
        if (!data.isDeleted) {
          expectedAssets.push(data);
        }
      });

      const items: StockOpnameItem[] = expectedAssets.map((a) => ({
        assetId: a.id,
        assetCode: a.assetCode,
        assetName: a.name,
        expectedBranch: a.branch,
        expectedLocation: a.location || 'Utama',
        status: 'TIDAK DITEMUKAN', // Default until scanned
        condition: a.condition,
      }));

      const opnameId = doc(collection(db, 'stock_opname')).id;
      const opnameNumber = `OPN-${Date.now().toString().slice(-8)}`;

      const newOpname: StockOpname = {
        id: opnameId,
        opnameNumber,
        title: title.trim(),
        branch: targetBranch,
        location: targetLocation.trim() || 'Semua Lokasi',
        date: new Date().toISOString().split('T')[0],
        status: 'OPEN',
        totalAssets: items.length,
        foundCount: 0,
        notFoundCount: items.length,
        needCheckCount: 0,
        completionPercentage: 0,
        items,
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'stock_opname', opnameId), newOpname);

      await logAuditEvent({
        action: 'STOCK_OPNAME_START',
        module: 'STOCK_OPNAME',
        documentId: opnameId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: targetBranch,
        details: `Sesi Stock Opname ${opnameNumber} dimulai untuk cabang ${targetBranch} (${items.length} aset)`,
      });

      setCreateModalOpen(false);
      setTitle('');
      fetchSessions();
    } catch (err) {
      console.error(err);
      alert('Gagal membuat sesi stock opname.');
    } finally {
      setCreating(false);
    }
  };

  const handleScanCode = (code: string) => {
    if (!activeSession) return;
    const trimmed = code.trim();

    const idx = activeSession.items.findIndex(
      (i) => i.assetCode.toLowerCase() === trimmed.toLowerCase() || i.assetId === trimmed
    );

    if (idx === -1) {
      alert(`Kode "${trimmed}" tidak terdapat dalam daftar aset yang diekspektasikan pada cabang ${activeSession.branch}!`);
      return;
    }

    const updatedItems = [...activeSession.items];
    updatedItems[idx] = {
      ...updatedItems[idx],
      status: 'DITEMUKAN',
      scannedAt: new Date().toISOString(),
      scannedBy: user?.displayName || user?.email || '',
    };

    updateSessionCounts(updatedItems);
  };

  const updateItemStatus = (assetId: string, status: 'DITEMUKAN' | 'TIDAK DITEMUKAN' | 'PERLU PEMERIKSAAN') => {
    if (!activeSession) return;
    const updatedItems = activeSession.items.map((i) => (i.assetId === assetId ? { ...i, status } : i));
    updateSessionCounts(updatedItems);
  };

  const updateSessionCounts = async (items: StockOpnameItem[]) => {
    if (!activeSession) return;
    const foundCount = items.filter((i) => i.status === 'DITEMUKAN').length;
    const notFoundCount = items.filter((i) => i.status === 'TIDAK DITEMUKAN').length;
    const needCheckCount = items.filter((i) => i.status === 'PERLU PEMERIKSAAN').length;
    const total = items.length;
    const completionPercentage = total > 0 ? Math.round((foundCount / total) * 100) : 0;

    const updatedSession: StockOpname = {
      ...activeSession,
      items,
      foundCount,
      notFoundCount,
      needCheckCount,
      completionPercentage,
      status: completionPercentage === 100 ? 'COMPLETED' : 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    };

    setActiveSession(updatedSession);
    try {
      await updateDoc(doc(db, 'stock_opname', activeSession.id), {
        items,
        foundCount,
        notFoundCount,
        needCheckCount,
        completionPercentage,
        status: updatedSession.status,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintOpname = () => {
    console.log('[PRINT][STOCK_OPNAME] button clicked');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
      return;
    }

    setIsPrinting(true);
    const companySettings = getCachedCompanySettings();
    try {
      const itemsToPrint = activeSession ? activeSession.items : [];
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
              <p style="font-weight: 700; margin: 0;">LAPORAN AUDIT STOCK OPNAME</p>
              <p style="margin: 2px 0 0 0;">Tgl: ${new Date().toLocaleDateString('id-ID')}</p>
            </div>
          </div>
          ${activeSession ? `
            <div style="margin-bottom: 12px; font-size: 11px;">
              <strong>Sesi: ${activeSession.title}</strong> • Cabang: ${activeSession.branch} • Status: ${activeSession.status} • Total Aset: ${activeSession.totalAssets} • Ditemukan: ${activeSession.foundCount} • Belum: ${activeSession.notFoundCount}
            </div>
          ` : `<p style="font-size: 10px; color: #64748b; margin-bottom: 10px;">Total: ${sessions.length} Sesi Audit Stock Opname</p>`}
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">No</th>
                <th style="padding: 6px 8px;">Kode Aset</th>
                <th style="padding: 6px 8px;">Nama Aset</th>
                <th style="padding: 6px 8px;">Lokasi Seharusnya</th>
                <th style="padding: 6px 8px;">Status Temuan</th>
                <th style="padding: 6px 8px;">Kondisi Fisik</th>
                <th style="padding: 6px 8px;">Petugas Scan</th>
              </tr>
            </thead>
            <tbody>
              ${(itemsToPrint.length > 0 ? itemsToPrint : sessions.map(s => ({
                assetCode: s.opnameNumber,
                assetName: s.title,
                expectedLocation: s.branch,
                status: s.status,
                condition: `${s.completionPercentage}%`,
                scannedBy: s.createdBy,
              }))).map((item: any, idx: number) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 6px 8px; color: #94a3b8; font-weight: 700;">${idx + 1}</td>
                  <td style="padding: 6px 8px; font-weight: 700; color: #0369a1; font-family: monospace;">${item.assetCode}</td>
                  <td style="padding: 6px 8px; font-weight: 700;">${item.assetName}</td>
                  <td style="padding: 6px 8px;">${item.expectedLocation}</td>
                  <td style="padding: 6px 8px;"><span style="font-weight: 700;">${item.status}</span></td>
                  <td style="padding: 6px 8px;">${item.condition}</td>
                  <td style="padding: 6px 8px;">${item.scannedBy || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Stock_Opname_DKL', printWindow);
    } catch (error) {
      console.error('[PRINT ERROR]', error);
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
            <ClipboardCheck className="w-5 h-5 text-sky-600" />
            <span>Audit & Stock Opname Fisik</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Verifikasi fisik aset di lapangan dengan Barcode / QR Scanner
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintOpname}
            disabled={isPrinting}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan...' : 'Cetak Opname'}</span>
          </button>
          {activeSession && activeSession.status !== 'COMPLETED' && (
            <button
              onClick={() => setScannerOpen(!scannerOpen)}
              className="px-3.5 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold text-xs rounded-xl border border-sky-200 transition flex items-center gap-1.5"
            >
              <Scan className="w-4 h-4" />
              <span>{scannerOpen ? 'Tutup Scanner' : 'Buka Scanner Opname'}</span>
            </button>
          )}

          {role !== 'AUDITOR' && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Mulai Opname Baru
            </button>
          )}
        </div>
      </div>

      {/* Live Scanner Modal / Accordion */}
      {scannerOpen && (
        <div className="bg-slate-900 p-6 rounded-3xl shadow-xl text-center space-y-4">
          <div className="flex items-center justify-between text-white max-w-lg mx-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Arahkan Kamera ke Barcode Aset
            </span>
            <button
              onClick={() => setScannerOpen(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Tutup
            </button>
          </div>
          <UniversalScanner onScan={handleScanCode} />
        </div>
      )}

      {/* Active Session Info & Progress */}
      {activeSession ? (
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold bg-sky-50 text-sky-800 px-2 py-0.5 rounded border border-sky-100">
                  {activeSession.opnameNumber}
                </span>
                <span className="text-xs font-bold text-slate-400">•</span>
                <span className="text-xs font-bold text-sky-700">{activeSession.branch}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">{activeSession.title}</h2>
              <p className="text-xs text-slate-500">
                Tanggal: {activeSession.date} • Dibuat oleh: {activeSession.createdBy}
              </p>
            </div>

            {/* Switch Active Session */}
            {sessions.length > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold">Pilih Sesi:</span>
                <select
                  value={activeSession.id}
                  onChange={(e) => {
                    const found = sessions.find((s) => s.id === e.target.value);
                    if (found) setActiveSession(found);
                  }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.opnameNumber} - {s.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Progress Bar & Counter Cards */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-700">Progres Penyelesaian Opname Fisik</span>
              <span className="text-sky-700">{activeSession.completionPercentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div
                className="bg-sky-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${activeSession.completionPercentage}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Aset Cabang</span>
              <p className="text-xl font-black text-slate-900 mt-0.5">{activeSession.totalAssets}</p>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[10px] uppercase font-bold text-emerald-600">Ditemukan (Terverifikasi)</span>
              <p className="text-xl font-black text-emerald-700 mt-0.5">{activeSession.foundCount}</p>
            </div>

            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
              <span className="text-[10px] uppercase font-bold text-rose-600">Belum Terverifikasi</span>
              <p className="text-xl font-black text-rose-700 mt-0.5">{activeSession.notFoundCount}</p>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-[10px] uppercase font-bold text-amber-600">Perlu Pemeriksaan</span>
              <p className="text-xl font-black text-amber-700 mt-0.5">{activeSession.needCheckCount}</p>
            </div>
          </div>

          {/* Asset Check Table */}
          <div className="overflow-x-auto text-xs border border-slate-200 rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Kode Aset</th>
                  <th className="py-2.5 px-3">Nama Aset</th>
                  <th className="py-2.5 px-3">Lokasi Ekspektasi</th>
                  <th className="py-2.5 px-3">Kondisi</th>
                  <th className="py-2.5 px-3 text-center">Status Fisik</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeSession.items.map((item) => (
                  <tr key={item.assetId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-sky-800">{item.assetCode}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{item.assetName}</td>
                    <td className="py-2.5 px-3 text-slate-600">{item.expectedLocation}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-600">{item.condition}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          item.status === 'DITEMUKAN'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : item.status === 'PERLU PEMERIKSAAN'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => updateItemStatus(item.assetId, 'DITEMUKAN')}
                          className="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded text-[10px]"
                        >
                          Ada
                        </button>
                        <button
                          onClick={() => updateItemStatus(item.assetId, 'PERLU PEMERIKSAAN')}
                          className="px-2 py-0.5 bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold rounded text-[10px]"
                        >
                          Periksa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-2xl shadow-xs border border-slate-200 text-center">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800">Belum Ada Sesi Stock Opname</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Klik tombol Mulai Opname Baru untuk menginisialisasi audit fisik aset.
          </p>
        </div>
      )}

      {/* Modal Start New Opname */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Mulai Sesi Stock Opname Baru</h3>

            <form onSubmit={handleStartNewSession} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Judul Sesi Opname *</label>
                <input
                  type="text"
                  required
                  placeholder="misal: Opname Triwulan I 2026 Cabang Singaraja"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Cabang *</label>
                <select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sky-800"
                >
                  <option value="SINGARAJA">SINGARAJA</option>
                  <option value="TEJAKULA">TEJAKULA</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Lokasi / Ruangan Tertentu (Opsional)</label>
                <input
                  type="text"
                  placeholder="Semua Lokasi / Gedung A"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {creating ? 'Menyiapkan...' : 'Mulai Sesi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
