import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Scan,
  Box,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Plus,
  RefreshCw,
  Wrench,
  Send,
  Building2,
} from 'lucide-react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { UniversalScanner } from '../../scanner/UniversalScanner';
import { Asset, InventoryItem } from '../../types';

export const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [matchedAsset, setMatchedAsset] = useState<Asset | null>(null);
  const [matchedInventory, setMatchedInventory] = useState<InventoryItem | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleScan = async (code: string) => {
    setScannedCode(code);
    setSearching(true);
    setNotFound(false);
    setMatchedAsset(null);
    setMatchedInventory(null);

    try {
      // 1. Search in Assets by assetCode or barcode
      const assetSnap1 = await getDocs(
        query(collection(db, 'assets'), where('assetCode', '==', code), limit(1))
      );
      if (!assetSnap1.empty) {
        setMatchedAsset({ id: assetSnap1.docs[0].id, ...(assetSnap1.docs[0].data() as any) });
        setSearching(false);
        return;
      }

      const assetSnap2 = await getDocs(
        query(collection(db, 'assets'), where('barcode', '==', code), limit(1))
      );
      if (!assetSnap2.empty) {
        setMatchedAsset({ id: assetSnap2.docs[0].id, ...(assetSnap2.docs[0].data() as any) });
        setSearching(false);
        return;
      }

      // 2. Search in Inventory Items
      const invSnap = await getDocs(
        query(collection(db, 'inventory_items'), where('itemCode', '==', code), limit(1))
      );
      if (!invSnap.empty) {
        setMatchedInventory({ id: invSnap.docs[0].id, ...(invSnap.docs[0].data() as any) });
        setSearching(false);
        return;
      }

      const invSnap2 = await getDocs(
        query(collection(db, 'inventory_items'), where('barcode', '==', code), limit(1))
      );
      if (!invSnap2.empty) {
        setMatchedInventory({ id: invSnap2.docs[0].id, ...(invSnap2.docs[0].data() as any) });
        setSearching(false);
        return;
      }

      // If not found in either
      setNotFound(true);
    } catch (err) {
      console.error(err);
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const handleReset = () => {
    setScannedCode(null);
    setMatchedAsset(null);
    setMatchedInventory(null);
    setNotFound(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 text-center">
        <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Scan className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">Pemindai Barcode & QR Cepat</h1>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Arahkan kamera ke stiker Barcode (CODE 128) atau QR Code pada aset fisik PT Darma Karya Lestari.
        </p>
      </div>

      {/* Universal Camera Scanner */}
      <div className="p-2 bg-slate-900 rounded-3xl shadow-xl">
        <UniversalScanner onScan={handleScan} />
      </div>

      {/* Lookup Feedback Area */}
      {searching && (
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-700">Mencari data untuk kode: {scannedCode}...</span>
        </div>
      )}

      {/* Result: Matched Asset */}
      {matchedAsset && (
        <div className="bg-white p-6 rounded-2xl shadow-md border-2 border-sky-500 space-y-4 animate-in fade-in">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {matchedAsset.photoUrl ? (
                <img
                  src={matchedAsset.photoUrl}
                  alt={matchedAsset.name}
                  className="w-16 h-16 rounded-xl object-cover border border-slate-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <Box className="w-8 h-8" />
                </div>
              )}
              <div>
                <span className="text-[10px] font-mono font-bold bg-sky-50 text-sky-800 px-2 py-0.5 rounded border border-sky-200">
                  {matchedAsset.assetCode}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{matchedAsset.name}</h3>
                <p className="text-xs text-slate-500">
                  {matchedAsset.category} • {matchedAsset.brand} {matchedAsset.model}
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {matchedAsset.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
            <div>
              <span className="text-slate-400">Cabang:</span>
              <p className="font-bold text-sky-700">{matchedAsset.branch}</p>
            </div>
            <div>
              <span className="text-slate-400">Lokasi:</span>
              <p className="font-semibold text-slate-800">{matchedAsset.location || '-'}</p>
            </div>
            <div>
              <span className="text-slate-400">PIC:</span>
              <p className="font-semibold text-slate-800">{matchedAsset.pic || '-'}</p>
            </div>
            <div>
              <span className="text-slate-400">Kondisi:</span>
              <p className="font-bold text-slate-800">{matchedAsset.condition}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
            <Link
              to={`/assets/${matchedAsset.id}`}
              className="flex-1 py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <span>Buka Profil Lengkap</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={handleReset}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
            >
              Scan Lainnya
            </button>
          </div>
        </div>
      )}

      {/* Result: Matched Inventory Item */}
      {matchedInventory && (
        <div className="bg-white p-6 rounded-2xl shadow-md border-2 border-emerald-500 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                INVENTARIS: {matchedInventory.itemCode}
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">{matchedInventory.name}</h3>
              <p className="text-xs text-slate-500">Kategori: {matchedInventory.category}</p>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-emerald-600">{matchedInventory.currentStock}</span>
              <p className="text-[11px] text-slate-400 uppercase font-semibold">{matchedInventory.unit}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Link
              to="/inventory"
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1"
            >
              Lihat di Daftar Stok
            </Link>
            <button
              onClick={handleReset}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
            >
              Scan Lainnya
            </button>
          </div>
        </div>
      )}

      {/* Result: Not Found */}
      {notFound && (
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-rose-200 text-center space-y-4 animate-in fade-in">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Kode Tidak Terdaftar</h3>
            <p className="text-xs text-slate-500 mt-1">
              Barcode/QR <span className="font-mono font-bold text-slate-700">{scannedCode}</span> belum ditemukan
              pada database aset maupun inventaris PT Darma Karya Lestari.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Link
              to={`/assets/new`}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Registrasikan Aset Baru
            </Link>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
            >
              Pindai Ulang
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
