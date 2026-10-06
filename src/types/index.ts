export type UserRole = 'ADMIN' | 'USER' | 'AUDITOR';
export type BranchScope = 'SINGARAJA' | 'TEJAKULA' | 'ALL';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  branch: BranchScope;
  department?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CompanySettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoUrl?: string;
  logoPublicId?: string;
  primaryColor?: string;
  secondaryColor?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type AssetCondition = 'BAIK' | 'RUSAK RINGAN' | 'RUSAK BERAT' | 'HILANG';

export type AssetStatus =
  | 'BARU'
  | 'AKTIF'
  | 'DIPINJAM'
  | 'DIKEMBALIKAN'
  | 'DIPINDAHKAN'
  | 'MAINTENANCE'
  | 'RUSAK'
  | 'DALAM PERBAIKAN'
  | 'SELESAI DIPERBAIKI'
  | 'HILANG'
  | 'DITEMUKAN KEMBALI'
  | 'TIDAK AKTIF'
  | 'DILELANG'
  | 'DISPOSAL';

export interface Asset {
  id: string;
  assetCode: string;
  barcode: string;
  qrCode?: string;
  name: string;
  category: string;
  subCategory?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  vendor?: string;
  invoiceNumber?: string;
  purchaseOrder?: string;
  branch: 'SINGARAJA' | 'TEJAKULA';
  location: string;
  department?: string;
  unit?: string;
  pic: string;
  condition: AssetCondition;
  status: AssetStatus;
  photoUrl?: string;
  photoPublicId?: string;
  additionalPhotos?: { url: string; publicId?: string; caption?: string }[];
  description?: string;
  notes?: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  isDeleted?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface InventoryItem {
  id: string;
  itemCode: string;
  barcode?: string;
  name: string;
  category: string;
  unit: string;
  minStock: number;
  currentStock: number;
  purchasePrice?: number;
  branch: 'SINGARAJA' | 'TEJAKULA' | 'ALL';
  location?: string;
  description?: string;
  photoUrl?: string;
  photoPublicId?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type InventoryTransactionType =
  | 'IN'
  | 'OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT'
  | 'DAMAGED'
  | 'LOST'
  | 'RETURN'
  | 'REPAIR';

export interface InventoryTransaction {
  id: string;
  transactionNumber: string;
  transactionType: InventoryTransactionType;
  date: string;
  itemId: string;
  itemName: string;
  category?: string;
  branch: string;
  location?: string;
  quantity: number;
  unit: string;
  purchasePrice?: number;
  totalPrice?: number;
  vendor?: string;
  invoiceNumber?: string;
  documentNumber?: string;
  receivedBy?: string;
  recipient?: string;
  technician?: string;
  purpose?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface StockAdjustment {
  id: string;
  itemId: string;
  itemName: string;
  branch: string;
  oldStock: number;
  newStock: number;
  difference: number;
  reason: string;
  performedBy: string;
  createdAt: string;
}

export type TransferStatus =
  | 'DRAFT'
  | 'DIAJUKAN'
  | 'DISETUJUI'
  | 'DITOLAK'
  | 'DALAM PENGIRIMAN'
  | 'DITERIMA'
  | 'DIBATALKAN';

export interface AssetTransfer {
  id: string;
  transferNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  fromBranch: string;
  toBranch: string;
  requestedBy: string;
  approvedBy?: string;
  shippedBy?: string;
  receivedBy?: string;
  requestDate: string;
  approvalDate?: string;
  shippingDate?: string;
  receivedDate?: string;
  status: TransferStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StockOpnameItem {
  assetId: string;
  assetCode: string;
  assetName: string;
  expectedBranch: string;
  expectedLocation: string;
  actualLocation?: string;
  status: 'DITEMUKAN' | 'TIDAK DITEMUKAN' | 'PERLU PEMERIKSAAN';
  condition: AssetCondition;
  scannedAt?: string;
  scannedBy?: string;
  notes?: string;
  photoUrl?: string;
}

export interface StockOpname {
  id: string;
  opnameNumber: string;
  title: string;
  branch: string;
  location?: string;
  date: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  totalAssets: number;
  foundCount: number;
  notFoundCount: number;
  needCheckCount: number;
  completionPercentage: number;
  notes?: string;
  items: StockOpnameItem[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Maintenance {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  maintenanceType: string;
  description: string;
  vendor?: string;
  technician?: string;
  cost?: number;
  startDate: string;
  endDate?: string;
  status: 'OPEN' | 'IN PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export type RepairStatus =
  | 'RUSAK'
  | 'DIAJUKAN PERBAIKAN'
  | 'DALAM PERBAIKAN'
  | 'SELESAI DIPERBAIKI'
  | 'TIDAK DAPAT DIPERBAIKI';

export interface Repair {
  id: string;
  repairNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  repairDate: string;
  problem: string;
  repairAction?: string;
  vendor?: string;
  technician?: string;
  cost?: number;
  startDate?: string;
  finishDate?: string;
  status: RepairStatus;
  beforePhoto?: string;
  beforePhotoPublicId?: string;
  afterPhoto?: string;
  afterPhotoPublicId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Disposal {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  reason: string;
  date: string;
  approvedBy: string;
  value?: number;
  method?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface AssetHistory {
  id: string;
  assetId: string;
  assetCode: string;
  action: string;
  details: string;
  performedBy: string;
  userEmail: string;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  action: string;
  module: string;
  documentId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  branch: string;
  timestamp: string;
  details: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  targetRole?: string;
  targetBranch?: string;
  createdAt: string;
}

export interface MasterItem {
  id: string;
  name: string;
  code?: string;
  branch?: string;
  description?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  [key: string]: any;
}
