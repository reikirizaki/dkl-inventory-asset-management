import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Printer,
  Sliders,
  Eye,
  CheckSquare,
  Square,
  Building2,
  Layers,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Asset, CompanySettings } from '../../types';
import {
  getCachedCompanySettings,
  getCompanySettings,
  subscribeCompanySettings,
} from '../../services/companyService';
import {
  generateBarcodeDataUrl,
  generateQrDataUrl,
  renderBarcodeToCanvas,
  normalizeToEan13,
  BarcodeFormat,
} from '../../barcode/barcodeGenerator';
import { printElement } from '../../services/printService';

export const BarcodeStudioPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedAssetId = searchParams.get('assetId');

  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(getCachedCompanySettings());
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  // Template Size: Small, Medium, Large, A4 Sheet
  const [labelSize, setLabelSize] = useState<'small' | 'medium' | 'large' | 'a4'>('medium');
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>('CODE128');

  // Checkboxes for fields to display on label - matching user requirements
  const [fields, setFields] = useState({
    logo: true,
    watermark: false,
    companyName: true,
    assetName: true,
    assetCode: true,
    barcode: true,
    serialNumber: true,
    category: true,
    brand: true,
    model: true,
    branch: true,
    location: true,
    pic: false,
    qr: true,
  });

  // Filter
  const [filterBranch, setFilterBranch] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');

  useEffect(() => {
    getCompanySettings().then((s) => {
      if (s) setCompanySettings(s);
    });
    const unsub = subscribeCompanySettings(setCompanySettings);
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchAssets = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'assets'));
        const list: Asset[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as any) });
        });
        const activeList = list.filter((a) => !a.isDeleted);
        setAssets(activeList);

        if (preselectedAssetId && activeList.some((a) => a.id === preselectedAssetId)) {
          setSelectedAssetIds([preselectedAssetId]);
        } else if (activeList.length > 0) {
          setSelectedAssetIds(activeList.slice(0, 4).map((a) => a.id));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, [preselectedAssetId]);

  const toggleField = (key: keyof typeof fields) => {
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAll = () => {
    if (selectedAssetIds.length === filteredAssets.length) {
      setSelectedAssetIds([]);
    } else {
      setSelectedAssetIds(filteredAssets.map((a) => a.id));
    }
  };

  const toggleAssetSelection = (id: string) => {
    if (selectedAssetIds.includes(id)) {
      setSelectedAssetIds(selectedAssetIds.filter((item) => item !== id));
    } else {
      setSelectedAssetIds([...selectedAssetIds, id]);
    }
  };

  const filteredAssets = assets.filter((item) => {
    if (filterBranch !== 'ALL' && item.branch !== filterBranch) return false;
    if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;
    return true;
  });

  const selectedAssets = assets.filter((a) => selectedAssetIds.includes(a.id));
  const assetsToPrint = selectedAssets.length > 0 ? selectedAssets : assets.slice(0, 1);

  const handlePrint = () => {
    console.log('[PRINT][BARCODE] button clicked');

    if (assetsToPrint.length === 0) {
      alert("Tidak ada item yang dapat dicetak.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
      return;
    }

    setIsPreparingPrint(true);
    try {
      const printableArea = document.getElementById('printable-barcode-area');
      if (printableArea) {
        printElement(printableArea, {
          title: `DKL_Label_Barcode_${assetsToPrint.length}_Aset`,
          landscape: labelSize === 'a4',
        }, printWindow);
      } else {
        printWindow.close();
      }
    } catch (err) {
      console.error('[PRINT ERROR]', err);
    } finally {
      setIsPreparingPrint(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Header - hidden when printing */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Studio Cetak Label Barcode & QR</h1>
          <p className="text-xs text-slate-500 mt-1">
            Konfigurasi tata letak, logo perusahaan, watermark, ukuran stiker, dan cetak massal
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            disabled={assets.length === 0 || isPreparingPrint}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-2 disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
            <span>Print Preview ({selectedAssets.length || 1})</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={assets.length === 0 || isPreparingPrint}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition flex items-center gap-2 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>
              {isPreparingPrint
                ? 'Mempersiapkan cetakan...'
                : selectedAssets.length <= 1
                ? 'Cetak 1 Label Sekarang'
                : `Cetak ${selectedAssets.length} Label Sekarang`}
            </span>
          </button>
        </div>
      </div>

      {/* Screen Controls & Preview Grid - hidden in print */}
      <div className="print:hidden grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configuration Panel */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-6">
          {/* Label Size & Format */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-600" />
              Ukuran Stiker & Format Barcode
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { id: 'small', label: 'Small (200px)' },
                { id: 'medium', label: 'Medium (280px)' },
                { id: 'large', label: 'Large (360px)' },
                { id: 'a4', label: 'Lembar A4 Grid' },
              ].map((sizeOpt) => (
                <button
                  key={sizeOpt.id}
                  onClick={() => setLabelSize(sizeOpt.id as any)}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition text-left ${
                    labelSize === sizeOpt.id
                      ? 'border-sky-500 bg-sky-50 text-sky-700 ring-2 ring-sky-500/20'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  {sizeOpt.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {(['CODE128', 'CODE39', 'EAN13'] as BarcodeFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setBarcodeFormat(fmt)}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border transition ${
                    barcodeFormat === fmt
                      ? 'border-slate-800 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Fields Selection Checkboxes */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-600" />
              Elemen Tampilan Stiker
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { key: 'logo', label: 'Logo PT' },
                { key: 'watermark', label: 'Watermark Logo' },
                { key: 'companyName', label: 'Nama PT' },
                { key: 'assetName', label: 'Nama Aset' },
                { key: 'assetCode', label: 'Kode Aset' },
                { key: 'barcode', label: 'Garis Barcode' },
                { key: 'qr', label: 'QR Code' },
                { key: 'serialNumber', label: 'No. Seri (SN)' },
                { key: 'category', label: 'Kategori' },
                { key: 'brand', label: 'Merk' },
                { key: 'model', label: 'Model' },
                { key: 'branch', label: 'Cabang' },
                { key: 'location', label: 'Lokasi' },
                { key: 'pic', label: 'Nama PIC' },
              ].map((item) => {
                const isChecked = (fields as any)[item.key];
                return (
                  <button
                    key={item.key}
                    onClick={() => toggleField(item.key as any)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-left font-medium transition ${
                      isChecked
                        ? 'border-sky-200 bg-sky-50/60 text-sky-800'
                        : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-sky-600 flex-shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Asset Selection List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-600" />
                Pilih Aset ({selectedAssets.length}/{filteredAssets.length})
              </h3>
              <button
                onClick={handleSelectAll}
                className="text-[11px] font-bold text-sky-600 hover:text-sky-700"
              >
                {selectedAssetIds.length === filteredAssets.length ? 'Batal Semua' : 'Pilih Semua'}
              </button>
            </div>

            {/* Filter Controls */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                className="w-full text-xs font-semibold px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="ALL">Semua Cabang</option>
                <option value="SINGARAJA">Singaraja</option>
                <option value="TEJAKULA">Tejakula</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full text-xs font-semibold px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="ALL">Semua Kategori</option>
                {Array.from(new Set(assets.map((a) => a.category))).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 pr-1 border border-slate-200 rounded-xl p-2 bg-slate-50">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => toggleAssetSelection(asset.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer select-none transition ${
                    selectedAssetIds.includes(asset.id)
                      ? 'bg-sky-100/70 text-sky-900 font-bold border border-sky-200'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedAssetIds.includes(asset.id)}
                    onChange={() => {}}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span className="truncate flex-1">
                    {asset.assetCode} - {asset.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">{asset.branch}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="lg:col-span-2 bg-slate-100 p-6 rounded-2xl border border-slate-200 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-sky-600" /> Preview Label Stiker ({selectedAssets.length} Stiker)
            </span>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPreparingPrint || assets.length === 0}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isPreparingPrint ? 'Mempersiapkan...' : 'Cetak Preview'}</span>
            </button>
          </div>

          {selectedAssets.length === 0 ? (
            <div className="py-20 text-center text-xs text-slate-400">
              Pilih minimal 1 aset di panel samping untuk melihat pratinjau stiker.
            </div>
          ) : (
            <div className="w-full flex flex-wrap gap-4 justify-center overflow-auto max-h-[650px] p-4 bg-slate-200/50 rounded-2xl border border-slate-300">
              {selectedAssets.map((asset) => (
                <LabelCard
                  key={asset.id}
                  asset={asset}
                  fields={fields}
                  size={labelSize}
                  barcodeFormat={barcodeFormat}
                  companySettings={companySettings}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Print Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Print Preview Label Barcode & QR</h3>
                  <p className="text-xs text-slate-500">
                    Format: <span className="font-bold text-sky-700 uppercase">{labelSize}</span> • Total: {selectedAssets.length} Stiker Aset
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPreparingPrint || assets.length === 0}
                  onClick={handlePrint}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isPreparingPrint ? 'Mempersiapkan cetakan...' : 'Cetak Sekarang'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Content - Live Sheet Preview */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100/70">
              <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200 max-w-3xl mx-auto min-h-[300px]">
                <div className="flex flex-wrap gap-4 justify-center">
                  {selectedAssets.map((asset) => (
                    <LabelCard
                      key={asset.id}
                      asset={asset}
                      fields={fields}
                      size={labelSize}
                      barcodeFormat={barcodeFormat}
                      companySettings={companySettings}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
              <span>Pastikan ukuran kertas printer barcode sesuai dengan template stiker yang dipilih.</span>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Printable Area for printService & native print */}
      <div id="printable-barcode-area" className="hidden print:block print:p-0">
        <div className="flex flex-wrap gap-3.5 p-2">
          {assetsToPrint.map((asset) => (
            <LabelCard
              key={asset.id}
              asset={asset}
              fields={fields}
              size={labelSize}
              barcodeFormat={barcodeFormat}
              companySettings={companySettings}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Internal Label Card Component with watermark, barcode data URL & company logo
interface LabelCardProps {
  asset: Asset;
  fields: any;
  size: 'small' | 'medium' | 'large' | 'a4';
  barcodeFormat: BarcodeFormat;
  companySettings: CompanySettings;
}

const LabelCard: React.FC<LabelCardProps> = ({ asset, fields, size, barcodeFormat, companySettings }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rawCode = asset.barcode || asset.assetCode || '8990000000019';
  const effectiveCode = barcodeFormat === 'EAN13' ? normalizeToEan13(rawCode) : rawCode;

  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string>(() => {
    if (fields.barcode) {
      return generateBarcodeDataUrl(effectiveCode, {
        format: barcodeFormat,
        height: size === 'small' ? 24 : size === 'medium' ? 36 : 48,
        width: size === 'small' ? 1.2 : 1.6,
        displayValue: false,
      });
    }
    return '';
  });
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    // Generate barcode as crisp data URL
    if (fields.barcode) {
      const bUrl = generateBarcodeDataUrl(effectiveCode, {
        format: barcodeFormat,
        height: size === 'small' ? 24 : size === 'medium' ? 36 : 48,
        width: size === 'small' ? 1.2 : 1.6,
        displayValue: false,
      });
      setBarcodeDataUrl(bUrl);

      // Also render to canvas fallback if present
      if (canvasRef.current) {
        renderBarcodeToCanvas(canvasRef.current, effectiveCode, {
          format: barcodeFormat,
          height: size === 'small' ? 24 : size === 'medium' ? 36 : 48,
          width: size === 'small' ? 1.2 : 1.6,
          displayValue: false,
        });
      }
    } else {
      setBarcodeDataUrl('');
    }

    // Generate QR code data URL
    if (fields.qr) {
      generateQrDataUrl(effectiveCode, size === 'small' ? 64 : 96)
        .then(setQrDataUrl)
        .catch(() => {});
    } else {
      setQrDataUrl('');
    }
  }, [asset, fields, size, barcodeFormat, effectiveCode]);

  const sizeStyles = {
    small: 'w-[200px] p-2 text-[9px]',
    medium: 'w-[280px] p-3 text-[10px]',
    large: 'w-[360px] p-4 text-xs',
    a4: 'w-[280px] p-3 text-[10px]',
  };

  const logoSizes = {
    small: 'h-4 max-w-[40px]',
    medium: 'h-5 max-w-[54px]',
    large: 'h-6 max-w-[70px]',
    a4: 'h-5 max-w-[54px]',
  };

  return (
    <div
      className={`relative overflow-hidden bg-white border-2 border-slate-900 rounded-lg shadow-sm text-slate-900 flex flex-col justify-between break-inside-avoid print:shadow-none ${sizeStyles[size]}`}
    >
      {/* Background Watermark Logo (if enabled) - subtle opacity */}
      {fields.watermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
          {companySettings.logoUrl ? (
            <img
              src={companySettings.logoUrl}
              alt=""
              className="w-3/5 h-3/5 object-contain opacity-[0.08] grayscale contrast-125 select-none"
            />
          ) : (
            <span className="text-4xl font-black text-slate-900 opacity-[0.06] select-none tracking-widest">
              DKL
            </span>
          )}
        </div>
      )}

      {/* Content Layer */}
      <div className="relative z-10 flex flex-col justify-between h-full">
        {/* Header: Company Name & Logo */}
        {(fields.logo || fields.companyName) && (
          <div className="flex items-center justify-between border-b border-slate-900 pb-1 mb-1.5 leading-tight">
            {fields.companyName && (
              <span className="font-black tracking-tight text-[10px] uppercase truncate">
                {companySettings.companyName || 'PT DARMA KARYA LESTARI'}
              </span>
            )}
            {fields.logo && (
              <div className="flex items-center flex-shrink-0 ml-1">
                {companySettings.logoUrl ? (
                  <img
                    src={companySettings.logoUrl}
                    alt="Logo"
                    className={`${logoSizes[size]} w-auto object-contain rounded`}
                  />
                ) : (
                  <span className="font-extrabold text-[9px] bg-slate-900 text-white px-1.5 py-0.2 rounded">
                    DKL
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Main Body */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0 space-y-0.5">
            {fields.assetName && (
              <p className="font-extrabold truncate text-[11px] leading-tight text-slate-900">{asset.name}</p>
            )}

            {fields.assetCode && (
              <p className="font-mono font-bold text-[10px] text-sky-800">{asset.assetCode}</p>
            )}

            {fields.category && (
              <p className="text-[9px] text-slate-600 truncate">Kat: {asset.category}</p>
            )}

            {(fields.brand || fields.model) && (
              <p className="text-[9px] text-slate-600 truncate">
                {fields.brand && asset.brand} {fields.model && asset.model && `• ${asset.model}`}
              </p>
            )}

            {fields.serialNumber && asset.serialNumber && (
              <p className="font-mono text-[9px] text-slate-500 truncate">SN: {asset.serialNumber}</p>
            )}

            {(fields.branch || fields.location) && (
              <p className="text-[9px] text-slate-700 font-semibold truncate">
                {fields.branch && asset.branch}
                {fields.branch && fields.location && ' • '}
                {fields.location && asset.location}
              </p>
            )}

            {fields.pic && asset.pic && (
              <p className="text-[8px] text-slate-500 truncate">PIC: {asset.pic}</p>
            )}
          </div>

          {fields.qr && qrDataUrl && (
            <div className="bg-white p-0.5 rounded border border-slate-200 flex-shrink-0 shadow-2xs">
              <img src={qrDataUrl} alt="QR" className="w-12 h-12 object-contain" />
            </div>
          )}
        </div>

        {/* Barcode Layer (Clean white background container for optimal contrast) */}
        {fields.barcode && (
          <div className="mt-1.5 pt-1 border-t border-slate-200 text-center bg-white/95 rounded">
            {barcodeDataUrl ? (
              <img src={barcodeDataUrl} alt="Barcode" className="max-w-full mx-auto" />
            ) : (
              <canvas ref={canvasRef} className="max-w-full mx-auto" />
            )}
            <p className="font-mono text-[8px] font-bold tracking-widest text-slate-700">
              {effectiveCode}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
