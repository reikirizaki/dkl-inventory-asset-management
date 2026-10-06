import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building2,
  Camera,
  Save,
  CheckCircle,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { CompanySettings } from '../../types';
import { getCompanySettings, updateCompanySettings } from '../../services/companyService';
import { uploadImageToCloudinary } from '../../services/cloudinary';
import { CompanyLogo } from '../../components/common/CompanyLogo';
import { logAuditEvent } from '../../services/auditService';

export const SettingsPage: React.FC = () => {
  const { user, role, branch } = useAuth();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');

  // Logo file
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    getCompanySettings().then((s) => {
      setSettings(s);
      setCompanyName(s.companyName || 'PT DARMA KARYA LESTARI');
      setCompanyAddress(s.companyAddress || '');
      setCompanyPhone(s.companyPhone || '');
      setCompanyEmail(s.companyEmail || '');
      setLogoPreview(s.logoUrl || null);
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'ADMIN') {
      alert('Hanya Administrator yang memiliki wewenang mengubah pengaturan perusahaan.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let finalLogoUrl = settings?.logoUrl;
      let finalLogoPublicId = settings?.logoPublicId;

      if (logoFile) {
        setUploadingLogo(true);
        try {
          const uploadRes = await uploadImageToCloudinary(logoFile);
          finalLogoUrl = uploadRes.secure_url;
          finalLogoPublicId = uploadRes.public_id;
        } catch (uploadErr: any) {
          setErrorMsg(uploadErr.message || 'Gagal mengupload logo ke Cloudinary.');
          setSaving(false);
          setUploadingLogo(false);
          return;
        }
        setUploadingLogo(false);
      }

      await updateCompanySettings(
        {
          companyName: companyName.trim(),
          companyAddress: companyAddress.trim(),
          companyPhone: companyPhone.trim(),
          companyEmail: companyEmail.trim(),
          logoUrl: finalLogoUrl,
          logoPublicId: finalLogoPublicId,
        },
        user?.email || ''
      );

      await logAuditEvent({
        action: 'SETTINGS_UPDATE',
        module: 'SETTINGS',
        documentId: 'main',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: 'ALL',
        details: `Pengaturan profil dan identitas perusahaan diperbarui oleh ${user?.email}`,
      });

      setSuccessMsg('Pengaturan perusahaan berhasil disimpan.');
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Gagal memperbarui pengaturan perusahaan.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-semibold">Memuat pengaturan...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-600" />
          <span>Pengaturan Perusahaan & Branding</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Identitas resmi PT Darma Karya Lestari, Logo Cloudinary, dan parameter sistem
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card: Logo Branding */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Camera className="w-4 h-4 text-sky-600" />
            <span>Logo Perusahaan (Digunakan pada Seluruh Surat, Barcode & Header)</span>
          </h2>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-32 h-32 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center p-2 overflow-hidden flex-shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain rounded-xl" />
              ) : (
                <CompanyLogo size="lg" />
              )}
            </div>

            <div className="space-y-2 text-xs flex-1">
              {role === 'ADMIN' ? (
                <>
                  <label className="inline-block px-4 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-bold rounded-xl cursor-pointer transition">
                    <span>Ganti / Upload Logo Baru</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setLogoFile(e.target.files[0]);
                          setLogoPreview(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  <p className="text-slate-500 text-[11px]">
                    Unggah logo beresolusi tinggi dengan latar belakang transparan (PNG atau WEBP). Maksimal 5 MB.
                  </p>
                </>
              ) : (
                <p className="text-slate-500 text-xs">
                  Hanya Administrator yang memiliki wewenang mengganti logo resmi perusahaan.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Card: Corporate Info */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Informasi Badan Usaha
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Nama Resmi Perusahaan *</label>
              <input
                type="text"
                required
                disabled={role !== 'ADMIN'}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Alamat Kantor Pusat</label>
              <input
                type="text"
                disabled={role !== 'ADMIN'}
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Nomor Telepon Kantor</label>
              <input
                type="text"
                disabled={role !== 'ADMIN'}
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Resmi</label>
              <input
                type="email"
                disabled={role !== 'ADMIN'}
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>
        </div>

        {role === 'ADMIN' && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
