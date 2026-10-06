import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  ShieldCheck,
  UserCheck,
  UserX,
  Mail,
  Building2,
  AlertCircle,
  CheckCircle,
  Phone,
  Edit2,
  Lock,
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
import { UserProfile, UserRole, BranchScope } from '../../types';
import { logAuditEvent } from '../../services/auditService';

export const UserManagementPage: React.FC = () => {
  const { user, profile, role } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [targetRole, setTargetRole] = useState<UserRole>('USER');
  const [targetBranch, setTargetBranch] = useState<BranchScope>('SINGARAJA');
  const [department, setDepartment] = useState('Operasional');
  const [phone, setPhone] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as UserProfile) }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setUsers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const activeAdminsCount = users.filter((u) => u.role === 'ADMIN' && u.isActive).length;

  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed) {
      setErrorMsg('Alamat email wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        // Last Admin Protection
        if (
          editingUser.role === 'ADMIN' &&
          editingUser.isActive &&
          targetRole !== 'ADMIN' &&
          activeAdminsCount <= 1
        ) {
          setErrorMsg('Minimal harus ada satu Administrator aktif. Tidak dapat mengubah role admin terakhir.');
          setSubmitting(false);
          return;
        }

        await updateDoc(doc(db, 'users', editingUser.uid), {
          displayName: displayName.trim(),
          role: targetRole,
          branch: targetBranch,
          department,
          phone,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || '',
        });

        await logAuditEvent({
          action: 'USER_UPDATE',
          module: 'USER_MANAGEMENT',
          documentId: editingUser.uid,
          userId: user?.uid || '',
          userEmail: user?.email || '',
          userRole: role,
          branch: targetBranch,
          details: `User ${editingUser.email} diubah datanya. Role: ${targetRole}, Cabang: ${targetBranch}`,
        });
      } else {
        // Generate a synthetic or deterministically hashed document id based on email
        const uid = 'u_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

        const newProfile: UserProfile = {
          uid,
          email: emailTrimmed,
          displayName: displayName.trim() || emailTrimmed.split('@')[0],
          role: targetRole,
          branch: targetBranch,
          department,
          phone,
          isActive: true,
          createdAt: new Date().toISOString(),
          createdBy: user?.email || '',
        };

        await setDoc(doc(db, 'users', uid), newProfile);

        await logAuditEvent({
          action: 'USER_CREATE',
          module: 'USER_MANAGEMENT',
          documentId: uid,
          userId: user?.uid || '',
          userEmail: user?.email || '',
          userRole: role,
          branch: targetBranch,
          details: `Akun baru diotorisasi oleh Admin: ${emailTrimmed} (${targetRole} - ${targetBranch})`,
        });
      }

      setModalOpen(false);
      setEditingUser(null);
      setEmail('');
      setDisplayName('');
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Gagal menyimpan profil pengguna.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (targetUser: UserProfile) => {
    // Last Admin Account Protection check
    if (targetUser.role === 'ADMIN' && targetUser.isActive && activeAdminsCount <= 1) {
      alert('Minimal harus ada satu Administrator aktif. Akun ini tidak dapat dinonaktifkan.');
      return;
    }

    const nextState = !targetUser.isActive;
    const confirmAction = window.confirm(
      `Apakah Anda yakin ingin ${nextState ? 'mengaktifkan' : 'menonaktifkan'} akun ${targetUser.email}?`
    );
    if (!confirmAction) return;

    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        isActive: nextState,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });

      await logAuditEvent({
        action: nextState ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
        module: 'USER_MANAGEMENT',
        documentId: targetUser.uid,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userRole: role,
        branch: targetUser.branch,
        details: `Status akun ${targetUser.email} diubah menjadi: ${nextState ? 'AKTIF' : 'NON-AKTIF'}`,
      });

      fetchUsers();
    } catch (e) {
      console.error(e);
      alert('Gagal mengubah status aktif pengguna.');
    }
  };

  const openEditModal = (u: UserProfile) => {
    setEditingUser(u);
    setEmail(u.email);
    setDisplayName(u.displayName);
    setTargetRole(u.role);
    setTargetBranch(u.branch);
    setDepartment(u.department || '');
    setPhone(u.phone || '');
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-600" />
            <span>Manajemen Pengguna (User Management)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Closed Registration: Otorisasi akun staf, penugasan cabang (Singaraja/Tejakula), dan kontrol peran (RBAC)
          </p>
        </div>

        <button
          onClick={() => {
            setEditingUser(null);
            setEmail('');
            setDisplayName('');
            setTargetRole('USER');
            setTargetBranch('SINGARAJA');
            setDepartment('Operasional');
            setPhone('');
            setModalOpen(true);
          }}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Tambah Akun Pengguna
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat daftar pengguna...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">Belum ada akun pengguna terdaftar.</div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Nama & Email</th>
                  <th className="py-3 px-4">Peran (Role)</th>
                  <th className="py-3 px-4">Cabang Otoritas</th>
                  <th className="py-3 px-4">Departemen</th>
                  <th className="py-3 px-4 text-center">Status Akun</th>
                  <th className="py-3 px-4 text-right">Aksi Kelola</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{u.displayName}</div>
                      <div className="text-[11px] text-slate-500">{u.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          u.role === 'ADMIN'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : u.role === 'AUDITOR'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700">{u.branch}</td>
                    <td className="py-3 px-4 text-slate-600">{u.department || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {u.isActive ? 'AKTIF' : 'NON-AKTIF'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition"
                          title="Edit Pengguna"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`p-1.5 rounded-lg transition ${
                            u.isActive
                              ? 'text-rose-600 hover:bg-rose-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={u.isActive ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                        >
                          {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal User Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingUser ? 'Ubah Akun Pengguna' : 'Otorisasi Akun Baru (Closed Registration)'}
            </h3>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateOrUpdateUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Pengguna *</label>
                <input
                  type="email"
                  required
                  disabled={Boolean(editingUser)}
                  placeholder="staf@darmakaryalestari.co.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium disabled:opacity-60"
                />
                {!editingUser && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    User dapat login menggunakan Email/Password atau Google Sign-In setelah akun ini didaftarkan.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  placeholder="Nama Lengkap Staf"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Peran Akses (Role) *</label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sky-800"
                  >
                    <option value="USER">USER (Operasional)</option>
                    <option value="ADMIN">ADMIN (Full Access)</option>
                    <option value="AUDITOR">AUDITOR (Read Only)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cakupan Cabang *</label>
                  <select
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value as BranchScope)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sky-800"
                  >
                    <option value="SINGARAJA">SINGARAJA</option>
                    <option value="TEJAKULA">TEJAKULA</option>
                    <option value="ALL">SEMUA CABANG (PUSAT)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Departemen</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nomor Telepon / WA</label>
                  <input
                    type="text"
                    placeholder="08123456789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
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
                  {submitting ? 'Menyimpan...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
