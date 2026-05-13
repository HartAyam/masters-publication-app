import React, { useState } from 'react';
import { FileText, Download, Printer, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subYears, format, startOfWeek, endOfWeek } from 'date-fns';
import { Transaction, Expense, Payment, Product, FixedAsset, Supplier, Branch, BranchModel } from '@/types';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { isGlobalUser } from '@/lib/utils';
import { useBranches } from '@/hooks/useBranches';

export default function FinancialStatements() {
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [reportType, setReportType] = useState('Income Statement');
  const [period, setPeriod] = useState('This Month');
  const [selectedBranch, setSelectedBranch] = useState<string | 'All'>(userProfile?.branchId || 'All');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

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
      const txQuery = query(
        collection(db, 'transactions'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      const txSnap = await getDocs(txQuery);
      let transactions = txSnap.docs.map(doc => doc.data() as Transaction);
      
      // Filter by branch in memory to avoid composite index requirement
      if (selectedBranch !== 'All') {
        transactions = transactions.filter(tx => tx.branchId === selectedBranch);
      } else if (userProfile && !isGlobalUser(userProfile.role)) {
        transactions = transactions.filter(tx => tx.branchId === userProfile.branchId);
      }

      // Fetch Expenses
      const expQuery = query(
        collection(db, 'expenses'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      const expSnap = await getDocs(expQuery);
      let expenses = expSnap.docs.map(doc => doc.data() as Expense);

      if (selectedBranch !== 'All') {
        expenses = expenses.filter(exp => exp.branchId === selectedBranch);
      } else if (userProfile && !isGlobalUser(userProfile.role)) {
        expenses = expenses.filter(exp => exp.branchId === userProfile.branchId);
      }

      // Fetch Payments
      const payQuery = query(
        collection(db, 'payments'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      const paySnap = await getDocs(payQuery);
      let payments = paySnap.docs.map(doc => doc.data() as Payment);

      if (selectedBranch !== 'All') {
        payments = payments.filter(pay => pay.branchId === selectedBranch);
      } else if (userProfile && !isGlobalUser(userProfile.role)) {
        payments = payments.filter(pay => pay.branchId === userProfile.branchId);
      }

      // Fetch Products for Inventory Value
      let prodQuery = query(collection(db, 'products'));
      if (selectedBranch !== 'All') {
        prodQuery = query(prodQuery, where('branchId', '==', selectedBranch));
      }
      const prodSnap = await getDocs(prodQuery);
      const products = prodSnap.docs.map(doc => doc.data() as Product);

      // Fetch Fixed Assets
      let assetQuery = query(collection(db, 'fixed_assets'));
      if (selectedBranch !== 'All') {
        assetQuery = query(assetQuery, where('branchId', '==', selectedBranch));
      }
      const assetSnap = await getDocs(assetQuery);
      const fixedAssets = assetSnap.docs.map(doc => doc.data() as FixedAsset);

      // Fetch Suppliers for Accounts Payable
      let supplierQuery = query(collection(db, 'suppliers'));
      if (selectedBranch !== 'All') {
        supplierQuery = query(supplierQuery, where('primaryBranch', '==', selectedBranch));
      }
      const supplierSnap = await getDocs(supplierQuery);
      const suppliers = supplierSnap.docs.map(doc => doc.data() as Supplier);

      // Process Data
      let totalRevenue = 0;
      let totalCashSales = 0;
      let totalCreditSales = 0;
      let totalDepositSales = 0;
      
      transactions.forEach(tx => {
        if (tx.status === 'Adjusted' || tx.isBackup) return;
        if (tx.type === 'Cash Sale' || tx.type === 'Credit Sale' || tx.type === 'Deposit') {
          totalRevenue += tx.totalAmount;
          if (tx.type === 'Cash Sale') totalCashSales += tx.totalAmount;
          if (tx.type === 'Credit Sale') totalCreditSales += tx.totalAmount;
          if (tx.type === 'Deposit') totalDepositSales += tx.totalAmount;
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

      let totalFixedAssets = 0;
      fixedAssets.forEach(asset => {
        totalFixedAssets += asset.currentValue;
      });

      let totalAccountsPayable = 0;
      suppliers.forEach(supplier => {
        totalAccountsPayable += (supplier.totalPayable || 0);
      });

      const netIncome = totalRevenue - totalExpenses;

      setReportData({
        periodLabel: `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`,
        endDateLabel: format(end, 'MMM dd, yyyy'),
        branchLabel: selectedBranch === 'All' ? 'All Branches' : (dbBranches.find(b => b.id === selectedBranch || b.name === selectedBranch)?.name || selectedBranch),
        totalRevenue,
        totalCashSales,
        totalCreditSales,
        totalExpenses,
        expensesByCategory,
        totalPaymentsReceived,
        inventoryValue,
        totalFixedAssets,
        totalAccountsPayable,
        netIncome,
        cashOnHand: totalCashSales + totalDepositSales + totalPaymentsReceived - totalExpenses,
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
    console.log('Printing report:', reportType);
    printDiv('printable-report', `${reportType} - ${reportData?.branchLabel}`);
  };

  const downloadCSV = () => {
    console.log('Downloading CSV:', reportType);
    if (!reportData) {
      console.error('No report data available for CSV download');
      return;
    }
    
    let csvData: any[] = [];
    if (reportType === 'Income Statement') {
      csvData = [
        { Category: 'Revenue', Item: 'Cash Sales', Amount: reportData.totalCashSales },
        { Category: 'Revenue', Item: 'Credit Sales', Amount: reportData.totalCreditSales },
        { Category: 'Revenue', Item: 'Total Revenue', Amount: reportData.totalRevenue },
        ...Object.entries(reportData.expensesByCategory).map(([cat, amt]) => ({
          Category: 'Expense', Item: cat, Amount: amt
        })),
        { Category: 'Expense', Item: 'Total Expenses', Amount: reportData.totalExpenses },
        { Category: 'Summary', Item: 'Net Income', Amount: reportData.netIncome }
      ];
    } else if (reportType === 'Balance Sheet') {
      csvData = [
        { Category: 'Assets', Item: 'Cash on Hand', Amount: reportData.cashOnHand },
        { Category: 'Assets', Item: 'Accounts Receivable', Amount: reportData.accountsReceivable },
        { Category: 'Assets', Item: 'Inventory Value', Amount: reportData.inventoryValue },
        { Category: 'Assets', Item: 'Fixed Assets', Amount: reportData.totalFixedAssets },
        { Category: 'Liabilities', Item: 'Accounts Payable', Amount: reportData.totalAccountsPayable }
      ];
    } else if (reportType === 'Cash Flow Statement') {
      csvData = [
        { Category: 'Inflow', Item: 'Cash Sales', Amount: reportData.totalCashSales },
        { Category: 'Inflow', Item: 'Payments Received (AR)', Amount: reportData.totalPaymentsReceived },
        { Category: 'Inflow', Item: 'Total Inflow', Amount: reportData.totalCashSales + reportData.totalPaymentsReceived },
        { Category: 'Outflow', Item: 'Operating Expenses', Amount: reportData.totalExpenses },
        { Category: 'Outflow', Item: 'Total Outflow', Amount: reportData.totalExpenses },
        { Category: 'Summary', Item: 'Net Cash Flow', Amount: reportData.cashOnHand }
      ];
    } else if (reportType === 'Trial Balance') {
      csvData = [
        { Account: 'Cash', Debit: reportData.cashOnHand > 0 ? reportData.cashOnHand : 0, Credit: reportData.cashOnHand < 0 ? Math.abs(reportData.cashOnHand) : 0 },
        { Account: 'Accounts Receivable', Debit: reportData.accountsReceivable > 0 ? reportData.accountsReceivable : 0, Credit: reportData.accountsReceivable < 0 ? Math.abs(reportData.accountsReceivable) : 0 },
        { Account: 'Inventory', Debit: reportData.inventoryValue, Credit: 0 },
        { Account: 'Sales Revenue', Debit: 0, Credit: reportData.totalRevenue },
        { Account: 'Expenses', Debit: reportData.totalExpenses, Credit: 0 }
      ];
    }

    exportToCSV(csvData, `${reportType}_${reportData.branchLabel}_${reportData.endDateLabel}`);
    setShowDownloadMenu(false);
  };

  const downloadPDF = () => {
    console.log('Downloading PDF (via print):', reportType);
    printDiv('printable-report', `${reportType} - ${reportData?.branchLabel}`);
    setShowDownloadMenu(false);
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={!isGlobalUser(userProfile?.role || '')}
              >
                <option value="All">All Branches</option>
                {dbBranches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
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
              <div className="text-center mb-8 border-b pb-6">
                <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter mb-1">Masters Publication</h1>
                <p className="text-lg font-bold text-blue-600 uppercase tracking-widest mb-1">{reportData.branchLabel}</p>
                <h2 className="text-xl font-semibold text-gray-800 mb-1">{reportType}</h2>
                <p className="text-gray-500 font-medium">as of {reportData.endDateLabel}</p>
              </div>

              <div className="flex justify-end gap-2 mb-6 print:hidden">
                <div className="relative">
                  <button 
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Download size={18} />
                    Download
                    <ChevronDown size={16} className={`transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showDownloadMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowDownloadMenu(false)}
                      />
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-20">
                        <button 
                          onClick={downloadCSV}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                        >
                          Download as CSV
                        </button>
                        <button 
                          onClick={downloadPDF}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                        >
                          Download as PDF
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button 
                  onClick={printReport}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Printer size={18} />
                  Print
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
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Fixed Assets</span>
                      <span className="font-medium">{formatCurrency(reportData.totalFixedAssets)}</span>
                    </div>
                    <div className="flex justify-between py-2 mt-2 border-t font-bold text-gray-900">
                      <span>Total Assets</span>
                      <span>{formatCurrency(reportData.cashOnHand + reportData.accountsReceivable + reportData.inventoryValue + reportData.totalFixedAssets)}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-3">Liabilities</h3>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Accounts Payable</span>
                      <span className="font-medium">{formatCurrency(reportData.totalAccountsPayable)}</span>
                    </div>
                    <div className="flex justify-between py-2 mt-2 border-t font-bold text-gray-900">
                      <span>Total Liabilities</span>
                      <span>{formatCurrency(reportData.totalAccountsPayable)}</span>
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[500px]">
                      <thead className="border-b-2 border-gray-900">
                        <tr>
                          <th className="py-2 font-semibold whitespace-nowrap">Account</th>
                          <th className="py-2 font-semibold text-right whitespace-nowrap">Debit</th>
                          <th className="py-2 font-semibold text-right whitespace-nowrap">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        <tr>
                          <td className="py-2 whitespace-nowrap">Cash</td>
                          <td className="py-2 text-right whitespace-nowrap">{reportData.cashOnHand > 0 ? formatCurrency(reportData.cashOnHand) : '-'}</td>
                          <td className="py-2 text-right whitespace-nowrap">{reportData.cashOnHand < 0 ? formatCurrency(Math.abs(reportData.cashOnHand)) : '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 whitespace-nowrap">Accounts Receivable</td>
                          <td className="py-2 text-right whitespace-nowrap">{reportData.accountsReceivable > 0 ? formatCurrency(reportData.accountsReceivable) : '-'}</td>
                          <td className="py-2 text-right whitespace-nowrap">{reportData.accountsReceivable < 0 ? formatCurrency(Math.abs(reportData.accountsReceivable)) : '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 whitespace-nowrap">Inventory</td>
                          <td className="py-2 text-right whitespace-nowrap">{formatCurrency(reportData.inventoryValue)}</td>
                          <td className="py-2 text-right whitespace-nowrap">-</td>
                        </tr>
                        <tr>
                          <td className="py-2 whitespace-nowrap">Sales Revenue</td>
                          <td className="py-2 text-right whitespace-nowrap">-</td>
                          <td className="py-2 text-right whitespace-nowrap">{formatCurrency(reportData.totalRevenue)}</td>
                        </tr>
                        <tr>
                          <td className="py-2 whitespace-nowrap">Expenses</td>
                          <td className="py-2 text-right whitespace-nowrap">{formatCurrency(reportData.totalExpenses)}</td>
                          <td className="py-2 text-right whitespace-nowrap">-</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
