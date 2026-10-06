import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  Camera,
  QrCode,
  Save,
  AlertCircle,
  CheckCircle,
  Building2,
  Trash2,
} from 'lucide-react';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { Asset, AssetCondition, AssetStatus } from '../../types';
import { uploadImageToCloudinary } from '../../services/cloudinary';
import { logAuditEvent, logAssetHistory } from '../../services/auditService';
import {
  generateAssetCode,
  renderBarcodeToCanvas,
  generateQrDataUrl,
} from '../../barcode/barcodeGenerator';

export const AssetFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const { user, role, branch: userBranch } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [assetCode, setAssetCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [qrCodeData, setQrCodeData] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Elektronik & Komputer');
  const [subCategory, setSubCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [vendor, setVendor] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [branch, setBranch] = useState<'SINGARAJA' | 'TEJAKULA'>(
    userBranch === 'TEJAKULA' ? 'TEJAKULA' : 'SINGARAJA'
  );
  const [location, setLocation] = useState('Ruang Kantor Utama');
  const [department, setDepartment] = useState('Operasional');
  const [unit, setUnit] = useState('');
  const [pic, setPic] = useState('');
  const [condition, setCondition] = useState<AssetCondition>('BAIK');
  const [status, setStatus] = useState<AssetStatus>('AKTIF');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [warrantyStart, setWarrantyStart] = useState('');
  const [warrantyEnd, setWarrantyEnd] = useState('');

  // Media states
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPublicId, setPhotoPublicId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const barcodeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate code on branch/category change if new
  useEffect(() => {
    if (!isEditing && !assetCode) {
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      const generated = generateAssetCode(branch, category, randomSeq);
      setAssetCode(generated);
      setBarcode(generated);
    }
  }, [branch, category, isEditing, assetCode]);

  // Update Barcode Canvas and QR
  useEffect(() => {
    const codeToRender = barcode || assetCode;
    if (barcodeCanvasRef.current && codeToRender) {
      renderBarcodeToCanvas(barcodeCanvasRef.current, codeToRender, {
        format: 'CODE128',
        height: 45,
        width: 1.8,
      });
    }

    if (codeToRender) {
      generateQrDataUrl(codeToRender).then(setQrCodeData).catch(() => {});
    }
  }, [barcode, assetCode]);

  // Fetch asset if editing
  useEffect(() => {
    if (!isEditing || !id) return;
    const loadAsset = async () => {
      try {
        const snap = await getDoc(doc(db, 'assets', id));
        if (snap.exists()) {
          const data = snap.data() as Asset;
          setAssetCode(data.assetCode || '');
          setBarcode(data.barcode || data.assetCode || '');
          setName(data.name || '');
          setCategory(data.category || '');
          setSubCategory(data.subCategory || '');
          setBrand(data.brand || '');
          setModel(data.model || '');
          setSerialNumber(data.serialNumber || '');
          setPurchaseDate(data.purchaseDate || '');
          setPurchasePrice(data.purchasePrice ?? '');
          setVendor(data.vendor || '');
          setInvoiceNumber(data.invoiceNumber || '');
          setPurchaseOrder(data.purchaseOrder || '');
          setBranch(data.branch || 'SINGARAJA');
          setLocation(data.location || '');
          setDepartment(data.department || '');
          setUnit(data.unit || '');
          setPic(data.pic || '');
          setCondition(data.condition || 'BAIK');
          setStatus(data.status || 'AKTIF');
          setDescription(data.description || '');
          setNotes(data.notes || '');
          setWarrantyStart(data.warrantyStart || '');
          setWarrantyEnd(data.warrantyEnd || '');
          setPhotoUrl(data.photoUrl || '');
          setPhotoPublicId(data.photoPublicId || '');
          setPreviewUrl(data.photoUrl || null);
        } else {
          setErrorMsg('Aset tidak ditemukan.');
        }
      } catch (e) {
        console.error(e);
        setErrorMsg('Gagal memuat data aset.');
      } finally {
        setInitialLoading(false);
      }
    };
    loadAsset();
  }, [id, isEditing]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg('Nama aset wajib diisi.');
      return;
    }
    if (!assetCode.trim()) {
      setErrorMsg('Kode aset wajib diisi.');
      return;
    }

    setLoading(true);

    try {
      let finalPhotoUrl = photoUrl;
      let finalPhotoPublicId = photoPublicId;

      // Upload to Cloudinary if new file selected
      if (selectedFile) {
        setUploadingImage(true);
        try {
          const uploadRes = await uploadImageToCloudinary(selectedFile);
          finalPhotoUrl = uploadRes.secure_url;
          finalPhotoPublicId = uploadRes.public_id;
        } catch (uploadErr: any) {
          setErrorMsg(uploadErr.message || 'Upload foto ke Cloudinary gagal. Silakan coba kembali.');
          setLoading(false);
          setUploadingImage(false);
          return;
        }
        setUploadingImage(false);
      }

      const assetId = isEditing && id ? id : doc(collection(db, 'assets')).id;

      const payload: Partial<Asset> = {
        assetCode: assetCode.trim(),
        barcode: barcode.trim() || assetCode.trim(),
        qrCode: qrCodeData,
        name: name.trim(),
        category,
        subCategory,
        brand,
        model,
        serialNumber,
        purchaseDate,
        purchasePrice: purchasePrice === '' ? 0 : Number(purchasePrice),
        vendor,
        invoiceNumber,
        purchaseOrder,
        branch,
        location,
        department,
        unit,
        pic,
        condition,
        status,
        photoUrl: finalPhotoUrl,
        photoPublicId: finalPhotoPublicId,
        description,
        notes,
        warrantyStart,
        warrantyEnd,
        isDeleted: false,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      };

      if (!isEditing) {
        payload.id = assetId;
        payload.createdAt = new Date().toISOString();
        payload.createdBy = user?.email || '';
      }

      await setDoc(doc(db, 'assets', assetId), payload, { merge: true });

      // Log asset history
      await logAssetHistory({
        assetId,
        assetCode: assetCode.trim(),
        action: isEditing ? 'UPDATE_ASSET' : 'CREATE_ASSET',
        details: isEditing
          ? `Perubahan data aset oleh ${user?.email}`
          : `Aset baru diregistrasikan di cabang ${branch} oleh ${user?.email}`,
        performedBy: user?.uid || '',
        userEmail: user?.email || '',
      });

      // Log audit
      await logAuditEvent({
        action: isEditing ? 'UPDATE' : 'CREATE',
        module: 'ASSETS',
        documentId: assetId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch,
        details: `${isEditing ? 'Pembaruan' : 'Pendaftaran'} aset: ${assetCode.trim()} - ${name.trim()}`,
      });

      setSuccessMsg(`Aset ${assetCode} berhasil disimpan.`);
      setTimeout(() => {
        navigate(`/assets/${assetId}`);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Data gagal disimpan ke database. Silakan periksa kembali isian Anda.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-semibold">Memuat data aset...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            to="/assets"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              {isEditing ? 'Ubah Informasi Aset' : 'Registrasi Aset Baru'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              PT Darma Karya Lestari • Cabang {branch}
            </p>
          </div>
        </div>
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Identitas & Barcode */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Identitas Utama & Kode Barcode
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Aset (Unik) *</label>
              <input
                type="text"
                required
                value={assetCode}
                onChange={(e) => {
                  setAssetCode(e.target.value);
                  setBarcode(e.target.value);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Barcode (CODE 128)</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Aset *</label>
              <input
                type="text"
                required
                placeholder="misal: Laptop Lenovo ThinkPad L14"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kategori *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
              >
                <option value="Elektronik & Komputer">Elektronik & Komputer</option>
                <option value="Mesin & Alat Berat">Mesin & Alat Berat</option>
                <option value="Kendaraan Operasional">Kendaraan Operasional</option>
                <option value="Furniture & Perlengkapan Kantor">Furniture & Perlengkapan Kantor</option>
                <option value="Peralatan Teknik & Tools">Peralatan Teknik & Tools</option>
                <option value="Gedung & Infrastruktur">Gedung & Infrastruktur</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Merk / Brand</label>
              <input
                type="text"
                placeholder="misal: Dell, Toyota, Makita"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Model / Tipe</label>
              <input
                type="text"
                placeholder="misal: Core i7 16GB"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Seri (Serial Number)</label>
              <input
                type="text"
                placeholder="SN123456789"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Barcode & QR Code Live Visualizer */}
          <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-around gap-4">
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Barcode Preview</p>
              <canvas ref={barcodeCanvasRef} className="max-w-[200px] h-12 mx-auto bg-white p-1 rounded" />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">QR Code Preview</p>
              {qrCodeData ? (
                <img src={qrCodeData} alt="QR Preview" className="w-16 h-16 mx-auto bg-white p-1 rounded shadow-2xs" />
              ) : (
                <div className="w-16 h-16 bg-slate-200 rounded flex items-center justify-center text-slate-400">
                  <QrCode className="w-6 h-6" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Foto Aset (Cloudinary) */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Camera className="w-4 h-4 text-sky-600" />
            <span>Foto Aset (Cloudinary Direct Storage)</span>
          </h2>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-36 h-36 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-3">
                  <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <span className="text-[10px] text-slate-400 font-semibold">Belum ada foto</span>
                </div>
              )}
            </div>

            <div className="space-y-2 flex-1 text-xs">
              <label className="inline-block px-4 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-bold rounded-xl cursor-pointer transition">
                <span>Pilih Foto dari Perangkat / Kamera</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <p className="text-slate-500 text-[11px]">
                Format yang didukung: JPG, PNG, WEBP. Ukuran file maksimal 5 MB.
              </p>
              {selectedFile && (
                <p className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Foto terpilih: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Penempatan & Status */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Penempatan, Penanggung Jawab & Status
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cabang Penempatan *</label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
              >
                <option value="SINGARAJA">SINGARAJA</option>
                <option value="TEJAKULA">TEJAKULA</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Lokasi / Ruangan</label>
              <input
                type="text"
                placeholder="misal: Lantai 2, Ruang Server, Workshop"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Departemen</label>
              <input
                type="text"
                placeholder="misal: IT, Operasional, Umum"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Unit</label>
              <input
                type="text"
                placeholder="misal: Unit Lapangan 1"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">PIC (Penanggung Jawab)</label>
              <input
                type="text"
                placeholder="Nama staf penanggung jawab"
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kondisi Fisik *</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as AssetCondition)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
              >
                <option value="BAIK">BAIK</option>
                <option value="RUSAK RINGAN">RUSAK RINGAN</option>
                <option value="RUSAK BERAT">RUSAK BERAT</option>
                <option value="HILANG">HILANG</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Status Operasional *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
              >
                <option value="AKTIF">AKTIF</option>
                <option value="BARU">BARU</option>
                <option value="DIPINJAM">DIPINJAM</option>
                <option value="DIKEMBALIKAN">DIKEMBALIKAN</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="RUSAK">RUSAK</option>
                <option value="DALAM PERBAIKAN">DALAM PERBAIKAN</option>
                <option value="SELESAI DIPERBAIKI">SELESAI DIPERBAIKI</option>
                <option value="HILANG">HILANG</option>
                <option value="TIDAK AKTIF">TIDAK AKTIF</option>
                <option value="DISPOSAL">DISPOSAL</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card 4: Pengadaan & Garansi */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Informasi Pembelian & Garansi
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Pembelian</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Harga Pembelian (Rp)</label>
              <input
                type="number"
                placeholder="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pemasok / Vendor</label>
              <input
                type="text"
                placeholder="PT Sumber Makmur"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Faktur / Invoice</label>
              <input
                type="text"
                placeholder="INV-2026-001"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Garansi Mulai</label>
              <input
                type="date"
                value={warrantyStart}
                onChange={(e) => setWarrantyStart(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Garansi Selesai</label>
              <input
                type="date"
                value={warrantyEnd}
                onChange={(e) => setWarrantyEnd(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan</label>
            <textarea
              rows={3}
              placeholder="Deskripsi spesifikasi khusus, riwayat kondisi, dsb."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link
            to="/assets"
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
          >
            Batal
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{uploadingImage ? 'Mengupload foto ke Cloudinary...' : 'Menyimpan data...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Simpan Aset</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
