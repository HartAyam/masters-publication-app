import React, { useState } from 'react';
import { FileText, Download, Printer } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subYears, format, startOfWeek, endOfWeek } from 'date-fns';
import { Transaction, Expense, Payment, Product } from '@/types';

import { isGlobalUser } from '@/lib/utils';

export default function FinancialStatements() {
  const { userProfile } = useAuth();
  const [reportType, setReportType] = useState('Income Statement');
  const [period, setPeriod] = useState('This Month');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  const getDateRange = () => {
    if (period === 'Custom Interval') {
      return { start: new Date(startDate), end: new Date(endDate) };
    }
    const now = new Date();
    switch (period) {
      case 'This Week':
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'This Month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'Last Month':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'This Quarter':
        return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case 'This Year':
        return { start: startOfYear(now), end: endOfYear(now) };
      case 'Last Year':
        const lastYear = subYears(now, 1);
        return { start: startOfYear(lastYear), end: endOfYear(lastYear) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setReportData(null);
    try {
      const { start, end } = getDateRange();
      end.setHours(23, 59, 59, 999);
      const startTimestamp = Timestamp.fromDate(start);
      const endTimestamp = Timestamp.fromDate(end);

      // Fetch Transactions
      let txQuery = query(
        collection(db, 'transactions'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      if (userProfile && !isGlobalUser(userProfile.role)) {
        txQuery = query(txQuery, where('branchId', '==', userProfile.branchId));
      }
      const txSnap = await getDocs(txQuery);
      const transactions = txSnap.docs.map(doc => doc.data() as Transaction);

      // Fetch Expenses
      let expQuery = query(
        collection(db, 'expenses'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      if (userProfile && !isGlobalUser(userProfile.role)) {
        expQuery = query(expQuery, where('branchId', '==', userProfile.branchId));
      }
      const expSnap = await getDocs(expQuery);
      const expenses = expSnap.docs.map(doc => doc.data() as Expense);

      // Fetch Payments
      let payQuery = query(
        collection(db, 'payments'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      if (userProfile && !isGlobalUser(userProfile.role)) {
        payQuery = query(payQuery, where('branchId', '==', userProfile.branchId));
      }
      const paySnap = await getDocs(payQuery);
      const payments = paySnap.docs.map(doc => doc.data() as Payment);

      // Fetch Products for Inventory Value
      let prodQuery = query(collection(db, 'products'));
      if (userProfile && !isGlobalUser(userProfile.role)) {
        prodQuery = query(prodQuery, where('branchId', '==', userProfile.branchId));
      }
      const prodSnap = await getDocs(prodQuery);
      const products = prodSnap.docs.map(doc => doc.data() as Product);

      // Process Data
      let totalRevenue = 0;
      let totalCashSales = 0;
      let totalCreditSales = 0;
      
      transactions.forEach(tx => {
        if (tx.type === 'Cash Sale' || tx.type === 'Credit Sale') {
          totalRevenue += tx.totalAmount;
          if (tx.type === 'Cash Sale') totalCashSales += tx.totalAmount;
          if (tx.type === 'Credit Sale') totalCreditSales += tx.totalAmount;
        }
      });

      let totalExpenses = 0;
      const expensesByCategory: Record<string, number> = {};
      expenses.forEach(exp => {
        totalExpenses += exp.amount;
        expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + exp.amount;
      });

      let totalPaymentsReceived = 0;
      payments.forEach(pay => {
        totalPaymentsReceived += pay.amount;
      });

      let inventoryValue = 0;
      products.forEach(prod => {
        inventoryValue += (prod.price * prod.stockLevel); // Using selling price as proxy if cost price isn't available
      });

      const netIncome = totalRevenue - totalExpenses;

      setReportData({
        periodLabel: `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`,
        totalRevenue,
        totalCashSales,
        totalCreditSales,
        totalExpenses,
        expensesByCategory,
        totalPaymentsReceived,
        inventoryValue,
        netIncome,
        cashOnHand: totalCashSales + totalPaymentsReceived - totalExpenses,
        accountsReceivable: totalCreditSales - totalPaymentsReceived
      });

    } catch (error) {
      console.error("Error generating report:", error);
      alert("Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Financial Statements</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
          <h2 className="text-lg font-semibold mb-4">Generate Report</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
              <select
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option>Income Statement</option>
                <option>Balance Sheet</option>
                <option>Cash Flow Statement</option>
                <option>Trial Balance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
              <select
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option>Custom Interval</option>
                <option>This Week</option>
                <option>This Month</option>
                <option>Last Month</option>
                <option>This Quarter</option>
                <option>This Year</option>
                <option>Last Year</option>
              </select>
            </div>
            {period === 'Custom Interval' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Start Date</label>
                  <input 
                    type="date" 
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">End Date</label>
                  <input 
                    type="date" 
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating ? (
                'Generating...'
              ) : (
                <>
                  <FileText size={18} /> Generate Report
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preview Area */}
        <div className="md:col-span-2 bg-white p-8 rounded-xl shadow-sm border border-gray-100 min-h-[400px] flex flex-col max-h-[800px] overflow-y-auto custom-scrollbar">
          {!reportData ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="bg-gray-50 p-4 rounded-full mb-4">
                <FileText size={48} className="text-gray-300" />
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Report Preview</h3>
              <p className="text-gray-500 max-w-md">
                Select a report type and period from the panel on the left to generate a financial statement.
              </p>
            </div>
          ) : (
            <div className="flex-1" id="printable-report">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{reportType}</h2>
                  <p className="text-gray-500">{reportData.periodLabel}</p>
                </div>
                <button 
                  onClick={printReport}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors print:hidden"
                  title="Print Report"
                >
                  <Printer size={20} />
                </button>
              </div>

              {reportType === 'Income Statement' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-3">Revenue</h3>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Cash Sales</span>
                      <span className="font-medium">{formatCurrency(reportData.totalCashSales)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Credit Sales</span>
                      <span className="font-medium">{formatCurrency(reportData.totalCreditSales)}</span>
                    </div>
                    <div className="flex justify-between py-2 mt-2 border-t font-bold text-gray-900">
                      <span>Total Revenue</span>
                      <span>{formatCurrency(reportData.totalRevenue)}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-3">Operating Expenses</h3>
                    {Object.entries(reportData.expensesByCategory).map(([category, amount]) => (
                      <div key={category} className="flex justify-between py-1">
                        <span className="text-gray-600">{category}</span>
                        <span className="font-medium">{formatCurrency(amount as number)}</span>
                      </div>
                    ))}
                    {Object.keys(reportData.expensesByCategory).length === 0 && (
                      <div className="text-gray-500 italic py-1">No expenses recorded</div>
                    )}
                    <div className="flex justify-between py-2 mt-2 border-t font-bold text-gray-900">
                      <span>Total Expenses</span>
                      <span>{formatCurrency(reportData.totalExpenses)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between py-3 mt-4 border-t-2 border-gray-900 text-xl font-bold text-gray-900">
                    <span>Net Income</span>
                    <span className={reportData.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(reportData.netIncome)}
                    </span>
                  </div>
                </div>
              )}

              {reportType === 'Balance Sheet' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-3">Assets</h3>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Cash on Hand</span>
                      <span className="font-medium">{formatCurrency(reportData.cashOnHand)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Accounts Receivable</span>
                      <span className="font-medium">{formatCurrency(reportData.accountsReceivable)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Inventory Value (Est.)</span>
                      <span className="font-medium">{formatCurrency(reportData.inventoryValue)}</span>
                    </div>
                    <div className="flex justify-between py-2 mt-2 border-t font-bold text-gray-900">
                      <span>Total Assets</span>
                      <span>{formatCurrency(reportData.cashOnHand + reportData.accountsReceivable + reportData.inventoryValue)}</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 italic mt-8">
                    * Note: This is an estimated balance sheet based on available transaction data.
                  </div>
                </div>
              )}

              {reportType === 'Cash Flow Statement' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-3">Cash Inflows</h3>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Cash Sales</span>
                      <span className="font-medium">{formatCurrency(reportData.totalCashSales)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Payments Received (AR)</span>
                      <span className="font-medium">{formatCurrency(reportData.totalPaymentsReceived)}</span>
                    </div>
                    <div className="flex justify-between py-2 mt-2 border-t font-bold text-gray-900">
                      <span>Total Cash Inflows</span>
                      <span>{formatCurrency(reportData.totalCashSales + reportData.totalPaymentsReceived)}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-3">Cash Outflows</h3>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Operating Expenses</span>
                      <span className="font-medium">{formatCurrency(reportData.totalExpenses)}</span>
                    </div>
                    <div className="flex justify-between py-2 mt-2 border-t font-bold text-gray-900">
                      <span>Total Cash Outflows</span>
                      <span>{formatCurrency(reportData.totalExpenses)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between py-3 mt-4 border-t-2 border-gray-900 text-xl font-bold text-gray-900">
                    <span>Net Cash Flow</span>
                    <span className={reportData.cashOnHand >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(reportData.cashOnHand)}
                    </span>
                  </div>
                </div>
              )}

              {reportType === 'Trial Balance' && (
                <div className="space-y-6">
                  <table className="w-full text-left">
                    <thead className="border-b-2 border-gray-900">
                      <tr>
                        <th className="py-2 font-semibold">Account</th>
                        <th className="py-2 font-semibold text-right">Debit</th>
                        <th className="py-2 font-semibold text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="py-2">Cash</td>
                        <td className="py-2 text-right">{reportData.cashOnHand > 0 ? formatCurrency(reportData.cashOnHand) : '-'}</td>
                        <td className="py-2 text-right">{reportData.cashOnHand < 0 ? formatCurrency(Math.abs(reportData.cashOnHand)) : '-'}</td>
                      </tr>
                      <tr>
                        <td className="py-2">Accounts Receivable</td>
                        <td className="py-2 text-right">{reportData.accountsReceivable > 0 ? formatCurrency(reportData.accountsReceivable) : '-'}</td>
                        <td className="py-2 text-right">{reportData.accountsReceivable < 0 ? formatCurrency(Math.abs(reportData.accountsReceivable)) : '-'}</td>
                      </tr>
                      <tr>
                        <td className="py-2">Inventory</td>
                        <td className="py-2 text-right">{formatCurrency(reportData.inventoryValue)}</td>
                        <td className="py-2 text-right">-</td>
                      </tr>
                      <tr>
                        <td className="py-2">Sales Revenue</td>
                        <td className="py-2 text-right">-</td>
                        <td className="py-2 text-right">{formatCurrency(reportData.totalRevenue)}</td>
                      </tr>
                      <tr>
                        <td className="py-2">Expenses</td>
                        <td className="py-2 text-right">{formatCurrency(reportData.totalExpenses)}</td>
                        <td className="py-2 text-right">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
