import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Product, Transaction, UserProfile } from '@/types';
import { ArrowLeft, Download, Printer, Calendar, Search, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { useAuth } from '@/context/AuthContext';
import { cn, BRANCHES, isGlobalUser } from '@/lib/utils';
import { formatCurrency } from '@/lib/idUtils';

export default function InventoryReport() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>(isGlobalUser(userProfile?.role || '') ? 'ALL' : userProfile?.branchId || 'Gyinyase');

  useEffect(() => {
    if (userProfile) {
      generateReport();
    }
  }, [userProfile, selectedBranch]);

  const generateReport = async () => {
    setLoading(true);
    try {
      // 1. Fetch Products
      let prodQ = query(collection(db, 'products'));
      if (selectedBranch !== 'ALL') {
        prodQ = query(collection(db, 'products'), where('branchId', '==', selectedBranch));
      }
      const prodSnap = await getDocs(prodQ);
      const products = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

      // 2. Fetch Stock Movements
      let moveQ = query(collection(db, 'stock_movements'));
      if (selectedBranch !== 'ALL') {
        moveQ = query(collection(db, 'stock_movements'), where('branchId', '==', selectedBranch));
      }
      const moveSnap = await getDocs(moveQ);
      const movements = moveSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      // 3. Fetch Transactions
      let transQ = query(collection(db, 'transactions'));
      if (selectedBranch !== 'ALL') {
        transQ = query(collection(db, 'transactions'), where('branchId', '==', selectedBranch));
      }
      const transSnap = await getDocs(transQ);
      const transactions = transSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));

      const start = new Date(0); // Beginning of time
      const end = new Date(); // Now
      end.setHours(23, 59, 59, 999);

      const data = products.map(product => {
        const movementsInPeriod = movements.filter(m => 
          m.productId === product.id && 
          m.timestamp?.toDate() >= start && 
          m.timestamp?.toDate() <= end
        );

        const transactionsInPeriod = transactions.filter(t => 
          t.date?.toDate() >= start && 
          t.date?.toDate() <= end &&
          t.items.some(i => i.productId === product.id)
        );

        const received = movementsInPeriod
          .filter(m => m.type === 'Stock Received')
          .reduce((sum, m) => sum + m.quantity, 0);

        const damaged = movementsInPeriod
          .filter(m => m.type === 'Damage Report')
          .reduce((sum, m) => sum + m.quantity, 0);

        const sold = transactionsInPeriod
          .filter(t => t.type === 'Cash Sale' || t.type === 'Credit Sale' || t.type === 'Supply Note')
          .reduce((sum, t) => {
            const item = t.items.find(i => i.productId === product.id);
            return sum + (item?.quantity || 0);
          }, 0);

        const deposits = transactions
          .filter(t => t.type === 'Deposit' && t.status !== 'Supplied')
          .reduce((sum, t) => {
            const item = t.items.find(i => i.productId === product.id);
            if (!item) return sum;
            const remaining = item.quantity - (item.suppliedQuantity || 0);
            return sum + remaining;
          }, 0);

        const allMovementsAfterStart = movements.filter(m => 
          m.productId === product.id && 
          m.timestamp?.toDate() >= start
        );
        
        const allTransactionsAfterStart = transactions.filter(t => 
          t.items.some(i => i.productId === product.id) &&
          t.date?.toDate() >= start
        );

        const netReceivedAfterStart = allMovementsAfterStart
          .filter(m => m.type === 'Stock Received')
          .reduce((sum, m) => sum + m.quantity, 0);
          
        const netDamagedAfterStart = allMovementsAfterStart
          .filter(m => m.type === 'Damage Report')
          .reduce((sum, m) => sum + m.quantity, 0);

        const netSoldAfterStart = allTransactionsAfterStart
          .filter(t => t.type === 'Cash Sale' || t.type === 'Credit Sale' || t.type === 'Supply Note')
          .reduce((sum, t) => {
             const item = t.items.find(i => i.productId === product.id);
             return sum + (item?.quantity || 0);
          }, 0);
          
        const netReturnedAfterStart = allTransactionsAfterStart
          .filter(t => t.type === 'Stock Return')
          .reduce((sum, t) => {
             const item = t.items.find(i => i.productId === product.id);
             return sum + (item?.quantity || 0);
          }, 0);

        const openingStock = product.stockLevel - netReceivedAfterStart + netSoldAfterStart + netDamagedAfterStart - netReturnedAfterStart;
        const closingStock = openingStock + received - sold - damaged;

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          openingStock,
          received,
          sold,
          damaged,
          closingStock,
          deposits
        };
      });

      setReportData(data);
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const data = reportData.map(r => ({
      'Item Name': r.name,
      'SKU': r.sku,
      'Opening Stock': r.openingStock,
      'Received': r.received,
      'Sold': r.sold,
      'Damaged': r.damaged,
      'Closing Stock': r.closingStock,
      'Deposits (Unsupplied)': r.deposits
    }));
    exportToCSV(data, `Inventory_Report_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => printDiv('report-table', 'Inventory Report')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          {isGlobalUser(userProfile?.role || '') && (
            <div className="flex-1 space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">Branch</label>
              <select
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="ALL">All Branches</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div className="flex-[2] space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase">Search Item</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search by name or SKU..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div id="report-table" className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <div className="mb-6 text-center hidden print:block">
            <h1 className="text-2xl font-bold">Inventory Report</h1>
            <p className="text-gray-500">Generated On: {format(new Date(), 'MMM dd, yyyy HH:mm')}</p>
            <p className="text-gray-500">Branch: {selectedBranch}</p>
          </div>
          
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-medium text-gray-600">Item Name</th>
                <th className="p-4 font-medium text-gray-600 text-center">Opening Stock</th>
                <th className="p-4 font-medium text-gray-600 text-center">Received</th>
                <th className="p-4 font-medium text-gray-600 text-center">Sold</th>
                <th className="p-4 font-medium text-gray-600 text-center">Damaged</th>
                <th className="p-4 font-medium text-gray-600 text-center">Closing Balance</th>
                <th className="p-4 font-medium text-gray-600 text-center">Deposits (Unsupplied)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">Generating report...</td>
                </tr>
              ) : reportData.filter(r => 
                  r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  r.sku.toLowerCase().includes(searchTerm.toLowerCase())
                ).map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="p-4">
                    <p className="font-medium text-gray-900">{row.name}</p>
                    <p className="text-xs text-gray-500">{row.sku}</p>
                  </td>
                  <td className="p-4 text-center font-mono">{row.openingStock}</td>
                  <td className="p-4 text-center text-green-600 font-mono">+{row.received}</td>
                  <td className="p-4 text-center text-blue-600 font-mono">-{row.sold}</td>
                  <td className="p-4 text-center text-red-600 font-mono">-{row.damaged}</td>
                  <td className="p-4 text-center font-bold font-mono">{row.closingStock}</td>
                  <td className="p-4 text-center text-amber-600 font-mono">{row.deposits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
