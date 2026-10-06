import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Printer,
  QrCode,
  Box,
  Building2,
  Clock,
  ShieldCheck,
  Send,
  Wrench,
  AlertTriangle,
  Search,
  CheckCircle,
  FileText,
  DollarSign,
  User,
  MapPin,
  Calendar,
} from 'lucide-react';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { Asset, AssetHistory } from '../../types';
import { renderBarcodeToCanvas, generateQrDataUrl } from '../../barcode/barcodeGenerator';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';

export const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'maintenance'>('overview');
  const [qrCodeData, setQrCodeData] = useState('');

  const barcodeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const fetchAsset = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'assets', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...(snap.data() as any) } as Asset;
        setAsset(data);

        // Fetch history
        const histSnap = await getDocs(
          query(collection(db, 'asset_history'), where('assetId', '==', id))
        );
        const histList: AssetHistory[] = [];
        histSnap.forEach((d) => {
          histList.push({ id: d.id, ...(d.data() as any) });
        });
        histList.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        setHistory(histList);

        // Render QR
        const code = data.barcode || data.assetCode;
        generateQrDataUrl(code).then(setQrCodeData).catch(() => {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAsset();
  }, [id]);

  useEffect(() => {
    if (asset && barcodeCanvasRef.current) {
      renderBarcodeToCanvas(barcodeCanvasRef.current, asset.barcode || asset.assetCode, {
        format: 'CODE128',
        height: 50,
        width: 1.8,
      });
    }
  }, [asset]);

  const handleReportDamage = async () => {
    if (!asset) return;
    const problem = window.prompt('Jelaskan detail kerusakan yang terjadi:');
    if (!problem) return;

    try {
      await updateDoc(doc(db, 'assets', asset.id), {
        condition: 'RUSAK RINGAN',
        status: 'RUSAK',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: asset.id,
        assetCode: asset.assetCode,
        action: 'DAMAGE_REPORT',
        details: `Laporan Kerusakan: ${problem}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      await logAuditEvent({
        action: 'DAMAGE_REPORT',
        module: 'ASSETS',
        documentId: asset.id,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: asset.branch,
        details: `Aset ${asset.assetCode} dilaporkan rusak: ${problem}`,
      });

      alert('Kerusakan berhasil dicatat. Status aset diubah menjadi RUSAK.');
      fetchAsset();
    } catch (e) {
      console.error(e);
      alert('Gagal memperbarui status kerusakan.');
    }
  };

  const handleReportLost = async () => {
    if (!asset) return;
    const chronology = window.prompt('Jelaskan kronologi kehilangan aset:');
    if (!chronology) return;

    try {
      await updateDoc(doc(db, 'assets', asset.id), {
        condition: 'HILANG',
        status: 'HILANG',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAssetHistory({
        assetId: asset.id,
        assetCode: asset.assetCode,
        action: 'LOSS_REPORT',
        details: `Laporan Kehilangan: ${chronology}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      await logAuditEvent({
        action: 'LOSS_REPORT',
        module: 'ASSETS',
        documentId: asset.id,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: asset.branch,
        details: `Aset ${asset.assetCode} dilaporkan hilang: ${chronology}`,
      });

      alert('Laporan kehilangan berhasil dicatat. Status aset diubah menjadi HILANG.');
      fetchAsset();
    } catch (e) {
      console.error(e);
      alert('Gagal memperbarui status kehilangan.');
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-semibold">Memuat rincian aset...</p>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-xs text-center border border-slate-200">
        <Box className="w-12 h-12 text-slate-300 mx-auto mb-2" />
        <h2 className="text-base font-bold text-slate-800">Aset Tidak Ditemukan</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">Aset ini mungkin telah dihapus atau tidak terdaftar.</p>
        <Link
          to="/assets"
          className="px-4 py-2 bg-sky-600 text-white font-bold text-xs rounded-xl hover:bg-sky-500"
        >
          Kembali ke Daftar Aset
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/assets"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-extrabold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-lg border border-sky-200">
                {asset.assetCode}
              </span>
              <span className="text-xs font-bold text-slate-400">•</span>
              <span className="text-xs font-bold text-slate-600">{asset.category}</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 mt-1 tracking-tight">{asset.name}</h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/barcode?assetId=${asset.id}`}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Cetak Label Barcode
          </Link>

          {role !== 'AUDITOR' && (
            <>
              <button
                onClick={handleReportDamage}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <AlertTriangle className="w-4 h-4" /> Laporkan Rusak
              </button>

              <button
                onClick={handleReportLost}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <Search className="w-4 h-4" /> Laporkan Hilang
              </button>

              <Link
                to={`/assets/edit/${asset.id}`}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <Edit2 className="w-4 h-4" /> Edit Aset
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Hero Visual Card: Photo + Barcode / QR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Photo Gallery & Thumbnail */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col items-center justify-center">
          <div className="w-full aspect-square max-w-[240px] rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center shadow-inner">
            {asset.photoUrl ? (
              <img src={asset.photoUrl} alt={asset.name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-center p-4">
                <Box className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <span className="text-xs font-semibold text-slate-400">Tidak ada foto</span>
              </div>
            )}
          </div>
          <div className="mt-4 text-center">
            <span className="text-xs font-bold text-slate-700">Foto Utama Aset</span>
            {asset.photoPublicId && (
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Cloudinary ID: {asset.photoPublicId}</p>
            )}
          </div>
        </div>

        {/* Barcode & QR Box */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Kode Barcode & QR Fisik
            </h3>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <canvas ref={barcodeCanvasRef} className="max-w-full h-12 mx-auto bg-white p-1 rounded mb-3" />
              <p className="text-xs font-mono font-bold text-slate-800">{asset.barcode || asset.assetCode}</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4">
            {qrCodeData ? (
              <img src={qrCodeData} alt="QR Code" className="w-16 h-16 rounded-lg bg-white p-1 border border-slate-200 shadow-2xs" />
            ) : (
              <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                <QrCode className="w-6 h-6" />
              </div>
            )}
            <div className="text-xs">
              <p className="font-bold text-slate-800">Scan QR Verifikasi</p>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Pindai dengan kamera untuk membuka langsung lembar profil aset ini.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Badges & Overview Summary */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Status Operasi</h3>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Cabang Penempatan:</span>
                <span className="font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-100">
                  {asset.branch}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Lokasi Ruangan:</span>
                <span className="font-bold text-slate-800">{asset.location || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">PIC / Pemegang:</span>
                <span className="font-bold text-slate-800">{asset.pic || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Kondisi Fisik:</span>
                <span className="font-bold px-2 py-0.5 rounded-md text-[11px] bg-slate-100 text-slate-800">
                  {asset.condition}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Status Aset:</span>
                <span className="font-bold px-2 py-0.5 rounded-md text-[11px] bg-sky-100 text-sky-800">
                  {asset.status}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 text-[11px] text-slate-400">
            Terdaftar pada: {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString('id-ID') : '-'} oleh{' '}
            {asset.createdBy || 'Admin'}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3.5 text-xs font-bold transition border-b-2 ${
              activeTab === 'overview'
                ? 'border-sky-600 text-sky-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Spesifikasi & Rincian Pengadaan
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3.5 text-xs font-bold transition border-b-2 ${
              activeTab === 'history'
                ? 'border-sky-600 text-sky-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Riwayat Aktivitas ({history.length})
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
            {/* Left: Spesifikasi */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                Spesifikasi Teknis
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400">Merk / Brand:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{asset.brand || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Model / Tipe:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{asset.model || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Nomor Seri (Serial Number):</span>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">{asset.serialNumber || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Departemen / Unit:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {asset.department || '-'} / {asset.unit || '-'}
                  </p>
                </div>
              </div>

              {asset.notes && (
                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 font-semibold">Catatan Khusus:</span>
                  <p className="text-slate-700 mt-1 whitespace-pre-line">{asset.notes}</p>
                </div>
              )}
            </div>

            {/* Right: Pembelian & Garansi */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                Data Pembelian & Garansi
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400">Tanggal Pembelian:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{asset.purchaseDate || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Harga Perolehan:</span>
                  <p className="font-bold text-emerald-700 mt-0.5">
                    {asset.purchasePrice ? `Rp ${Number(asset.purchasePrice).toLocaleString('id-ID')}` : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Vendor / Pemasok:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{asset.vendor || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Nomor Faktur / Invoice:</span>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">{asset.invoiceNumber || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Periode Garansi Mulai:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{asset.warrantyStart || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Periode Garansi Berakhir:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{asset.warrantyEnd || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: History */}
        {activeTab === 'history' && (
          <div className="p-6">
            {history.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Belum ada riwayat tercatat untuk aset ini.
              </div>
            ) : (
              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                {history.map((h) => (
                  <div key={h.id} className="relative text-xs">
                    {/* Timeline bullet */}
                    <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-sky-600 border-2 border-white shadow-xs" />
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sky-800 uppercase text-[10px] bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                        {h.action}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {h.timestamp ? new Date(h.timestamp).toLocaleString('id-ID') : ''}
                      </span>
                    </div>
                    <p className="text-slate-800 font-medium">{h.details}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">Oleh: {h.userEmail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
