import React, { useState, useEffect } from 'react';
import {
  Database,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  Building2,
  MapPin,
  Tag,
  Briefcase,
  Wrench,
  Users,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { MasterItem } from '../../types';
import { logAuditEvent } from '../../services/auditService';

type MasterCategoryType =
  | 'categories'
  | 'locations'
  | 'departments'
  | 'branches'
  | 'pics'
  | 'vendors'
  | 'units'
  | 'technicians';

export const MasterDataPage: React.FC = () => {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<MasterCategoryType>('categories');
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterItem | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [branchScope, setBranchScope] = useState<'SINGARAJA' | 'TEJAKULA' | 'ALL'>('ALL');
  const [submitting, setSubmitting] = useState(false);

  const tabs = [
    { key: 'categories', label: 'Kategori Aset & Item', icon: Tag },
    { key: 'locations', label: 'Lokasi & Ruangan', icon: MapPin },
    { key: 'departments', label: 'Departemen', icon: Briefcase },
    { key: 'branches', label: 'Cabang Perusahaan', icon: Building2 },
    { key: 'pics', label: 'PIC (Penanggung Jawab)', icon: Users },
    { key: 'vendors', label: 'Pemasok & Vendor', icon: Building2 },
    { key: 'units', label: 'Unit Operasional', icon: Briefcase },
    { key: 'technicians', label: 'Teknisi / Bengkel', icon: Wrench },
  ];

  const fetchItems = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, activeTab));
      const list: MasterItem[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setItems(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [activeTab]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const docId = editingItem ? editingItem.id : doc(collection(db, activeTab)).id;

      const payload: MasterItem = {
        id: docId,
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
        branch: branchScope,
        status: 'ACTIVE',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      };

      if (!editingItem) {
        payload.createdAt = new Date().toISOString();
        payload.createdBy = user?.email || '';
      }

      await setDoc(doc(db, activeTab, docId), payload, { merge: true });

      await logAuditEvent({
        action: editingItem ? 'UPDATE_MASTER' : 'CREATE_MASTER',
        module: 'MASTER_DATA',
        documentId: docId,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: branchScope,
        details: `${editingItem ? 'Pembaruan' : 'Penambahan'} master ${activeTab}: ${name.trim()}`,
      });

      setModalOpen(false);
      setEditingItem(null);
      setName('');
      setCode('');
      setDescription('');
      fetchItems();
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan data master.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (item: MasterItem) => {
    setEditingItem(item);
    setName(item.name || '');
    setCode(item.code || '');
    setDescription(item.description || '');
    setBranchScope((item.branch as any) || 'ALL');
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-sky-600" />
            <span>Master Data Referensi Sistem</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Standarisasi kategori, lokasi fisik, departemen, PIC, dan vendor PT Darma Karya Lestari
          </p>
        </div>

        {role !== 'AUDITOR' && (
          <button
            onClick={() => {
              setEditingItem(null);
              setName('');
              setCode('');
              setDescription('');
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Tambah Data
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as MasterCategoryType)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                isActive
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat data referensi...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            Belum ada entri data untuk kategori ini. Klik Tambah Data untuk membuat entri pertama.
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Nama Entri</th>
                  <th className="py-3 px-4">Kode Singkat</th>
                  <th className="py-3 px-4">Cabang Scope</th>
                  <th className="py-3 px-4">Deskripsi / Keterangan</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{item.name}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-sky-800">{item.code || '-'}</td>
                    <td className="py-3 px-4 text-slate-600 font-medium">{item.branch || 'ALL'}</td>
                    <td className="py-3 px-4 text-slate-500">{item.description || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      {role !== 'AUDITOR' && (
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add / Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingItem ? 'Ubah Data Referensi' : 'Tambah Entri Master Baru'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Entri *</label>
                <input
                  type="text"
                  required
                  placeholder="misal: Komputer & Laptop / Bengkel Sentral"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kode Singkat</label>
                  <input
                    type="text"
                    placeholder="misal: LAP, SGR, IT"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cakupan Cabang</label>
                  <select
                    value={branchScope}
                    onChange={(e) => setBranchScope(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sky-800"
                  >
                    <option value="ALL">SEMUA CABANG</option>
                    <option value="SINGARAJA">SINGARAJA</option>
                    <option value="TEJAKULA">TEJAKULA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Deskripsi Tambahan</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan peruntukan atau kontak..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
                  {submitting ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
