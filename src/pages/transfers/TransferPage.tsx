import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  CheckCircle,
  Truck,
  Building2,
  AlertCircle,
  Clock,
  XCircle,
  ArrowRight,
  Eye,
  Printer,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  query,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { Asset, AssetTransfer, TransferStatus } from '../../types';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';
import { getCachedCompanySettings } from '../../services/companyService';
import { printReport } from '../../services/printService';

export const TransferPage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [fromBranch, setFromBranch] = useState<'SINGARAJA' | 'TEJAKULA'>('SINGARAJA');
  const [toBranch, setToBranch] = useState<'SINGARAJA' | 'TEJAKULA'>('TEJAKULA');
  const [notes, setNotes] = useState('');

  const fetchTransfersAndAssets = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'asset_transfers'));
      const list: AssetTransfer[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setTransfers(list);

      const assetSnap = await getDocs(collection(db, 'assets'));
      const assetList: Asset[] = [];
      assetSnap.forEach((d) => {
        const a = { id: d.id, ...(d.data() as any) } as Asset;
        if (!a.isDeleted && a.status === 'AKTIF') {
          assetList.push(a);
        }
      });
      setAssets(assetList);
      if (assetList.length > 0 && !selectedAssetId) {
        setSelectedAssetId(assetList[0].id);
        setFromBranch(assetList[0].branch);
        setToBranch(assetList[0].branch === 'SINGARAJA' ? 'TEJAKULA' : 'SINGARAJA');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfersAndAssets();
  }, []);

  const handleAssetSelect = (id: string) => {
    setSelectedAssetId(id);
    const chosen = assets.find((a) => a.id === id);
    if (chosen) {
      setFromBranch(chosen.branch);
      setToBranch(chosen.branch === 'SINGARAJA' ? 'TEJAKULA' : 'SINGARAJA');
    }
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;

    if (fromBranch === toBranch) {
      alert('Cabang asal dan tujuan tidak boleh sama!');
      return;
    }

    setSubmitting(true);
    try {
      const transferId = doc(collection(db, 'asset_transfers')).id;
      const transferNumber = `TRF-${Date.now().toString().slice(-8)}`;

      const newTransfer: AssetTransfer = {
        id: transferId,
        transferNumber,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        fromBranch,
        toBranch,
        requestedBy: user?.displayName || user?.email || '',
        requestDate: new Date().toISOString(),
        status: 'DIAJUKAN',
        notes,
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'asset_transfers', transferId), newTransfer);

      // Log asset history
      await logAssetHistory({
        assetId: asset.id,
        assetCode: asset.assetCode,
        action: 'TRANSFER_REQUESTED',
        details: `Pengajuan transfer dari ${fromBranch} ke ${toBranch} (${transferNumber})`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      // Log audit
      await logAuditEvent({
        action: 'TRANSFER',
        module: 'TRANSFERS',
        documentId: transferId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: fromBranch,
        details: `Permintaan transfer aset diajukan: ${asset.assetCode} (${fromBranch} -> ${toBranch})`,
      });

      setModalOpen(false);
      setNotes('');
      fetchTransfersAndAssets();
    } catch (err) {
      console.error(err);
      alert('Gagal membuat pengajuan transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  // Status transitions
  const handleUpdateStatus = async (
    transfer: AssetTransfer,
    nextStatus: TransferStatus
  ) => {
    try {
      const updateData: Partial<AssetTransfer> = {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };

      if (nextStatus === 'DISETUJUI') {
        updateData.approvedBy = user?.displayName || user?.email || '';
        updateData.approvalDate = new Date().toISOString();
      } else if (nextStatus === 'DALAM PENGIRIMAN') {
        updateData.shippedBy = user?.displayName || user?.email || '';
        updateData.shippingDate = new Date().toISOString();
      } else if (nextStatus === 'DITERIMA') {
        updateData.receivedBy = user?.displayName || user?.email || '';
        updateData.receivedDate = new Date().toISOString();

        // CRITICAL INVARIANT: Update asset's branch in `assets` ONLY when received!
        await updateDoc(doc(db, 'assets', transfer.assetId), {
          branch: transfer.toBranch,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || '',
        });

        await logAssetHistory({
          assetId: transfer.assetId,
          assetCode: transfer.assetCode,
          action: 'TRANSFER_RECEIVED',
          details: `Aset diterima di cabang tujuan ${transfer.toBranch}. Penempatan cabang resmi diperbarui.`,
          performedBy: user?.uid || '',
          userEmail: user?.email || '',
        });
      }

      await updateDoc(doc(db, 'asset_transfers', transfer.id), updateData);

      await logAuditEvent({
        action: 'TRANSFER_STATUS_UPDATE',
        module: 'TRANSFERS',
        documentId: transfer.id,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: transfer.toBranch,
        details: `Status transfer ${transfer.transferNumber} diubah menjadi ${nextStatus}`,
      });

      fetchTransfersAndAssets();
    } catch (err) {
      console.error(err);
      alert('Gagal memperbarui status transfer.');
    }
  };

  const getStatusBadge = (st: TransferStatus) => {
    switch (st) {
      case 'DIAJUKAN':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'DISETUJUI':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'DALAM PENGIRIMAN':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DITERIMA':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'DITOLAK':
      case 'DIBATALKAN':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintTransfers = () => {
    console.log('[PRINT][TRANSFER] button clicked');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
      return;
    }

    setIsPrinting(true);
    const companySettings = getCachedCompanySettings();
    try {
      const rowsHtml = transfers.length > 0
        ? transfers.map((t, idx) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 8px; color: #94a3b8; font-weight: 700;">${idx + 1}</td>
              <td style="padding: 6px 8px; font-weight: 700; color: #0369a1; font-family: monospace;">${t.transferNumber}</td>
              <td style="padding: 6px 8px; font-family: monospace;">${t.assetCode}</td>
              <td style="padding: 6px 8px; font-weight: 700;">${t.assetName}</td>
              <td style="padding: 6px 8px;">${t.fromBranch}</td>
              <td style="padding: 6px 8px;">${t.toBranch}</td>
              <td style="padding: 6px 8px;">${t.requestedBy}</td>
              <td style="padding: 6px 8px;">${t.requestDate || '-'}</td>
              <td style="padding: 6px 8px;"><span style="font-weight: 700;">${t.status}</span></td>
            </tr>
          `).join('')
        : `<tr><td colspan="9" style="padding: 16px; text-align: center; color: #94a3b8; font-style: italic;">Tidak ada riwayat transfer aset.</td></tr>`;

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
              <p style="font-weight: 700; margin: 0;">LAPORAN MUTASI & TRANSFER ASET</p>
              <p style="margin: 2px 0 0 0;">Tgl: ${new Date().toLocaleDateString('id-ID')}</p>
            </div>
          </div>
          <p style="font-size: 10px; color: #64748b; margin-bottom: 10px;">Total: ${transfers.length} Transaksi Transfer</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px;">No</th>
                <th style="padding: 6px 8px;">No. Transfer</th>
                <th style="padding: 6px 8px;">Kode Aset</th>
                <th style="padding: 6px 8px;">Nama Aset</th>
                <th style="padding: 6px 8px;">Dari Cabang</th>
                <th style="padding: 6px 8px;">Ke Cabang</th>
                <th style="padding: 6px 8px;">Pemohon</th>
                <th style="padding: 6px 8px;">Tgl Pengajuan</th>
                <th style="padding: 6px 8px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
      printReport(reportHtml, 'Laporan_Transfer_Aset_DKL', printWindow);
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
            <Send className="w-5 h-5 text-sky-600" />
            <span>Transfer Aset Antar Cabang</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Alur pengiriman dan mutasi aset fisik antara Singaraja dan Tejakula
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintTransfers}
            disabled={isPrinting}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Mempersiapkan...' : 'Cetak Transfer'}</span>
          </button>
          {role !== 'AUDITOR' && (
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Ajukan Transfer
            </button>
          )}
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat daftar transfer...</p>
          </div>
        ) : transfers.length === 0 ? (
          <div className="py-16 text-center">
            <Truck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">Belum ada pengajuan transfer</p>
            <p className="text-xs text-slate-400 mt-1">Buat pengajuan transfer aset antar cabang sekarang.</p>
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">No. Transfer</th>
                  <th className="py-3 px-4">Kode & Nama Aset</th>
                  <th className="py-3 px-4">Rute Pengiriman</th>
                  <th className="py-3 px-4">Pemohon</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Tindakan Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((trf) => (
                  <tr key={trf.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono font-bold text-sky-700">{trf.transferNumber}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{trf.assetName}</div>
                      <div className="text-[10px] font-mono text-slate-500">{trf.assetCode}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="text-slate-600">{trf.fromBranch}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-sky-600" />
                        <span className="text-sky-700">{trf.toBranch}</span>
                      </div>
                      {trf.notes && <div className="text-[10px] text-slate-400 mt-0.5">{trf.notes}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-700">{trf.requestedBy}</div>
                      <div className="text-[10px] text-slate-400">
                        {trf.requestDate ? new Date(trf.requestDate).toLocaleDateString('id-ID') : '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(trf.status)}`}>
                        {trf.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Admin approval */}
                        {trf.status === 'DIAJUKAN' && role === 'ADMIN' && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(trf, 'DISETUJUI')}
                              className="px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-bold text-[11px] rounded-lg transition"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(trf, 'DITOLAK')}
                              className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-[11px] rounded-lg transition"
                            >
                              Tolak
                            </button>
                          </>
                        )}

                        {/* Dispatch shipping */}
                        {trf.status === 'DISETUJUI' && role !== 'AUDITOR' && (
                          <button
                            onClick={() => handleUpdateStatus(trf, 'DALAM PENGIRIMAN')}
                            className="px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-500 font-bold text-[11px] rounded-lg transition flex items-center gap-1"
                          >
                            <Truck className="w-3 h-3" /> Kirim Barang
                          </button>
                        )}

                        {/* Confirm receive */}
                        {trf.status === 'DALAM PENGIRIMAN' && role !== 'AUDITOR' && (
                          <button
                            onClick={() => handleUpdateStatus(trf, 'DITERIMA')}
                            className="px-2.5 py-1 bg-emerald-600 text-white hover:bg-emerald-500 font-bold text-[11px] rounded-lg transition flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" /> Konfirmasi Terima
                          </button>
                        )}

                        {trf.status === 'DITERIMA' && (
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Selesai
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Ajukan Transfer */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Ajukan Pengiriman Transfer Aset</h3>

            <form onSubmit={handleCreateTransfer} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Aset Fisik *</label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => handleAssetSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} - {a.name} (Cabang Saat Ini: {a.branch})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cabang Asal *</label>
                  <input
                    type="text"
                    disabled
                    value={fromBranch}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cabang Tujuan *</label>
                  <select
                    value={toBranch}
                    onChange={(e) => setToBranch(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sky-800"
                  >
                    <option value="SINGARAJA">SINGARAJA</option>
                    <option value="TEJAKULA">TEJAKULA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alasan / Catatan Transfer</label>
                <textarea
                  rows={3}
                  placeholder="Kebutuhan proyek, pemindahan staf penanggung jawab, perbaikan terpusat, dsb."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
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
                  {submitting ? 'Mengajukan...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
