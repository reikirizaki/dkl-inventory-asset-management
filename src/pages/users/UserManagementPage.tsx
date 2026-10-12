import React, { useState, useEffect, useMemo } from 'react';
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
  Eye,
  EyeOff,
  KeyRound,
  Search,
  Filter,
  Clock,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { UserProfile, UserRole, BranchScope } from '../../types';
import {
  createUserWithAuthAndProfile,
  updateUserProfile,
  toggleUserStatus,
  sendUserPasswordReset,
} from '../../services/userService';

export const UserManagementPage: React.FC = () => {
  const { user, role } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal & Form State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form Fields
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [targetRole, setTargetRole] = useState<UserRole>('USER');
  const [targetBranch, setTargetBranch] = useState<BranchScope>('SINGARAJA');
  const [department, setDepartment] = useState('Operasional');
  const [phone, setPhone] = useState('');
  const [accountStatus, setAccountStatus] = useState<boolean>(true);

  // Table Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [filterBranch, setFilterBranch] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as UserProfile) }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setUsers(list);
    } catch (e: any) {
      console.error('Fetch users error:', e);
      setErrorMsg('Gagal memuat daftar pengguna dari Firestore.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const activeAdminsCount = useMemo(() => {
    return users.filter((u) => u.role === 'ADMIN' && u.isActive).length;
  }, [users]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const queryLower = searchQuery.toLowerCase().trim();
      const matchSearch =
        !queryLower ||
        u.displayName.toLowerCase().includes(queryLower) ||
        u.email.toLowerCase().includes(queryLower) ||
        (u.phone && u.phone.includes(queryLower)) ||
        (u.department && u.department.toLowerCase().includes(queryLower));

      const matchRole = filterRole === 'ALL' || u.role === filterRole;
      const matchBranch = filterBranch === 'ALL' || u.branch === filterBranch;
      const matchStatus =
        filterStatus === 'ALL' ||
        (filterStatus === 'ACTIVE' && u.isActive) ||
        (filterStatus === 'INACTIVE' && !u.isActive);

      return matchSearch && matchRole && matchBranch && matchStatus;
    });
  }, [users, searchQuery, filterRole, filterBranch, filterStatus]);

  const resetForm = () => {
    setEditingUser(null);
    setEmail('');
    setDisplayName('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setTargetRole('USER');
    setTargetBranch('SINGARAJA');
    setDepartment('Operasional');
    setPhone('');
    setAccountStatus(true);
    setErrorMsg(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (u: UserProfile) => {
    setErrorMsg(null);
    setEditingUser(u);
    setEmail(u.email);
    setDisplayName(u.displayName);
    setPassword('');
    setConfirmPassword('');
    setTargetRole(u.role);
    setTargetBranch(u.branch);
    setDepartment(u.department || 'Operasional');
    setPhone(u.phone || '');
    setAccountStatus(u.isActive);
    setModalOpen(true);
  };

  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const emailTrimmed = email.trim().toLowerCase();
    const displayNameTrimmed = displayName.trim();

    if (!emailTrimmed) {
      setErrorMsg('Alamat email wajib diisi.');
      return;
    }
    if (!displayNameTrimmed) {
      setErrorMsg('Nama lengkap pengguna wajib diisi.');
      return;
    }

    // Password validation for new users
    if (!editingUser) {
      if (!password) {
        setErrorMsg('Kata sandi awal wajib diisi untuk pembuatan akun baru.');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('Kata sandi awal minimal 8 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Konfirmasi kata sandi tidak cocok dengan kata sandi awal.');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (editingUser) {
        // Last Admin Protection
        if (
          editingUser.role === 'ADMIN' &&
          editingUser.isActive &&
          (targetRole !== 'ADMIN' || !accountStatus) &&
          activeAdminsCount <= 1
        ) {
          setErrorMsg('Minimal harus ada 1 Administrator aktif. Tidak dapat mengubah peran atau menonaktifkan admin terakhir.');
          setSubmitting(false);
          return;
        }

        await updateUserProfile(editingUser.uid, {
          displayName: displayNameTrimmed,
          role: targetRole,
          branch: targetBranch,
          department: department.trim() || 'Operasional',
          phone: phone.trim() || '-',
          isActive: accountStatus,
          adminEmail: user?.email || '',
          adminUid: user?.uid || '',
          adminRole: role,
        });

        setSuccessMsg(`Profil akun ${editingUser.email} berhasil diperbarui.`);
      } else {
        // Create user in Firebase Auth and save profile to Firestore
        const newProfile = await createUserWithAuthAndProfile({
          email: emailTrimmed,
          password,
          displayName: displayNameTrimmed,
          role: targetRole,
          branch: targetBranch,
          department: department.trim() || 'Operasional',
          phone: phone.trim() || '-',
          isActive: accountStatus,
          adminEmail: user?.email || '',
          adminUid: user?.uid || '',
          adminRole: role,
        });

        setSuccessMsg(
          `Akun ${newProfile.displayName} (${newProfile.email}) berhasil dibuat di Firebase Authentication & profil disimpan ke Firestore. Pengguna kini dapat langsung masuk menggunakan email dan kata sandi awalnya.`
        );
      }

      setModalOpen(false);
      resetForm();
      await fetchUsers();
    } catch (err: any) {
      console.error('Error saving user:', err);
      setErrorMsg(err.message || 'Gagal memproses data akun pengguna.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (targetUser: UserProfile) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // Last Admin Account Protection check
    if (targetUser.role === 'ADMIN' && targetUser.isActive && activeAdminsCount <= 1) {
      alert('Minimal harus ada 1 Administrator aktif. Akun ini tidak dapat dinonaktifkan.');
      return;
    }

    const nextState = !targetUser.isActive;
    const confirmAction = window.confirm(
      `Apakah Anda yakin ingin ${nextState ? 'MENGAKTIFKAN' : 'MENONAKTIFKAN'} akun ${targetUser.email}?`
    );
    if (!confirmAction) return;

    try {
      await toggleUserStatus(targetUser, user?.uid || '', user?.email || '', role);
      setSuccessMsg(`Status akun ${targetUser.email} berhasil diubah menjadi: ${nextState ? 'AKTIF' : 'NONAKTIF'}.`);
      await fetchUsers();
    } catch (e: any) {
      console.error('Toggle user status error:', e);
      setErrorMsg('Gagal mengubah status aktif pengguna: ' + (e?.message || ''));
    }
  };

  const handleResetPassword = async (targetUser: UserProfile) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const confirmAction = window.confirm(
      `Kirim tautan reset kata sandi ke email ${targetUser.email} melalui Firebase Authentication?`
    );
    if (!confirmAction) return;

    try {
      await sendUserPasswordReset(targetUser.email, user?.uid || '', user?.email || '', role);
      setSuccessMsg(`Tautan reset kata sandi berhasil dikirim ke alamat email ${targetUser.email}.`);
    } catch (e: any) {
      console.error('Reset password error:', e);
      setErrorMsg('Gagal mengirim tautan reset kata sandi: ' + (e?.message || ''));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-600" />
            <span>Manajemen Pengguna (User Management)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Closed Registration: Pembuatan akun Firebase Authentication, penetapan peran (RBAC), cabang, dan reset password
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Tambah Akun Pengguna
        </button>
      </div>

      {/* Success Notification Banner */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-rose-700 hover:text-rose-900 font-bold text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama, email, telepon, atau departemen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-600">Peran:</span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-sky-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Peran</option>
              <option value="ADMIN">ADMIN</option>
              <option value="USER">USER</option>
              <option value="AUDITOR">AUDITOR</option>
            </select>
          </div>

          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-600">Cabang:</span>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-sky-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Cabang</option>
              <option value="SINGARAJA">SINGARAJA</option>
              <option value="TEJAKULA">TEJAKULA</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <span className="text-[11px] font-bold text-slate-600">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-sky-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Hanya Aktif</option>
              <option value="INACTIVE">Hanya Nonaktif</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">Memuat data pengguna dari Firebase...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            {searchQuery || filterRole !== 'ALL' || filterBranch !== 'ALL' || filterStatus !== 'ALL'
              ? 'Tidak ada akun pengguna yang sesuai dengan filter yang dipilih.'
              : 'Belum ada akun pengguna terdaftar.'}
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Nama Lengkap & Email</th>
                  <th className="py-3 px-4">Peran (Role)</th>
                  <th className="py-3 px-4">Cakupan Cabang</th>
                  <th className="py-3 px-4">Departemen</th>
                  <th className="py-3 px-4">Nomor Telepon</th>
                  <th className="py-3 px-4 text-center">Status Akun</th>
                  <th className="py-3 px-4">Terakhir Login</th>
                  <th className="py-3 px-4 text-right">Aksi Kelola</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 font-black flex items-center justify-center text-xs flex-shrink-0">
                          {u.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{u.displayName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                        </div>
                      </div>
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
                        {u.role === 'ADMIN'
                          ? 'ADMIN (Full Access)'
                          : u.role === 'AUDITOR'
                          ? 'AUDITOR (Read Only)'
                          : 'USER (Operasional)'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-800">
                        {u.branch === 'ALL' ? 'SEMUA CABANG (PUSAT)' : u.branch}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{u.department || '-'}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{u.phone || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          u.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {u.isActive ? 'AKTIF' : 'NONAKTIF'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {u.lastLoginAt ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{new Date(u.lastLoginAt).toLocaleString('id-ID')}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Belum pernah login</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit Profile Button */}
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition"
                          title="Edit Pengguna"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Reset Password Button */}
                        <button
                          onClick={() => handleResetPassword(u)}
                          className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition"
                          title="Kirim Tautan Reset Password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {/* Toggle Active Status */}
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

      {/* Modal User Form (Tambah / Edit) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-4 my-8">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingUser ? 'Ubah Data Akun Pengguna' : 'Tambah Akun Pengguna Baru'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {editingUser
                  ? 'Perbarui profil pengguna, role akses, cabang, atau status aktif.'
                  : 'Akun akan didaftarkan ke Firebase Authentication dengan email & kata sandi awal.'}
              </p>
            </div>

            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrUpdateUser} className="space-y-4 text-xs">
              {/* Email Field */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Pengguna *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    disabled={Boolean(editingUser)}
                    placeholder="staf@darmakaryalestari.co.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-sky-500 focus:bg-white disabled:opacity-60 disabled:bg-slate-100 transition"
                  />
                </div>
              </div>

              {/* Nama Lengkap */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: I Made Suardana"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-sky-500 focus:bg-white transition"
                />
              </div>

              {/* Password Fields (Only for New Users) */}
              {!editingUser && (
                <div className="space-y-3 p-4 bg-sky-50/50 rounded-2xl border border-sky-100">
                  <div className="flex items-center gap-1.5 text-sky-800 font-bold text-xs mb-1">
                    <Lock className="w-4 h-4 text-sky-600" />
                    <span>Kata Sandi Awal Akun (Firebase Authentication)</span>
                  </div>

                  {/* Password Field */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Password Awal * (Min. 8 Karakter)</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Minimal 8 karakter..."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-sky-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password Field */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Konfirmasi Password *</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        placeholder="Ketik ulang password..."
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-sky-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title={showConfirmPassword ? 'Sembunyikan password' : 'Lihat password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-tight">
                    * Password ini digunakan murni untuk pendaftaran akun di Firebase Authentication dan tidak disimpan dalam teks biasa.
                  </p>
                </div>
              )}

              {/* Role & Branch Scope */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Peran Akses (Role) *</label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sky-800 focus:outline-none focus:border-sky-500"
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
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sky-800 focus:outline-none focus:border-sky-500"
                  >
                    <option value="SINGARAJA">SINGARAJA</option>
                    <option value="TEJAKULA">TEJAKULA</option>
                    <option value="ALL">SEMUA CABANG (PUSAT)</option>
                  </select>
                </div>
              </div>

              {/* Department & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Departemen</label>
                  <input
                    type="text"
                    placeholder="Contoh: Operasional / Logistik"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nomor Telepon / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="Contoh: 081234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Account Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Status Akun</label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="accountStatus"
                      checked={accountStatus === true}
                      onChange={() => setAccountStatus(true)}
                      className="text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-emerald-700 font-bold">Aktif (Dapat Login)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="accountStatus"
                      checked={accountStatus === false}
                      onChange={() => setAccountStatus(false)}
                      className="text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-rose-700 font-bold">Nonaktif (Akses Ditolak)</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold rounded-xl shadow-md shadow-sky-600/20 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{editingUser ? 'Menyimpan...' : 'Mendaftarkan Akun...'}</span>
                    </>
                  ) : (
                    <span>{editingUser ? 'Simpan Perubahan' : 'Buat Akun Sekarang'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
