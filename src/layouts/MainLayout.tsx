import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Box,
  QrCode,
  Scan,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  RefreshCw,
  Send,
  ClipboardCheck,
  Wrench,
  AlertTriangle,
  Search,
  Trash2,
  FileText,
  Database,
  Users,
  ShieldCheck,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Building2,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CompanyLogo } from '../components/common/CompanyLogo';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AppNotification } from '../types';
import { markNotificationAsRead } from '../services/notificationService';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, role, branch, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Listen to active notifications
  useEffect(() => {
    if (!user) return;
    try {
      const q = query(collection(db, 'notifications'), limit(15));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: AppNotification[] = [];
          snapshot.forEach((d) => {
            const data = d.data() as any;
            list.push({ id: d.id, ...data });
          });
          // sort descending by createdAt
          list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setNotifications(list);
          setUnreadCount(list.filter((n) => !n.read).length);
        },
        (error) => {
          console.warn('Notifications snapshot note:', error);
        }
      );
      return () => unsubscribe();
    } catch {
      // ignore
    }
  }, [user]);

  const navGroups = [
    {
      title: 'UTAMA',
      items: [
        { label: 'Dashboard', path: '/', icon: LayoutDashboard },
        { label: 'Pemindai (Scanner)', path: '/scanner', icon: Scan },
      ],
    },
    {
      title: 'MANAJEMEN ASET',
      items: [
        { label: 'Daftar Aset', path: '/assets', icon: Box },
        { label: 'Studio Barcode & QR', path: '/barcode', icon: QrCode },
        { label: 'Transfer Antar Cabang', path: '/transfers', icon: Send },
        { label: 'Stock Opname Aset', path: '/stock-opname', icon: ClipboardCheck },
      ],
    },
    {
      title: 'INVENTARIS & STOK',
      items: [
        { label: 'Stok Barang / Part', path: '/inventory', icon: Package },
        { label: 'Barang Masuk', path: '/inventory/inbound', icon: ArrowDownLeft },
        { label: 'Barang Keluar', path: '/inventory/outbound', icon: ArrowUpRight },
        { label: 'Penyesuaian Stok', path: '/inventory/adjustment', icon: SlidersHorizontal },
      ],
    },
    {
      title: 'PERAWATAN & INSIDEN',
      items: [
        { label: 'Maintenance Rutin', path: '/maintenance', icon: Wrench },
        { label: 'Perbaikan / Repair', path: '/repairs', icon: RefreshCw },
        { label: 'Barang Hilang / Temuan', path: '/lost-found', icon: Search },
        { label: 'Penghapusan (Disposal)', path: '/disposal', icon: Trash2 },
      ],
    },
    {
      title: 'LAPORAN & AUDIT',
      items: [
        { label: 'Pusat Laporan', path: '/reports', icon: FileText },
        { label: 'Log Audit Sistem', path: '/audit-logs', icon: ShieldCheck },
      ],
    },
    {
      title: 'MASTER DATA & SISTEM',
      items: [
        { label: 'Master Data', path: '/master-data', icon: Database },
        ...(role === 'ADMIN' ? [{ label: 'Manajemen Pengguna', path: '/users', icon: Users }] : []),
        { label: 'Pengaturan Perusahaan', path: '/settings', icon: Settings },
      ],
    },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      console.error(e);
    }
  };

  const getRoleBadgeColor = (r: string) => {
    switch (r) {
      case 'ADMIN':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'AUDITOR':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
              aria-label="Toggle Navigation"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <Link to="/" className="flex items-center gap-3">
              <CompanyLogo size="md" showText={true} />
            </Link>
          </div>

          {/* Center / Branch Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-100 text-sky-800 text-xs font-semibold">
            <Building2 className="w-4 h-4 text-sky-600" />
            <span>Cabang:</span>
            <span className="font-bold tracking-wider">{branch === 'ALL' ? 'SEMUA CABANG (PUSAT)' : branch}</span>
          </div>

          {/* Right actions: Notifications & User Menu */}
          <div className="flex items-center gap-3">
            {/* Quick Scanner Shortcut */}
            <Link
              to="/scanner"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition"
            >
              <Scan className="w-4 h-4" />
              <span>Scan QR/Barcode</span>
            </Link>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative p-2 rounded-xl text-slate-600 hover:text-sky-600 hover:bg-sky-50 transition"
                aria-label="Notifikasi"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover */}
              {notifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 py-3 z-50">
                  <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">Notifikasi & Peringatan</span>
                    <span className="text-xs bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-medium">
                      {unreadCount} Baru
                    </span>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">Tidak ada notifikasi saat ini.</div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-3 text-xs hover:bg-slate-50 transition flex items-start gap-3 ${
                            !notif.read ? 'bg-sky-50/50' : ''
                          }`}
                        >
                          <div className="p-1.5 rounded-lg bg-sky-100 text-sky-700 flex-shrink-0 mt-0.5">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{notif.title}</p>
                            <p className="text-slate-600 mt-0.5">{notif.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {notif.createdAt ? new Date(notif.createdAt).toLocaleString('id-ID') : ''}
                            </p>
                          </div>
                          {!notif.read && (
                            <button
                              onClick={() => markNotificationAsRead(notif.id)}
                              className="text-sky-600 hover:text-sky-800 p-1 flex-shrink-0"
                              title="Tandai sudah dibaca"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 transition"
              >
                {profile?.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName}
                    className="w-8 h-8 rounded-lg object-cover border border-sky-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-sky-600 text-white font-bold text-xs flex items-center justify-center">
                    {profile?.displayName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <div className="hidden sm:flex flex-col text-left leading-none">
                  <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">
                    {profile?.displayName || 'User'}
                  </span>
                  <span
                    className={`text-[10px] font-semibold mt-0.5 px-1.5 py-0.5 rounded border inline-block w-fit ${getRoleBadgeColor(
                      role
                    )}`}
                  >
                    {role}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-800">{profile?.displayName}</p>
                    <p className="text-[11px] text-slate-500 truncate">{profile?.email}</p>
                    <p className="text-[10px] text-sky-600 font-semibold mt-1">
                      {role} • Cabang {branch}
                    </p>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setProfileDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span>Pengaturan Akun</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar (Logout)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Mobile Backdrop */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 lg:hidden"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Mobile Header in Drawer */}
          <div className="lg:hidden p-4 border-b border-slate-100 flex items-center justify-between">
            <CompanyLogo size="sm" showText={true} />
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop Sidebar Branding Header */}
          <div className="hidden lg:flex px-5 py-4 border-b border-slate-100 items-center">
            <CompanyLogo size="md" showText={true} />
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            {navGroups.map((group, idx) => (
              <div key={idx}>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                          isActive
                            ? 'bg-sky-50 text-sky-700 border-l-4 border-sky-600 shadow-xs'
                            : 'text-slate-600 hover:text-sky-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <div className="text-[11px] text-slate-500 font-medium">
              <p className="font-bold text-slate-700">PT DARMA KARYA LESTARI</p>
              <p>v2.4 Enterprise Production</p>
            </div>
          </div>
        </aside>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};
