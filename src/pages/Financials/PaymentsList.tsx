import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, getDocs } from 'firebase/firestore';
import { Payment, Branch, BranchModel, Customer } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useBranches';
import { Modal } from '@/components/common/Modal';
import { 
  Search, 
  Plus, 
  Filter, 
  Download, 
  Printer, 
  Calendar, 
  CreditCard, 
  User, 
  ArrowRight,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';
import { formatCurrency } from '@/lib/idUtils';
import { Pagination } from '@/components/common/Pagination';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { logActivity } from '@/services/audit';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn, isGlobalUser } from '@/lib/utils';

export default function PaymentsList() {
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const location = useLocation();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | 'ALL'>('ALL');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  
  // Add Payment Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [custSearchTerm, setCustSearchTerm] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'MoMo' | 'Bank'>('Cash');
  const [accountNumber, setAccountNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    if (!userProfile) return;

    let q = query(collection(db, 'payments'), orderBy('date', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
      
      // Apply branch filtering in memory
      if (!isGlobalUser(userProfile.role)) {
        data = data.filter(p => p.branchId === userProfile.branchId);
      } else if (selectedBranch !== 'ALL') {
        data = data.filter(p => p.branchId === selectedBranch);
      }
      
      setPayments(data);
      setLoading(false);
    });

    // Fetch customers for the modal
    const fetchCustomers = async () => {
      const custSnap = await getDocs(collection(db, 'customers'));
      const custs = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(custs);

      // Check for pre-selected customer from navigation state
      if (location.state?.customerId) {
        const preSelected = custs.find(c => c.id === location.state.customerId);
        if (preSelected) {
          setSelectedCustomer(preSelected);
          setShowAddModal(true);
        }
      }
    };
    fetchCustomers();

    return () => unsubscribe();
  }, [userProfile, selectedBranch]);

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.receivedBy.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesDate = true;
    if (payment.date && payment.date.toDate) {
      const paymentDate = payment.date.toDate();
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);
      
      matchesDate = paymentDate >= start && paymentDate <= end;
    }

    return matchesSearch && matchesDate;
  });

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !amount || processing || !userProfile) return;

    setProcessing(true);
    try {
      const paymentAmount = parseFloat(amount);
      const previousDebt = selectedCustomer.totalDebt;
      const newDebt = previousDebt - paymentAmount;

      const paymentData = {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        amount: paymentAmount,
        previousDebt,
        newDebt,
        receivedBy: userProfile.displayName || userProfile.email,
        receivedById: userProfile.uid,
        date: serverTimestamp(),
        paymentMethod,
        accountNumber: paymentMethod !== 'Cash' ? accountNumber : '',
        branchId: isGlobalUser(userProfile.role) ? selectedCustomer.primaryBranch : userProfile.branchId,
        notes
      };

      // 1. Create Payment Record
      const docRef = await addDoc(collection(db, 'payments'), paymentData);

      // 2. Update Customer Debt
      const customerRef = doc(db, 'customers', selectedCustomer.id);
      await updateDoc(customerRef, {
        totalDebt: increment(-paymentAmount)
      });

      // 3. Log Activity
      await logActivity(
        'Payment Received',
        `Payment of ${formatCurrency(paymentAmount)} received from ${selectedCustomer.name}. Method: ${paymentMethod}`,
        userProfile.uid,
        userProfile.role,
        userProfile.branchId
      );

      setShowAddModal(false);
      setAmount('');
      setAccountNumber('');
      setSelectedCustomer(null);
      setNotes('');
      navigate(`/payments/${docRef.id}`);
    } catch (error) {
      console.error("Error recording payment:", error);
      alert('Failed to record payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = () => {
    const dataToExport = filteredPayments.map(p => ({
      Date: p.date?.toDate ? format(p.date.toDate(), 'yyyy-MM-dd HH:mm') : 'Pending',
      Customer: p.customerName,
      Amount: p.amount,
      'Prev Debt': p.previousDebt,
      'New Debt': p.newDebt,
      Method: p.paymentMethod,
      'Received By': p.receivedBy,
      Branch: p.branchId
    }));
    exportToCSV(dataToExport, `Payments_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Payments</h1>
          <p className="text-gray-500 text-sm">Track and manage payments from credit customers</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => printDiv('payments-table', 'Customer Payments Report')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Record Payment
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            placeholder="Search by customer or receiver..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-gray-200">
          <Calendar size={18} className="text-gray-400 ml-2" />
          <select 
            className="text-sm border-none focus:ring-0 p-1 bg-transparent text-gray-600 font-medium cursor-pointer"
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
          <div className="flex items-center gap-2 px-2 border-l border-gray-100">
            <input 
              type="date" 
              className="text-sm border-none focus:ring-0 p-1"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
            <span className="text-gray-300">to</span>
            <input 
              type="date" 
              className="text-sm border-none focus:ring-0 p-1"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </div>
        </div>

        {isGlobalUser(userProfile?.role) && (
          <select 
            className="p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedBranch}
            onChange={(e: any) => setSelectedBranch(e.target.value)}
          >
            <option value="ALL">All Branches</option>
            {dbBranches.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" id="payments-table">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Amount Paid</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Previous Debt</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Balance After</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Method</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Branch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">Loading payments...</td>
                </tr>
              ) : paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">No payments found</td>
                </tr>
              ) : (
                paginatedPayments.map((payment) => (
                  <tr 
                    key={payment.id} 
                    onClick={() => navigate(`/payments/${payment.id}`)}
                    className="hover:bg-gray-50 transition-colors group cursor-pointer text-sm"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{payment.date?.toDate ? format(payment.date.toDate(), 'MMM dd, yyyy') : 'Pending...'}</div>
                      <div className="text-[10px] text-gray-400">{payment.date?.toDate ? format(payment.date.toDate(), 'HH:mm') : ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{payment.customerName}</div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="text-sm font-bold text-emerald-600">{formatCurrency(payment.amount)}</div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="text-sm text-gray-600">{formatCurrency(payment.previousDebt || 0)}</div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="text-sm font-medium text-red-600">{formatCurrency(payment.newDebt || 0)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        payment.paymentMethod === 'Cash' ? "bg-amber-100 text-amber-700" :
                        payment.paymentMethod === 'MoMo' ? "bg-purple-100 text-purple-700" :
                        "bg-blue-100 text-blue-700"
                      )}>
                        {payment.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="text-xs text-gray-500">{payment.branchId}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Add Payment Modal */}
      <Modal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        title="Record Customer Payment"
        className="max-w-lg"
      >
        <form onSubmit={handleAddPayment} className="space-y-4">
          {/* Customer Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Select Customer</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text"
                placeholder="Search customer..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={custSearchTerm}
                onChange={(e) => setCustSearchTerm(e.target.value)}
              />
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50 no-scrollbar">
              {customers
                .filter(c => c.name.toLowerCase().includes(custSearchTerm.toLowerCase()))
                .map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCustomer(c)}
                    className={cn(
                      "w-full p-3 text-left text-sm hover:bg-gray-50 transition-colors flex justify-between items-center",
                      selectedCustomer?.id === c.id ? "bg-blue-50 border-l-4 border-blue-500" : ""
                    )}
                  >
                    <div>
                      <p className="font-bold text-gray-900">{c.name}</p>
                      <p className="text-[10px] text-gray-500">{c.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Current Debt</p>
                      <p className="text-sm font-bold text-rose-600">{formatCurrency(c.totalDebt)}</p>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {selectedCustomer && (
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-blue-700">Current Debt:</span>
                <span className="text-lg font-bold text-blue-900">{formatCurrency(selectedCustomer.totalDebt)}</span>
              </div>
              
              <div className="space-y-1">
                <label className="block text-xs font-bold text-blue-600 uppercase">Amount to Pay</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">GHS</span>
                  <input 
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    max={selectedCustomer.totalDebt}
                    className="w-full pl-12 pr-4 py-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {amount && (
                <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                  <span className="text-sm text-blue-700">Remaining Balance:</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {formatCurrency(selectedCustomer.totalDebt - parseFloat(amount || '0'))}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Payment Method</label>
              <select 
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={paymentMethod}
                onChange={(e: any) => setPaymentMethod(e.target.value)}
              >
                <option value="Cash">Cash</option>
                <option value="MoMo">MoMo</option>
                <option value="Bank">Bank Transfer</option>
              </select>
            </div>
            {paymentMethod !== 'Cash' && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Account/Reference Number</label>
                <input 
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={paymentMethod === 'MoMo' ? "MoMo Number" : "Transaction ID / Acc No"}
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Date</label>
              <input 
                type="text"
                disabled
                className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                value={format(new Date(), 'MMM dd, yyyy')}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Received By</label>
            <input 
              type="text"
              disabled
              className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
              value={userProfile?.displayName || userProfile?.email || ''}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
            <textarea 
              className="w-full p-2 border border-gray-200 rounded-lg h-20 resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reference number, check details, etc."
            />
          </div>

          <button
            type="submit"
            disabled={!selectedCustomer || !amount || processing}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
          >
            {processing ? 'Processing...' : (
              <>
                <CheckCircle2 size={20} />
                Record Payment
              </>
            )}
          </button>
        </form>
      </Modal>
    </div>
  );
}
