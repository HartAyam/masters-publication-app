import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { Transaction, Branch } from '../../types';
import { BRANCHES, isGlobalUser } from '../../lib/utils';
import { Search, Plus, ChevronRight, CheckSquare, Square, Calendar, Download, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/idUtils';
import Pagination from '@/components/common/Pagination';

const STATUSES = ['Completed', 'Pending Delivery', 'Pending Payment', 'Returned', 'Adjusted'];
const TYPES = ['Cash Sale', 'Credit Sale', 'Deposit', 'Stock Return'];

export default function OrdersList() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<Branch | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [showBackups, setShowBackups] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    if (!userProfile) return;
    fetchOrders();
  }, [userProfile]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      let q;

      if (!isGlobalUser(userProfile?.role || '')) {
        q = query(collection(db, 'transactions'), where('branchId', '==', userProfile?.branchId));
      } else {
        q = query(collection(db, 'transactions'));
      }

      const querySnapshot = await getDocs(q);
      const ordersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      })) as Transaction[];

      // Client-side sorting to avoid composite index requirement
      ordersData.sort((a, b) => {
        const getTime = (date: any) => {
          if (!date) return 0;
          if (date.toDate) return date.toDate().getTime();
          return new Date(date).getTime() || 0;
        };
        return getTime(b.date) - getTime(a.date);
      });

      setOrders(ordersData);
    } catch (error) {
      console.error("Error fetching orders: ", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const dataToExport = filteredOrders.map(o => {
      const date = o.date?.toDate ? o.date.toDate() : (o.date ? new Date(o.date) : null);
      const dateStr = date && !isNaN(date.getTime()) ? format(date, 'yyyy-MM-dd HH:mm') : 'N/A';
      
      return {
        ID: o.id,
        Date: dateStr,
        Customer: o.customerName || 'Walk-in',
        Type: o.type,
        Total: o.totalAmount,
        Paid: o.amountPaid,
        Balance: o.balanceDue,
        Status: o.status,
        Branch: o.branchId
      };
    });
    exportToCSV(dataToExport, `Orders_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      (order.customerName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      order.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBranch = selectedBranch === 'ALL' || order.branchId === selectedBranch;
    const matchesStatus = selectedStatus === 'ALL' || order.status === selectedStatus;
    const matchesType = selectedType === 'ALL' || order.type === selectedType;
    const matchesBackup = showBackups ? order.isBackup : !order.isBackup;

    return matchesSearch && matchesBranch && matchesStatus && matchesType && matchesBackup;
  });

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id));
    }
  };

  const toggleSelectOrder = (id: string) => {
    if (selectedOrders.includes(id)) {
      setSelectedOrders(selectedOrders.filter(oId => oId !== id));
    } else {
      setSelectedOrders([...selectedOrders, id]);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    // Handle Firestore Timestamp
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders & Invoices</h1>
          <p className="text-gray-500">Manage and view all transactions</p>
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
            onClick={() => printDiv('orders-table', 'Orders & Invoices Report')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
          <button 
            onClick={() => navigate('/pos')}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>New Order</span>
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search orders..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {isGlobalUser(userProfile?.role || '') && (
            <div className="w-full md:w-48">
              <select
                className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value as Branch | 'ALL')}
              >
                <option value="ALL">All Branches</option>
                {BRANCHES.map(branch => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            </div>
          )}

          <div className="w-full md:w-48">
            <select
              className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              {STATUSES.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-48">
            <select
              className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="ALL">All Types</option>
              {TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 px-2">
            <button 
              onClick={() => setShowBackups(!showBackups)}
              className={`p-2 rounded-lg border transition-colors ${showBackups ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-white border-gray-200 text-gray-400'}`}
              title="Show Adjusted Backups"
            >
              <Calendar size={20} />
            </button>
            <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Show Backups</span>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" id="orders-table">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 w-10">
                  <button 
                    onClick={toggleSelectAll}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {selectedOrders.length === filteredOrders.length && filteredOrders.length > 0 ? (
                      <CheckSquare size={20} className="text-blue-600" />
                    ) : (
                      <Square size={20} />
                    )}
                  </button>
                </th>
                <th className="p-4 text-sm font-semibold text-gray-600">Date</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Customer</th>
                <th className="p-4 text-sm font-semibold text-gray-600 min-w-[150px]">Items</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Total</th>
                <th className="p-4 text-sm font-semibold text-gray-600 min-w-[120px]">Type</th>
                <th className="p-4 text-sm font-semibold text-gray-600 min-w-[150px]">Status</th>
                {isGlobalUser(userProfile?.role || '') && (
                  <th className="p-4 text-sm font-semibold text-gray-600">Branch</th>
                )}
                <th className="p-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">Loading orders...</td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">No orders found</td>
                </tr>
              ) : (
                paginatedOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedOrders.includes(order.id) ? 'bg-blue-50/50' : ''}`}
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <td className="p-4" onClick={(e) => { e.stopPropagation(); toggleSelectOrder(order.id); }}>
                      {selectedOrders.includes(order.id) ? (
                        <CheckSquare size={20} className="text-blue-600" />
                      ) : (
                        <Square size={20} className="text-gray-400" />
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{formatDate(order.date)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-600">{order.customerName || 'Walk-in Customer'}</td>
                    <td className="p-4 text-sm text-gray-600">{order.items.length} items</td>
                    <td className="p-4 text-sm font-medium text-gray-900">{formatCurrency(order.totalAmount)}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${order.type === 'Cash Sale' ? 'bg-green-100 text-green-800' : 
                          order.type === 'Credit Sale' ? 'bg-blue-100 text-blue-800' :
                          order.type === 'Stock Return' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'}`}>
                        {order.type}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${order.status === 'Completed' ? 'bg-green-100 text-green-800' : 
                          order.status === 'Pending Payment' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'Returned' ? 'bg-red-100 text-red-800' :
                          order.status === 'Adjusted' ? 'bg-amber-100 text-amber-800' :
                          'bg-gray-100 text-gray-800'}`}>
                        {order.status}
                      </span>
                    </td>
                    {isGlobalUser(userProfile?.role || '') && (
                      <td className="p-4 text-sm text-gray-500">{order.branchId}</td>
                    )}
                    <td className="p-4 text-gray-400">
                      <ChevronRight size={20} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex justify-center">
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
