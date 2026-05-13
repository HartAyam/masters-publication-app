import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, onSnapshot, QuerySnapshot, DocumentData, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Expense } from '@/types';
import { logActivity } from '@/services/audit';
import { Download, Printer, Search, Plus, Filter, Calendar, CreditCard, User, ArrowRight, X, Trash2, Edit, Save, AlertTriangle } from 'lucide-react';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { format, startOfWeek, startOfMonth, startOfQuarter, startOfYear, isAfter } from 'date-fns';
import { formatCurrency } from '@/lib/idUtils';
import Pagination from '@/components/common/Pagination';
import { Branch, BranchModel } from '@/types';
import { isGlobalUser } from '@/lib/utils';
import { useBranches } from '@/hooks/useBranches';

export default function Expenses() {
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Operations');
  const [recipient, setRecipient] = useState('');
  const [description, setDescription] = useState('');
  const [approverName, setApproverName] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isEditingExpense, setIsEditingExpense] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Edit Form State
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editRecipient, setEditRecipient] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editApproverName, setEditApproverName] = useState('');
  
  const canEdit = ['Admin', 'Director', 'Accountant', 'Manager', 'Cashier'].includes(userProfile?.role || '');
  
  useEffect(() => {
    if (dbBranches.length > 0 && !branchId) {
      setBranchId(dbBranches[0].id);
    }
  }, [dbBranches, branchId]);
  
  // Ledger State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'>('ALL');
  const [selectedBranch, setSelectedBranch] = useState<string | 'ALL'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    if (!userProfile) return;

    let q;
    if (isGlobalUser(userProfile.role)) {
      q = query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(50));
    } else {
      q = query(
        collection(db, 'expenses'), 
        where('branchId', '==', userProfile.branchId),
        orderBy('date', 'desc'),
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      // snapshot is QuerySnapshot here because q is a Query
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(data);
    }, (error: any) => {
      console.error("Error fetching expenses:", error);
      if (error.code === 'failed-precondition' && error.message.includes('index')) {
        console.warn("Missing Firestore Index for Expenses. Please create it using the link in the console.");
      }
    });

    return () => unsubscribe();
  }, [userProfile]);

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.description?.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesDate = true;
    const now = new Date();
    if (dateFilter === 'WEEK') {
      matchesDate = expense.date?.seconds && isAfter(new Date(expense.date.seconds * 1000), startOfWeek(now));
    } else if (dateFilter === 'MONTH') {
      matchesDate = expense.date?.seconds && isAfter(new Date(expense.date.seconds * 1000), startOfMonth(now));
    } else if (dateFilter === 'QUARTER') {
      matchesDate = expense.date?.seconds && isAfter(new Date(expense.date.seconds * 1000), startOfQuarter(now));
    } else if (dateFilter === 'YEAR') {
      matchesDate = expense.date?.seconds && isAfter(new Date(expense.date.seconds * 1000), startOfYear(now));
    }

    const matchesBranch = selectedBranch === 'ALL' || expense.branchId === selectedBranch;

    return matchesSearch && matchesDate && matchesBranch;
  });

  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setLoading(true);

    try {
      await addDoc(collection(db, 'expenses'), {
        date: serverTimestamp(),
        amount: parseFloat(amount),
        category,
        recipient,
        description,
        issuerId: userProfile.uid,
        approverName,
        branchId: isGlobalUser(userProfile.role) ? branchId : userProfile.branchId,
      });

      // Log activity
      await logActivity(
        'Expense Voucher Created',
        `${formatCurrency(parseFloat(amount))} for ${category} by ${userProfile.email}`,
        userProfile.uid,
        userProfile.role,
        isGlobalUser(userProfile.role) ? branchId : userProfile.branchId,
        userProfile.displayName,
        userProfile.email
      );

      setShowAddModal(false);
      setAmount('');
      setRecipient('');
      setDescription('');
      setApproverName('');
      alert('Voucher Created Successfully');
    } catch (error) {
      console.error("Error creating voucher:", error);
      alert('Failed to create voucher');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const dataToExport = filteredExpenses.map(e => ({
      Date: e.date?.toDate ? format(e.date.toDate(), 'yyyy-MM-dd HH:mm') : 'N/A',
      Amount: e.amount,
      Category: e.category,
      Recipient: e.recipient,
      Description: e.description || '',
      Branch: e.branchId
    }));
    exportToCSV(dataToExport, `Expenses_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const handleEditInit = () => {
    if (!selectedExpense) return;
    setEditAmount(selectedExpense.amount.toString());
    setEditCategory(selectedExpense.category);
    setEditRecipient(selectedExpense.recipient);
    setEditDescription(selectedExpense.description || '');
    setEditApproverName(selectedExpense.approverName);
    setIsEditingExpense(true);
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    setLoading(true);

    try {
      await updateDoc(doc(db, 'expenses', selectedExpense.id!), {
        amount: parseFloat(editAmount),
        category: editCategory,
        recipient: editRecipient,
        description: editDescription,
        approverName: editApproverName,
      });

      setSelectedExpense((prev) => prev ? {
        ...prev,
        amount: parseFloat(editAmount),
        category: editCategory,
        recipient: editRecipient,
        description: editDescription,
        approverName: editApproverName,
      } : null);

      setIsEditingExpense(false);
      alert('Voucher Updated Successfully');
    } catch (error) {
      console.error("Error updating voucher:", error);
      alert('Failed to update voucher');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!selectedExpense?.id) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'expenses', selectedExpense.id));
      setShowDeleteConfirm(false);
      setShowDetailsModal(false);
      setSelectedExpense(null);
      alert('Voucher Deleted Successfully');
    } catch (error) {
      console.error("Error deleting voucher:", error);
      alert('Failed to delete voucher');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Ledger</h1>
          <p className="text-gray-500">Track and manage business expenses</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => printDiv('expenses-table', 'Expenses Report')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            New Voucher
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            placeholder="Search recipient, category..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-gray-400" />
          <select 
            className="p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={dateFilter}
            onChange={(e: any) => setDateFilter(e.target.value)}
          >
            <option value="ALL">All Time</option>
            <option value="WEEK">This Week</option>
            <option value="MONTH">This Month</option>
            <option value="QUARTER">This Quarter</option>
            <option value="YEAR">This Year</option>
          </select>
        </div>

        {isGlobalUser(userProfile?.role) && (
          <select 
            className="p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedBranch}
            onChange={(e: any) => setSelectedBranch(e.target.value)}
          >
            <option value="ALL">All Branches</option>
            {dbBranches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>
      
      {/* Create Voucher Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <h2 className="font-bold text-blue-900 flex items-center gap-2">
                <Plus size={20} />
                Create New Voucher
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option>Operations</option>
                    <option>Utilities</option>
                    <option>Salary</option>
                    <option>Maintenance</option>
                    <option>Restock</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              {isGlobalUser(userProfile?.role) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    required
                  >
                    {dbBranches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient / Payee</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Approver Name</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  placeholder="Manager or Director Name"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200"
                >
                  {loading ? 'Creating Voucher...' : 'Create Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" id="expenses-table">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-medium text-gray-600">Date</th>
                <th className="p-4 font-medium text-gray-600">Recipient</th>
                <th className="p-4 font-medium text-gray-600">Category</th>
                <th className="p-4 font-medium text-gray-600">Description</th>
                <th className="p-4 font-medium text-gray-600">Branch</th>
                <th className="p-4 font-medium text-gray-600">Amount</th>
                <th className="p-4 font-medium text-gray-600">Approver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">No expenses found</td>
                </tr>
              ) : (
                paginatedExpenses.map((expense) => (
                  <tr 
                    key={expense.id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedExpense(expense);
                      setShowDetailsModal(true);
                      setIsEditingExpense(false);
                      setShowDeleteConfirm(false);
                    }}
                  >
                    <td className="p-4 text-gray-500">
                      {expense.date?.seconds ? new Date(expense.date.seconds * 1000).toLocaleDateString() : 'Just now'}
                    </td>
                    <td className="p-4 font-medium text-gray-900">{expense.recipient}</td>
                    <td className="p-4 text-gray-500">
                      <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">{expense.category}</span>
                    </td>
                    <td className="p-4 text-gray-500 truncate max-w-xs">{expense.description}</td>
                    <td className="p-4 text-gray-500">
                      {dbBranches.find(b => b.id === expense.branchId || b.name === expense.branchId)?.name || expense.branchId}
                    </td>
                    <td className="p-4 font-bold text-gray-900">{formatCurrency(expense.amount)}</td>
                    <td className="p-4 text-gray-500">{expense.approverName}</td>
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
	  
	  {/* Expense Details Modal */}
      {showDetailsModal && selectedExpense && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <h2 className="font-bold text-blue-900 flex items-center gap-2">
                <CreditCard size={20} />
                {isEditingExpense ? 'Edit Expense Voucher' : 'Expense Voucher Details'}
              </h2>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {isEditingExpense ? (
              <form onSubmit={handleUpdateExpense} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (GHS)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                    >
                      <option>Operations</option>
                      <option>Utilities</option>
                      <option>Salary</option>
                      <option>Maintenance</option>
                      <option>Restock</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipient / Payee</label>
                  <input
                    type="text"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={editRecipient}
                    onChange={(e) => setEditRecipient(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    rows={2}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Approver Name</label>
                  <input
                    type="text"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={editApproverName}
                    onChange={(e) => setEditApproverName(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsEditingExpense(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <Save size={18} />
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : showDeleteConfirm ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 mb-4">
                  <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Delete Expense Voucher?</h3>
                <p className="text-gray-500">
                  Are you sure you want to delete this expense voucher for <strong>{selectedExpense.recipient}</strong>? This action cannot be undone.
                </p>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteExpense}
                    disabled={loading}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} />
                    {loading ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            ) : (
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Recipient</p>
                  <h3 className="text-xl font-bold text-gray-900">{selectedExpense.recipient}</h3>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Amount</p>
                  <h3 className="text-2xl font-black text-blue-600">{formatCurrency(selectedExpense.amount)}</h3>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Category</p>
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                    {selectedExpense.category}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Date</p>
                  <p className="font-medium text-gray-900">
                    {selectedExpense.date?.seconds ? format(new Date(selectedExpense.date.seconds * 1000), 'PPP p') : 'Just now'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">Description</p>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-gray-700 italic">
                  {selectedExpense.description || 'No description provided'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-sm text-gray-500 mb-1 flex items-center gap-1">
                    <User size={14} />
                    Approver
                  </p>
                  <p className="font-bold text-gray-900">{selectedExpense.approverName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Branch</p>
                  <p className="font-bold text-gray-900">
                    {dbBranches.find(b => b.id === selectedExpense.branchId || b.name === selectedExpense.branchId)?.name || selectedExpense.branchId}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                {canEdit && (
                  <>
                    <button
                      onClick={handleEditInit}
                      className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Edit size={18} /> Edit
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex-1 py-3 bg-white border border-gray-200 text-red-600 rounded-xl font-bold hover:bg-red-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 size={18} /> Delete
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      )}
	  
    </div>
  );
}
