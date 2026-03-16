export type Role = 'Cashier' | 'Manager' | 'Accountant' | 'Director' | 'Admin';

export type Branch = 'Gyinyase' | 'Kasoa' | 'Madina' | 'Santasi';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: Role;
  branchId: Branch;
  phone?: string;
  basicSalary?: number;
  hireDate?: any; // Firestore Timestamp or ISO string
  createdAt: any; // Firestore Timestamp
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stockLevel: number;
  minStockLevel: number;
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
  primaryBranch: Branch;
  createdAt: any;
}

export interface Transaction {
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
  status: 'Completed' | 'Pending Delivery' | 'Pending Payment' | 'Returned' | 'Adjusted' | 'Partially Supplied' | 'Supplied';
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
  paymentMethod: 'Bank' | 'MoMo' | 'Cash';
  accountNumber?: string;
  branchId: Branch;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  type: ClientType;
  phone: string;
  email?: string;
  address?: string;
  contactPerson?: ContactPerson;
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
  userName?: string;
  userRole: Role;
  branchId: Branch;
  timestamp: any;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
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

export interface BranchModel {
  id: string;
  name: string;
  location: string;
  managerId?: string;
  managerName?: string;
  contactPhone?: string;
  momoNumber?: string;
  employeeCount?: number;
  isActive: boolean;
}
