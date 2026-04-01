import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, where, orderBy, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { Payment, Branch, Order } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useBranches';
import { Search, Filter, Calendar, ChevronRight, CreditCard, ArrowLeft, Database, Landmark, Banknote, Smartphone, HelpCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import Pagination from '@/components/common/Pagination';

interface PaymentSummary {
  method: string;
  total: number;
  count: number;
}

export default function PaymentsBySource() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | 'All'>(userProfile?.branchId || 'All');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchPayments();
  }, [selectedBranch, startDate, endDate, userProfile]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      // 1. Fetch from 'payments' collection
      const paymentsQ = query(collection(db, 'payments'), orderBy('date', 'desc'));
      const paymentsSnapshot = await getDocs(paymentsQ);
      const paymentsList = paymentsSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        orderId: (doc.data() as any).orderId || doc.id // Fallback to doc.id if orderId not present
      } as Payment));

      // 2. Fetch from 'transactions' collection (where amountPaid > 0)
      const transactionsQ = query(collection(db, 'transactions'), orderBy('date', 'desc'));
      const transactionsSnapshot = await getDocs(transactionsQ);
      const transactionPayments = transactionsSnapshot.docs
        .map(doc => {
          const data = doc.data() as Order;
          if (data.amountPaid > 0) {
            return {
              id: `trans_${doc.id}`,
              customerId: data.customerId || '',
              customerName: data.customerName || 'N/A',
              amount: data.amountPaid,
              previousDebt: 0, // Not applicable for POS sales
              newDebt: data.balanceDue,
              receivedBy: data.preparedBy,
              receivedById: data.cashierId,
              date: data.date,
              paymentMethod: data.paymentMethod as any,
              accountNumber: data.accountNumber,
              branchId: data.branchId,
              orderId: doc.id,
              reference: `Order: ${doc.id}`
            } as Payment;
          }
          return null;
        })
        .filter((p): p is Payment => p !== null);

      // Combine both sources
      const allPayments = [...paymentsList, ...transactionPayments];

      // Filter by branch and date interval client-side
      const filtered = allPayments.filter(payment => {
        const matchesBranch = selectedBranch === 'All' || payment.branchId === selectedBranch;
        const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date();
        const matchesDate = isWithinInterval(paymentDate, {
          start: new Date(startDate),
          end: new Date(endDate + 'T23:59:59')
        });
        return matchesBranch && matchesDate;
      });

      // Sort by date descending
      filtered.sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate().getTime() : 0;
        const dateB = b.date?.toDate ? b.date.toDate().getTime() : 0;
        return dateB - dateA;
      });

      setPayments(filtered);
    } catch (error) {
      console.error("Error fetching payments:", error);
    } finally {
      setLoading(false);
    }
  };

  const summaries: PaymentSummary[] = useMemo(() => {
    const grouped = payments.reduce((acc, p) => {
      const method = p.paymentMethod || 'Unknown';
      if (!acc[method]) acc[method] = { method, total: 0, count: 0 };
      acc[method].total += p.amount;
      acc[method].count += 1;
      return acc;
    }, {} as Record<string, PaymentSummary>);
    return Object.values(grouped);
  }, [payments]);

  const totalPayments = useMemo(() => 
    summaries.reduce((sum, s) => sum + s.total, 0), 
  [summaries]);

  const detailedPayments = useMemo(() => 
    payments.filter(p => (p.paymentMethod || 'Unknown') === selectedMethod),
  [payments, selectedMethod]);

  const totalPages = Math.ceil(detailedPayments.length / itemsPerPage);
  const paginatedDetailedPayments = useMemo(() => 
    detailedPayments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
  [detailedPayments, currentPage]);

  const detailedTotal = useMemo(() => 
    detailedPayments.reduce((sum, p) => sum + p.amount, 0),
  [detailedPayments]);

  const { branches: dbBranches } = useBranches();

  if (selectedMethod) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setSelectedMethod(null);
                setCurrentPage(1);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {selectedMethod} Payments
              </h1>
              <p className="text-sm text-gray-500">
                Detailed breakdown of payments received via {selectedMethod}
              </p>
            </div>
          </div>
          <div className="bg-blue-50 px-6 py-3 rounded-xl border border-blue-100">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Total {selectedMethod}</p>
            <p className="text-2xl font-bold text-blue-700">GH₵ {detailedTotal.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">Date</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">Payer (Customer)</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 text-right whitespace-nowrap">Amount</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">Received By</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedDetailedPayments.map((p) => (
                  <tr 
                    key={p.id} 
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      if (p.id.startsWith('trans_')) {
                        navigate(`/orders/${p.orderId}`);
                      } else if (p.orderId && p.orderId !== p.id) {
                        navigate(`/orders/${p.orderId}`);
                      } else {
                        navigate(`/payments/${p.id}`);
                      }
                    }}
                  >
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {format(p.date.toDate(), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                      {p.customerName || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900 whitespace-nowrap">
                      GH₵ {p.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{p.receivedBy}</td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {p.reference || p.accountNumber || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-gray-900">Total</td>
                  <td className="px-6 py-4 text-right text-blue-600">GH₵ {detailedTotal.toLocaleString()}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center">
            <Pagination 
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Payments By Source</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Branch</label>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value as Branch | 'All')}
            >
              <option value="All">All Branches</option>
              {dbBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Start Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="date"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">End Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="date"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">Payment Source</th>
                <th className="px-6 py-4 font-semibold text-gray-900 text-center whitespace-nowrap">Transactions</th>
                <th className="px-6 py-4 font-semibold text-gray-900 text-right whitespace-nowrap">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaries.map((summary) => (
                <tr 
                  key={summary.method}
                  className="hover:bg-gray-50 transition-colors cursor-pointer group"
                  onClick={() => setSelectedMethod(summary.method)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                        {summary.method === 'Bank' && <Landmark className="text-blue-600" size={20} />}
                        {summary.method === 'Cash' && <Banknote className="text-emerald-600" size={20} />}
                        {summary.method === 'MoMo' && <Smartphone className="text-purple-600" size={20} />}
                        {summary.method === 'Unknown' && <HelpCircle className="text-gray-400" size={20} />}
                        {!['Bank', 'Cash', 'MoMo', 'Unknown'].includes(summary.method) && <CreditCard className="text-blue-600" size={20} />}
                      </div>
                      <span className="font-bold text-gray-900">{summary.method}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600 font-medium whitespace-nowrap">
                    {summary.count}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-blue-600 whitespace-nowrap">
                    GH₵ {summary.total.toLocaleString()}
                  </td>
                </tr>
              ))}
              {summaries.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-500 italic">
                    No payments found for the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
            {summaries.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-100 font-bold">
                <tr>
                  <td className="px-6 py-4 text-gray-900 whitespace-nowrap">Grand Total</td>
                  <td className="px-6 py-4 text-center text-gray-900 whitespace-nowrap">
                    {summaries.reduce((sum, s) => sum + s.count, 0)}
                  </td>
                  <td className="px-6 py-4 text-right text-blue-700 text-lg whitespace-nowrap">
                    GH₵ {totalPayments.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
