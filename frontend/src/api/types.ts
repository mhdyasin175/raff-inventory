export type MovementType = 'In' | 'Out' | 'Adjustment' | 'TransferOut' | 'TransferIn';
export type StockStatus = 'Ok' | 'Low' | 'Out';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CurrentUser {
  id: number;
  fullName: string;
  username: string;
  role: string;
  permissions: string[];
  warehouseId?: number | null;
  warehouseName?: string | null;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: CurrentUser;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  productCount: number;
  stockValue: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  categoryId: number;
  categoryName: string;
  unit: string;
  location: string | null;
  costPrice: number;
  salePrice: number;
  quantity: number;
  reorderLevel: number;
  isActive: boolean;
  stockValue: number;
  status: StockStatus;
  lastMovementAt: string | null;
}

export interface ProductInput {
  sku: string;
  name: string;
  categoryId: number;
  unit: string;
  location: string | null;
  costPrice: number;
  salePrice: number;
  reorderLevel: number;
  isActive: boolean;
  openingQuantity: number;
  openingWarehouseId?: number | null;
}

export interface ProductStock {
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  products: number;
  units: number;
  stockValue: number;
  users: number;
}

export interface Movement {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  unit: string;
  type: MovementType;
  quantityChange: number;
  balanceAfter: number;
  unitPrice: number;
  total: number;
  party: string | null;
  reference: string | null;
  note: string | null;
  occurredAt: string;
  createdBy: string;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  counterpartWarehouseId: number | null;
  counterpartWarehouseCode: string | null;
  transferId: string | null;
}

export interface MovementInput {
  productId: number;
  type: MovementType;
  quantity: number;
  unitPrice: number | null;
  party: string | null;
  reference: string | null;
  note: string | null;
  occurredAt: string | null;
  warehouseId: number;
  toWarehouseId?: number | null;
}

export interface DashboardSummary {
  activeProducts: number;
  totalUnits: number;
  stockValueCost: number;
  stockValueSale: number;
  lowStockCount: number;
  outOfStockCount: number;
  movementsToday: number;
  salesLast30: number;
  salesPrev30: number;
  unitsOutLast30: number;
  unitsInLast30: number;
}

export interface TrendPoint {
  date: string;
  unitsIn: number;
  unitsOut: number;
  valueIn: number;
  valueOut: number;
}

export interface LowStockItem {
  productId: number;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  location: string | null;
}

export interface CategoryValuePoint {
  categoryId: number;
  category: string;
  stockValue: number;
  units: number;
  products: number;
}

export interface TopProductPoint {
  productId: number;
  sku: string;
  name: string;
  unit: string;
  unitsOut: number;
  revenue: number;
}

export interface RangeSummary {
  movements: number;
  unitsIn: number;
  unitsOut: number;
  purchasesValue: number;
  revenue: number;
  grossProfit: number;
}

export interface UserRow {
  id: number;
  fullName: string;
  username: string;
  roleId: number;
  roleName: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  warehouseId?: number | null;
  warehouseName?: string | null;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface PermissionInfo {
  key: string;
  group: string;
  label: string;
}
