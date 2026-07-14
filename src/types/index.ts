export type Role = 'Cashier' | 'Manager' | 'Accountant' | 'Director' | 'Admin' | 'Marketer' | 'Driver';

export type Branch = string;

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: Role;
  branchId: Branch;
  phone?: string;
  createdAt: any; // Firestore Timestamp
}

export interface Staff {
  id: string;
  staffId?: string;
  email: string;
  displayName: string;
  role: Role;
  branchId: Branch;
  phone: string;
  basicSalary: number;
  ssnNo?: string;
  ghanaCardNo?: string;
  hireDate: any; // Firestore Timestamp or ISO string
  createdAt: any; // Firestore Timestamp
  hasUserAccount?: boolean;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  costPrice: number;
  stockLevel: number;
  minStockLevel: number;
  damagedStock: number;
  branchId: Branch;
  category: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  suppliedQuantity?: number;
}

export type ClientType = 'Individual' | 'Organization';

export interface ContactPerson {
  name: string;
  phone: string;
  email?: string;
  role?: string;
}

export interface Customer {
  id: string;
  name: string;
  type: ClientType;
  phone: string;
  email?: string;
  address?: string;
  contactPerson?: ContactPerson;
  totalDebt: number;
  openingBalance?: number;
  primaryBranch: Branch;
  createdAt: any;
}

export type Transaction = Order;

export interface Order {
  id: string;
  type: 'Cash Sale' | 'Credit Sale' | 'Deposit' | 'Stock Return' | 'Supply Note';
  items: SaleItem[];
  totalAmount: number;
  discount?: number; // Percentage discount
  amountPaid: number;
  balanceDue: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  status: 'Completed' | 'Pending Delivery' | 'Pending Payment' | 'Returned' | 'Adjusted' | 'Partially Supplied' | 'Supplied' | 'Voided';
  date: any; // Firestore Timestamp
  cashierId: string;
  preparedBy: string;
  suppliedBy: string;
  branchId: Branch;
  paymentMethod: 'Cash' | 'MoMo' | 'Bank Transfer';
  accountNumber?: string;
  bankName?: string;
  paymentDueDate?: any;
  isAdjusted?: boolean;
  adjustmentDate?: any;
  originalTransactionId?: string;
  isBackup?: boolean;
  voidReason?: string;
  voidDate?: any;
  voidedBy?: string;
  previousBalance?: number;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  previousDebt: number;
  newDebt: number;
  receivedBy: string;
  receivedById: string;
  date: any;
  createdAt: any; // Adding for consistency
  paymentMethod: 'Bank' | 'MoMo' | 'Cash';
  accountNumber?: string;
  branchId: Branch;
  notes?: string;
  orderId?: string; // Adding to link to orders
  reference?: string; // Adding for payment reference
}

export interface Supplier {
  id: string;
  name: string;
  type: ClientType;
  phone: string;
  email?: string;
  address?: string;
  contactPerson?: ContactPerson;
  totalPayable: number;
  primaryBranch: Branch;
  createdAt: any;
}

export interface Expense {
  id: string;
  date: any;
  amount: number;
  category: string;
  recipient: string;
  supplierId?: string;
  issuerId: string;
  approverName: string;
  branchId: Branch;
  description?: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  displayName?: string;
  userEmail?: string;
  userRole: Role;
  branchId: Branch;
  timestamp: any;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  staffId?: string;
  employeeName: string;
  ssnNo?: string;
  ghanaCardNo?: string;
  month: string;
  basicSalary: number;
  ssnit: number;
  paye: number;
  otherDeductions: number;
  bonuses: number;
  netSalary: number;
  status: 'Pending Approval' | 'Approved' | 'Paid' | 'Draft';
  paymentDate?: any;
  branchId: string;
  payslipId?: string;
}

export interface FinancialReport {
  id: string;
  type: 'Income Statement' | 'Balance Sheet' | 'Cash Flow';
  periodStart: any;
  periodEnd: any;
  generatedAt: any;
  generatedBy: string;
  data: any;
}

export interface FixedAsset {
  id: string;
  name: string;
  category: string;
  purchaseDate: any;
  purchasePrice: number;
  currentValue: number;
  depreciationRate: number; // Annual percentage
  branchId: Branch;
  description?: string;
  createdAt: any;
}

export interface BranchModel {
  id: string;
  branchId?: string;
  name: string;
  location: string;
  managerId?: string;
  managerName?: string;
  contactPhone?: string;
  momoNumber?: string;
  employeeCount?: number;
  isActive: boolean;
}
