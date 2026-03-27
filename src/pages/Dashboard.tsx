import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { ActivityLog, Transaction, Product, Customer, Expense, PayrollRecord, Branch, Payment, Supplier } from '@/types';
import { 
  Activity, DollarSign, Package, AlertTriangle, TrendingUp, 
  TrendingDown, Users, CreditCard, ShoppingCart, Calendar, Filter,
  ArrowUpRight, ArrowDownRight, Info, Clock, CheckSquare, Square, ChevronRight
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { BRANCHES, cn, isGlobalUser } from '@/lib/utils';
import Pagination from '@/components/common/Pagination';
import { formatCurrency } from '@/lib/idUtils';
import { useNavigate } from 'react-router-dom';

interface DashboardStats {
  totalRevenue: number;
  totalSales: number;
  cashSales: number;
  creditSales: number;
  depositSales: number;
  paymentsReceived: number;
  totalExpenditure: number;
  accountReceivables: number;
  accountPayables: number;
  totalStockValue: number;
  damagedStockValue: number;
  lowStockItems: Product[];
  topCustomers: { id?: string; name: string; total: number; count: number }[];
  topDebtors: Customer[];
  salesByDate: { date: string; amount: number }[];
  salesByBranch: { name: string; amount: number }[];
}

export default function Dashboard() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [activityCurrentPage, setActivityCurrentPage] = useState(1);
  const [paymentsCurrentPage, setPaymentsCurrentPage] = useState(1);
  const [expensesCurrentPage, setExpensesCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Filters
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [selectedBranch, setSelectedBranch] = useState<Branch | 'ALL'>(isGlobalUser(userProfile?.role) ? 'ALL' : (userProfile?.branchId || 'ALL'));

  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalSales: 0,
    cashSales: 0,
    creditSales: 0,
    depositSales: 0,
    paymentsReceived: 0,
    totalExpenditure: 0,
    accountReceivables: 0,
    accountPayables: 0,
    totalStockValue: 0,
    damagedStockValue: 0,
    lowStockItems: [],
    topCustomers: [],
    topDebtors: [],
    salesByDate: [],
    salesByBranch: []
  });

  const isPrivileged = isGlobalUser(userProfile?.role);

  useEffect(() => {
    if (!userProfile) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const start = startOfDay(parseISO(dateRange.start));
        const end = endOfDay(parseISO(dateRange.end));
        const branchFilter = selectedBranch === 'ALL' ? null : selectedBranch;

        // 1. Fetch Transactions (Sales)
        // Filter by date in Firestore, branch in JS to avoid composite index
        const transactionsQ = query(
          collection(db, 'transactions'),
          where('date', '>=', Timestamp.fromDate(start)),
          where('date', '<=', Timestamp.fromDate(end))
        );
        
        const transactionsSnapshot = await getDocs(transactionsQ);
        let transactions = transactionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));

        if (branchFilter) {
          transactions = transactions.filter(t => t.branchId === branchFilter);
        }

        // 2. Fetch Expenses
        // Filter by date in Firestore, branch in JS to avoid composite index
        const expensesQ = query(
          collection(db, 'expenses'),
          where('date', '>=', Timestamp.fromDate(start)),
          where('date', '<=', Timestamp.fromDate(end))
        );
        
        const expensesSnapshot = await getDocs(expensesQ);
        let expenses = expensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));

        if (branchFilter) {
          expenses = expenses.filter(e => e.branchId === branchFilter);
        }

        // 3. Fetch Payroll
        let payrollQ = query(collection(db, 'payroll'), where('status', '==', 'Paid'));
        // Note: Payroll filtering by date might be complex if it's just a month string, 
        // but let's assume we fetch all paid for now or filter by paymentDate if exists
        const payrollSnapshot = await getDocs(payrollQ);
        const payroll = payrollSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayrollRecord))
          .filter(p => {
            if (!p.paymentDate || !p.paymentDate.toDate) return false;
            const pDate = p.paymentDate.toDate();
            const inRange = pDate >= start && pDate <= end;
            const branchMatch = !branchFilter || p.branchId === branchFilter;
            return inRange && branchMatch;
          });

        // 4. Fetch Debtors (Customers with debt)
        let debtorsQ = query(collection(db, 'customers'), where('totalDebt', '>', 0));
        const debtorsSnapshot = await getDocs(debtorsQ);
        let debtors = debtorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        
        if (branchFilter) {
          debtors = debtors.filter(d => d.primaryBranch === branchFilter);
        }

        // 5. Fetch Creditors (Suppliers we owe)
        // Fetch Suppliers for Payables
        const suppliersSnapshot = await getDocs(collection(db, 'suppliers'));
        const suppliers = suppliersSnapshot.docs.map(doc => doc.data() as Supplier);
        const totalPayables = suppliers.reduce((acc, curr) => acc + (curr.totalPayable || 0), 0);

        // 6. Fetch Damaged Stock from stock_movements for accuracy (matching Inventory Report)
        let movementsQ = query(collection(db, 'stock_movements'));
        if (branchFilter) {
          movementsQ = query(movementsQ, where('branchId', '==', branchFilter));
        }
        const movementsSnapshot = await getDocs(movementsQ);
        const damagedMovements = movementsSnapshot.docs
          .map(doc => doc.data())
          .filter((m: any) => m.type === 'Damage Report');

        // 7. Fetch Inventory for Restock Meter and Value calculation
        let inventoryQ = query(collection(db, 'products'));
        if (branchFilter) {
          inventoryQ = query(inventoryQ, where('branchId', '==', branchFilter));
        }
        const inventorySnapshot = await getDocs(inventoryQ);
        const inventory = inventorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
        
        const totalDamagedValue = damagedMovements.reduce((acc, m: any) => {
          const product = inventory.find(p => p.id === m.productId);
          return acc + ((m.quantity || 0) * (product?.costPrice || product?.price || 0));
        }, 0);

        const lowStockItems = inventory.filter(p => p.stockLevel <= p.minStockLevel);
        const totalStockValue = inventory.reduce((acc, p) => acc + ((p.costPrice || p.price || 0) * (p.stockLevel || 0)), 0);

        // 8. Fetch Payments (Receivables collected)
        const paymentsQ = query(
          collection(db, 'payments'),
          where('date', '>=', Timestamp.fromDate(start)),
          where('date', '<=', Timestamp.fromDate(end))
        );
        const paymentsSnapshot = await getDocs(paymentsQ);
        let payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
        
        if (branchFilter) {
          payments = payments.filter(p => p.branchId === branchFilter);
        }
        
        const totalPaymentsReceived = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

        // Aggregations
        let totalSales = 0;
        let cashSales = 0;
        let creditSales = 0;
        let depositSales = 0;

        transactions.forEach(t => {
          const amount = t.totalAmount || 0;
          if (t.type === 'Cash Sale') {
            cashSales += amount;
            totalSales += amount;
          } else if (t.type === 'Credit Sale') {
            creditSales += amount;
            totalSales += amount;
          } else if (t.type === 'Deposit') {
            depositSales += amount;
            totalSales += amount;
          }
        });

        const totalExp = expenses.reduce((acc, e) => acc + (e.amount || 0), 0) + 
                         payroll.reduce((acc, p) => acc + (p.netSalary || 0), 0);
        const totalReceivables = debtors.reduce((acc, d) => acc + (d.totalDebt || 0), 0);
        // Total Revenue is now reflecting income actually received: Cash Sales + Deposits + Payments (Receivables collected)
        const totalRevenue = cashSales + depositSales + totalPaymentsReceived;

        // Top Customers
        const customerMap = new Map<string, { id?: string; name: string; total: number; count: number }>();
        transactions.forEach(t => {
          if (t.customerName) {
            const key = t.customerId || t.customerName;
            const existing = customerMap.get(key) || { id: t.customerId, name: t.customerName, total: 0, count: 0 };
            existing.total += t.totalAmount;
            existing.count += 1;
            customerMap.set(key, existing);
          }
        });
        const topCustomers = Array.from(customerMap.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 20);

        // Sales Over Time
        const salesByDateMap = new Map<string, { date: string; amount: number; timestamp: number }>();
        transactions.forEach(t => {
          if (!t.date || !t.date.toDate) return;
          const dateObj = t.date.toDate();
          const dateKey = format(dateObj, 'yyyy-MM-dd');
          const displayDate = format(dateObj, 'MMM dd');
          const existing = salesByDateMap.get(dateKey) || { date: displayDate, amount: 0, timestamp: dateObj.getTime() };
          existing.amount += t.totalAmount;
          salesByDateMap.set(dateKey, existing);
        });
        const salesByDate = Array.from(salesByDateMap.values())
          .sort((a, b) => a.timestamp - b.timestamp);

        // Sales By Branch
        const salesByBranchMap = new Map<string, number>();
        transactions.forEach(t => {
          salesByBranchMap.set(t.branchId, (salesByBranchMap.get(t.branchId) || 0) + t.totalAmount);
        });
        const salesByBranch = Array.from(salesByBranchMap.entries())
          .map(([name, amount]) => ({ name, amount }));

        setStats({
          totalRevenue,
          totalSales,
          cashSales,
          creditSales,
          depositSales,
          paymentsReceived: totalPaymentsReceived,
          totalExpenditure: totalExp,
          accountReceivables: totalReceivables,
          accountPayables: totalPayables,
          totalStockValue,
          damagedStockValue: totalDamagedValue,
          lowStockItems,
          topCustomers,
          topDebtors: debtors.sort((a, b) => b.totalDebt - a.totalDebt).slice(0, 10),
          salesByDate,
          salesByBranch
        });

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userProfile, dateRange, selectedBranch]);

  // Activity Stream
  useEffect(() => {
    if (userProfile?.role === 'Director' || userProfile?.role === 'Admin') {
      const q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100));
      const fetchActivities = async () => {
        try {
          const snap = await getDocs(q);
          let acts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
          if (selectedBranch !== 'ALL') {
            acts = acts.filter(a => a.branchId === selectedBranch);
          }
          setActivities(acts);
        } catch (error) {
          console.error("Error fetching activities:", error);
        }
      };
      fetchActivities();
    }
  }, [userProfile, selectedBranch]);

  // Fetch Recent Payments & Expenses
  useEffect(() => {
    if (!userProfile) return;
    const fetchRecentData = async () => {
      try {
        const oneWeekAgo = subDays(new Date(), 7);
        
        // Payments
        const pQ = query(
          collection(db, 'payments'),
          where('date', '>=', Timestamp.fromDate(oneWeekAgo)),
          orderBy('date', 'desc')
        );
        const pSnap = await getDocs(pQ);
        let paymentsData = pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
        
        // Expenses
        const eQ = query(
          collection(db, 'expenses'),
          where('date', '>=', Timestamp.fromDate(oneWeekAgo)),
          orderBy('date', 'desc')
        );
        const eSnap = await getDocs(eQ);
        let expensesData = eSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
        
        if (isGlobalUser(userProfile.role)) {
          paymentsData = paymentsData.filter(p => selectedBranch === 'ALL' || p.branchId === selectedBranch);
          expensesData = expensesData.filter(e => selectedBranch === 'ALL' || e.branchId === selectedBranch);
        } else {
          paymentsData = paymentsData.filter(p => p.branchId === userProfile.branchId);
          expensesData = expensesData.filter(e => e.branchId === userProfile.branchId);
        }
        
        setRecentPayments(paymentsData);
        setRecentExpenses(expensesData);
      } catch (error) {
        console.error("Error fetching recent data:", error);
      }
    };
    fetchRecentData();
  }, [userProfile, selectedBranch]);

  const totalActivityPages = Math.ceil(activities.length / itemsPerPage);
  const paginatedActivities = activities.slice(
    (activityCurrentPage - 1) * itemsPerPage,
    activityCurrentPage * itemsPerPage
  );

  const totalPaymentPages = Math.ceil(recentPayments.length / itemsPerPage);
  const paginatedPayments = recentPayments.slice(
    (paymentsCurrentPage - 1) * itemsPerPage,
    paymentsCurrentPage * itemsPerPage
  );

  const totalExpensePages = Math.ceil(recentExpenses.length / itemsPerPage);
  const paginatedExpenses = recentExpenses.slice(
    (expensesCurrentPage - 1) * itemsPerPage,
    expensesCurrentPage * itemsPerPage
  );

  const cardVariants = {
    hover: { scale: 1.02, transition: { duration: 0.2 } },
    tap: { scale: 0.98 }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {userProfile?.displayName}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 px-3 py-1.5 border-r border-gray-100">
            <Calendar size={16} className="text-gray-400" />
            <select 
              className="text-sm border-none focus:ring-0 p-0 bg-transparent text-gray-600 font-medium cursor-pointer"
              onChange={(e) => {
                const now = new Date();
                switch(e.target.value) {
                  case 'week':
                    setDateRange({ start: format(startOfWeek(now), 'yyyy-MM-dd'), end: format(endOfWeek(now), 'yyyy-MM-dd') });
                    break;
                  case 'month':
                    setDateRange({ start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') });
                    break;
                  case 'quarter':
                    setDateRange({ start: format(startOfQuarter(now), 'yyyy-MM-dd'), end: format(endOfQuarter(now), 'yyyy-MM-dd') });
                    break;
                  case 'year':
                    setDateRange({ start: format(startOfYear(now), 'yyyy-MM-dd'), end: format(endOfYear(now), 'yyyy-MM-dd') });
                    break;
                }
              }}
            >
              <option value="custom">Custom Interval</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border-r border-gray-100">
            <input 
              type="date" 
              className="text-sm border-none focus:ring-0 p-0"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
            <span className="text-gray-300">to</span>
            <input 
              type="date" 
              className="text-sm border-none focus:ring-0 p-0"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </div>
          
          {isPrivileged && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Filter size={16} className="text-gray-400" />
              <select 
                className="text-sm border-none focus:ring-0 p-0 bg-transparent"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value as Branch | 'ALL')}
              >
                <option value="ALL">All Branches</option>
                {BRANCHES.filter(b => b !== 'ALL').map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Stats Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Total Sales Card */}
        <motion.div
          variants={cardVariants}
          whileHover="hover"
          whileTap="tap"
          className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group cursor-default sm:row-span-2 flex flex-col"
        >
          <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-blue-50 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
          <div className="relative z-10 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <ShoppingCart className="text-blue-600" size={20} />
              </div>
            </div>
            <p className="text-sm text-gray-500 font-medium">Total Sales</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1 mb-6">{formatCurrency(stats.totalSales)}</h3>
            
            <div className="mt-auto space-y-4">
              <div className="flex justify-between items-center text-sm border-t border-gray-50 pt-3">
                <span className="text-gray-500 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400"></div>Cash</span>
                <span className="font-medium text-gray-900">{formatCurrency(stats.cashSales)}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-gray-50 pt-3">
                <span className="text-gray-500 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400"></div>Credit</span>
                <span className="font-medium text-gray-900">{formatCurrency(stats.creditSales)}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-gray-50 pt-3">
                <span className="text-gray-500 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-400"></div>Deposit</span>
                <span className="font-medium text-gray-900">{formatCurrency(stats.depositSales)}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {[
          { label: 'Total Revenue', value: stats.totalRevenue, icon: TrendingUp, color: 'emerald', trend: '+12.5%' },
          { label: 'Total Expenditure', value: stats.totalExpenditure, icon: TrendingDown, color: 'rose', trend: '+4.2%' },
          { label: 'Total Stock Value', value: stats.totalStockValue, icon: Package, color: 'blue', trend: '0.0%' },
          { label: 'Receivables (What is Owed Us)', value: stats.accountReceivables, icon: ArrowDownRight, color: 'indigo', trend: '-2.1%' },
          { label: 'Payables (What We Owe Others)', value: stats.accountPayables, icon: ArrowUpRight, color: 'orange', trend: '+1.5%' },
          { label: 'Damaged Stock Value', value: stats.damagedStockValue, icon: AlertTriangle, color: 'amber', trend: '0.0%' },
        ].map((item, idx) => (
          <motion.div
            key={idx}
            variants={cardVariants}
            whileHover="hover"
            whileTap="tap"
            className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group cursor-default"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-${item.color}-50 rounded-full opacity-50 group-hover:scale-110 transition-transform`} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 bg-${item.color}-100 rounded-xl`}>
                  <item.icon className={`text-${item.color}-600`} size={20} />
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full bg-${item.trend.startsWith('+') ? 'green' : 'red'}-50 text-${item.trend.startsWith('+') ? 'green' : 'red'}-600`}>
                  {item.trend}
                </span>
              </div>
              <p className="text-sm text-gray-500 font-medium">{item.label}</p>
              <h3 className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(item.value)}</h3>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Sales Over Time</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg">Daily</button>
              <button className="px-3 py-1 text-xs font-medium text-gray-400 hover:bg-gray-50 rounded-lg">Weekly</button>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.salesByDate}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: '#f3f4f6' }}
                />
                <Bar dataKey="amount" fill="url(#colorSales)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Restock Meter */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Restock Meter</h2>
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
              {stats.lowStockItems.length} Critical
            </span>
          </div>
          <div className="space-y-5 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
            {stats.lowStockItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="text-gray-200 mb-2" size={40} />
                <p className="text-sm text-gray-400">All stock levels healthy</p>
              </div>
            ) : (
              stats.lowStockItems.map((item) => (
                <div key={item.id} className="group">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700 truncate max-w-[150px]">{item.name}</span>
                    <span className="text-gray-500">{item.stockLevel} / {item.minStockLevel}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.stockLevel / item.minStockLevel) * 100}%` }}
                      className={cn(
                        "h-full rounded-full",
                        item.stockLevel <= item.minStockLevel / 2 ? "bg-red-500" : "bg-orange-500"
                      )}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          <button 
            onClick={() => navigate('/inventory')}
            className="w-full mt-6 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
          >
            View Full Inventory
          </button>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Customers */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Users size={20} className="text-blue-500" />
            Top 20 Customers
          </h2>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {stats.topCustomers.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No sales data found</p>
            ) : (
              stats.topCustomers.map((customer, i) => (
                <motion.div 
                  key={i} 
                  whileHover={{ x: 5 }}
                  onClick={() => customer.id && navigate(`/clients/${customer.id}`)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group",
                    customer.id ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{customer.name}</p>
                      <p className="text-xs text-gray-500">{customer.count} Transactions</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(customer.total)}</p>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* Top Debtors */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <CreditCard size={20} className="text-rose-500" />
            Top 10 Debtors
          </h2>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {stats.topDebtors.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No outstanding debts</p>
            ) : (
              stats.topDebtors.map((debtor, i) => (
                <motion.div 
                  key={debtor.id} 
                  whileHover={{ x: 5 }}
                  onClick={() => navigate(`/clients/${debtor.id}`)}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-xs">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{debtor.name}</p>
                      <p className="text-xs text-gray-500">{debtor.primaryBranch}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-rose-600">{formatCurrency(debtor.totalDebt)}</p>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* Branch Comparison (Privileged Only) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <ShoppingCart size={20} className="text-emerald-500" />
            Branch Sales
          </h2>
          {isPrivileged ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.salesByBranch}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="amount"
                  >
                    {stats.salesByBranch.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][index % 4]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Info className="text-gray-300 mb-2" size={32} />
              <p className="text-sm text-gray-400">Restricted to Admin/Accountant</p>
            </div>
          )}
          
          <div className="mt-6 space-y-3">
            {stats.salesByBranch.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{b.name}</span>
                <span className="font-bold text-gray-900">{formatCurrency(b.amount)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Payments */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <DollarSign size={20} className="text-emerald-500" />
            Recent Payments (Past 7 Days)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 font-medium text-gray-600">Date</th>
                  <th className="p-4 font-medium text-gray-600">Customer</th>
                  <th className="p-4 font-medium text-gray-600">Amount</th>
                  <th className="p-4 font-medium text-gray-600">Method</th>
                  <th className="p-4 font-medium text-gray-600">Received By</th>
                  {isPrivileged && <th className="p-4 font-medium text-gray-600">Branch</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedPayments.length === 0 ? (
                  <tr>
                    <td colSpan={isPrivileged ? 6 : 5} className="p-8 text-center text-gray-500">No recent payments found</td>
                  </tr>
                ) : (
                  paginatedPayments.map((payment) => (
                    <tr 
                      key={payment.id} 
                      onClick={() => navigate(`/payments/${payment.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="p-4 text-gray-500">
                        {payment.date?.toDate ? format(payment.date.toDate(), 'MMM dd, yyyy HH:mm') : 'N/A'}
                      </td>
                      <td className="p-4 font-medium text-gray-900">{payment.customerName}</td>
                      <td className="p-4 font-bold text-emerald-600">{formatCurrency(payment.amount)}</td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                          {payment.paymentMethod}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500">{payment.receivedBy}</td>
                      {isPrivileged && <td className="p-4 text-gray-500">{payment.branchId}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPaymentPages > 1 && (
            <div className="mt-4 flex justify-center">
              <Pagination 
                currentPage={paymentsCurrentPage}
                totalPages={totalPaymentPages}
                onPageChange={setPaymentsCurrentPage}
              />
            </div>
          )}
        </motion.div>

        {/* Recent Expenses */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.75 }}
          className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <TrendingDown size={20} className="text-rose-500" />
            Recent Expenses (Past 7 Days)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 font-medium text-gray-600">Date</th>
                  <th className="p-4 font-medium text-gray-600">Category</th>
                  <th className="p-4 font-medium text-gray-600">Description</th>
                  <th className="p-4 font-medium text-gray-600">Amount</th>
                  <th className="p-4 font-medium text-gray-600">Added By</th>
                  {isPrivileged && <th className="p-4 font-medium text-gray-600">Branch</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={isPrivileged ? 6 : 5} className="p-8 text-center text-gray-500">No recent expenses found</td>
                  </tr>
                ) : (
                  paginatedExpenses.map((expense) => (
                    <tr 
                      key={expense.id} 
                      onClick={() => navigate('/expenses')}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="p-4 text-gray-500">
                        {expense.date?.toDate ? format(expense.date.toDate(), 'MMM dd, yyyy HH:mm') : 'N/A'}
                      </td>
                      <td className="p-4 font-medium text-gray-900">{expense.category}</td>
                      <td className="p-4 text-gray-500">{expense.description}</td>
                      <td className="p-4 font-bold text-rose-600">{formatCurrency(expense.amount)}</td>
                      <td className="p-4 text-gray-500">{expense.recipient}</td>
                      {isPrivileged && <td className="p-4 text-gray-500">{expense.branchId}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalExpensePages > 1 && (
            <div className="mt-4 flex justify-center">
              <Pagination 
                currentPage={expensesCurrentPage}
                totalPages={totalExpensePages}
                onPageChange={setExpensesCurrentPage}
              />
            </div>
          )}
        </motion.div>

        {/* Recent Activity (Privileged Only) */}
        {(userProfile?.role === 'Director' || userProfile?.role === 'Admin') && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Clock size={20} className="text-purple-500" />
              Recent Activity
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="p-4 font-medium text-gray-600">Date</th>
                    <th className="p-4 font-medium text-gray-600">Action</th>
                    <th className="p-4 font-medium text-gray-600">Details</th>
                    <th className="p-4 font-medium text-gray-600">User Role</th>
                    <th className="p-4 font-medium text-gray-600">Branch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedActivities.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">No recent activity found</td>
                    </tr>
                  ) : (
                    paginatedActivities.map((activity) => (
                      <tr key={activity.id} className="hover:bg-gray-50">
                        <td className="p-4 text-gray-500 whitespace-nowrap">
                          {activity.timestamp?.toDate ? format(activity.timestamp.toDate(), 'MMM dd, HH:mm') : 'N/A'}
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-bold text-purple-600 uppercase tracking-wider bg-purple-50 px-2 py-1 rounded-md">
                            {activity.action}
                          </span>
                        </td>
                        <td className="p-4 text-gray-700">{activity.details}</td>
                        <td className="p-4 text-gray-500">
                          <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">
                            {activity.userRole}
                          </span>
                        </td>
                        <td className="p-4 text-gray-500">{activity.branchId}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalActivityPages > 1 && (
              <div className="mt-4 flex justify-center">
                <Pagination 
                  currentPage={activityCurrentPage}
                  totalPages={totalActivityPages}
                  onPageChange={setActivityCurrentPage}
                />
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
