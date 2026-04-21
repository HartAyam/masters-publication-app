import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { PayrollRecord, Branch, BranchModel } from '@/types';
import { isGlobalUser } from '@/lib/utils';
import { useBranches } from '@/hooks/useBranches';
import { useAuth } from '@/context/AuthContext';
import { Plus, DollarSign, FileText, X, Search, CheckCircle, Printer, Download, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { logActivity } from '@/services/audit';
import { formatCurrency } from '@/lib/idUtils';
import Pagination from '@/components/common/Pagination';
import { printDiv, exportToCSV } from '@/lib/exportUtils';

export default function PayrollList() {
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecord | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedBranch, setSelectedBranch] = useState<string | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Form State
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [ssnNo, setSsnNo] = useState('');
  const [ghanaCardNo, setGhanaCardNo] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [ssnit, setSsnit] = useState('0');
  const [paye, setPaye] = useState('0');
  const [otherDeductions, setOtherDeductions] = useState('0');
  const [bonuses, setBonuses] = useState('0');
  const [branchId, setBranchId] = useState<string>('');

  useEffect(() => {
    if (dbBranches.length > 0 && !branchId) {
      setBranchId(dbBranches[0].name);
    }
  }, [dbBranches]);
  
  // Staff Search
  const [staff, setStaff] = useState<any[]>([]);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [showStaffResults, setShowStaffResults] = useState(false);

  useEffect(() => {
    fetchPayrolls();
    fetchStaff();
  }, [selectedMonth, selectedBranch, selectedStatus, userProfile]);

  const fetchStaff = async () => {
    try {
      const q = query(collection(db, 'staff'));
      const snapshot = await getDocs(q);
      setStaff(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching staff:", error);
    }
  };

  const fetchPayrolls = async () => {
    if (!userProfile) return;
    setLoading(true);
    try {
      let q = query(collection(db, 'payroll'), orderBy('month', 'desc'));

      const snapshot = await getDocs(q);
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayrollRecord));
      
      // Filter in memory
      if (selectedMonth) {
        data = data.filter(p => p.month === selectedMonth);
      }
      
      if (!isGlobalUser(userProfile.role)) {
        data = data.filter(p => 
          p.branchId === userProfile.branchId || 
          dbBranches.find(b => b.name === p.branchId)?.id === userProfile.branchId
        );
      } else if (selectedBranch !== 'ALL') {
        data = data.filter(p => !p.branchId || p.branchId === selectedBranch || dbBranches.find(b => b.id === p.branchId || b.branchId === p.branchId)?.name === selectedBranch);
      }

      if (selectedStatus !== 'ALL') {
        data = data.filter(p => p.status === selectedStatus);
      }

      setPayrolls(data);
    } catch (error) {
      console.error("Error fetching payrolls:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(payrolls.length / itemsPerPage);
  const paginatedPayrolls = payrolls.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleAddPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const basic = parseFloat(basicSalary) || 0;
      const ssnitVal = parseFloat(ssnit) || 0;
      const payeVal = parseFloat(paye) || 0;
      const otherDeduct = parseFloat(otherDeductions) || 0;
      const bonusVal = parseFloat(bonuses) || 0;
      
      const net = basic + bonusVal - ssnitVal - payeVal - otherDeduct;

      await addDoc(collection(db, 'payroll'), {
        employeeName,
        employeeId,
        staffId,
        ssnNo,
        ghanaCardNo,
        month: selectedMonth,
        basicSalary: basic,
        ssnit: ssnitVal,
        paye: payeVal,
        otherDeductions: otherDeduct,
        bonuses: bonusVal,
        netSalary: net,
        status: 'Pending Approval',
        branchId: isGlobalUser(userProfile?.role || '') ? branchId : userProfile?.branchId,
        createdAt: serverTimestamp(),
      });

      if (userProfile) {
        await logActivity(
          'Add Payroll',
          `Added payroll for ${employeeName} (${selectedMonth}). Net: ${formatCurrency(net)}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }

      setShowModal(false);
      setEmployeeName('');
      setEmployeeId('');
      setStaffId('');
      setSsnNo('');
      setGhanaCardNo('');
      setBasicSalary('');
      setSsnit('0');
      setPaye('0');
      setOtherDeductions('0');
      setBonuses('0');
      fetchPayrolls();
    } catch (error) {
      console.error("Error adding payroll:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: 'Pending Approval' | 'Approved' | 'Paid') => {
    try {
      await updateDoc(doc(db, 'payroll', id), {
        status: newStatus,
        paymentDate: newStatus === 'Paid' ? serverTimestamp() : null
      });
      
      if (userProfile) {
        await logActivity(
          'Update Payroll Status',
          `Updated payroll status to ${newStatus} for record ${id}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }

      fetchPayrolls();
      if (selectedPayroll && selectedPayroll.id === id) {
        setSelectedPayroll({ ...selectedPayroll, status: newStatus });
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleUpdatePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayroll) return;
    setLoading(true);
    try {
      const basic = parseFloat(basicSalary) || 0;
      const ssnitVal = parseFloat(ssnit) || 0;
      const payeVal = parseFloat(paye) || 0;
      const otherDeduct = parseFloat(otherDeductions) || 0;
      const bonusVal = parseFloat(bonuses) || 0;
      
      const net = basic + bonusVal - ssnitVal - payeVal - otherDeduct;

      await updateDoc(doc(db, 'payroll', selectedPayroll.id), {
        basicSalary: basic,
        ssnit: ssnitVal,
        paye: payeVal,
        otherDeductions: otherDeduct,
        bonuses: bonusVal,
        netSalary: net,
        ssnNo,
        ghanaCardNo,
      });

      if (userProfile) {
        await logActivity(
          'Update Payroll',
          `Updated payroll for ${selectedPayroll.employeeName} (${selectedPayroll.month}). Net: ${formatCurrency(net)}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }

      setIsEditing(false);
      setSelectedPayroll({
        ...selectedPayroll,
        basicSalary: basic,
        ssnit: ssnitVal,
        paye: payeVal,
        otherDeductions: otherDeduct,
        bonuses: bonusVal,
        netSalary: net,
        ssnNo,
        ghanaCardNo,
      });
      fetchPayrolls();
    } catch (error) {
      console.error("Error updating payroll:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPayslip = () => {
    if (!selectedPayroll) return;
    const data = [
      { 'Description': 'Basic Salary', 'Amount': selectedPayroll.basicSalary },
      { 'Description': 'Bonuses', 'Amount': selectedPayroll.bonuses },
      { 'Description': 'SSNIT Deduction', 'Amount': -selectedPayroll.ssnit },
      { 'Description': 'PAYE Deduction', 'Amount': -selectedPayroll.paye },
      { 'Description': 'Other Deductions', 'Amount': -selectedPayroll.otherDeductions },
      { 'Description': 'Net Salary', 'Amount': selectedPayroll.netSalary }
    ];
    exportToCSV(data, `Payslip_${selectedPayroll.employeeName}_${selectedPayroll.month}`);
  };

  const handleDeletePayroll = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this payroll record?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'payroll', id));
      if (userProfile) {
        await logActivity(
          'Delete Payroll',
          `Deleted payroll record ${id}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }
      setSelectedPayroll(null);
      setIsEditing(false);
      fetchPayrolls();
    } catch (error) {
      console.error("Error deleting payroll:", error);
    } finally {
      setLoading(false);
    }
  };

  const openDetails = (payroll: PayrollRecord) => {
    setSelectedPayroll(payroll);
    setEmployeeName(payroll.employeeName);
    setEmployeeId(payroll.employeeId);
    setStaffId(payroll.staffId || '');
    setSsnNo(payroll.ssnNo || '');
    setGhanaCardNo(payroll.ghanaCardNo || '');
    setBasicSalary(payroll.basicSalary.toString());
    setSsnit(payroll.ssnit.toString());
    setPaye(payroll.paye.toString());
    setOtherDeductions(payroll.otherDeductions.toString());
    setBonuses(payroll.bonuses.toString());
    setIsEditing(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Payroll Management</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          New Payroll Entry
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
            <input
              type="month"
              className="p-2 border border-gray-200 rounded-lg"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
          
          {isGlobalUser(userProfile?.role || '') && (
            <div className="w-full md:w-48">
              <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
              <select
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="ALL">All Branches</option>
                {dbBranches.map(branch => (
                  <option key={branch.id} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="w-full md:w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              className="w-full p-2 border border-gray-200 rounded-lg"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Approved">Approved</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-medium text-gray-600">Employee</th>
                <th className="p-4 font-medium text-gray-600">Branch</th>
                <th className="p-4 font-medium text-gray-600">Basic</th>
                <th className="p-4 font-medium text-gray-600">Bonuses</th>
                <th className="p-4 font-medium text-gray-600">Deductions</th>
                <th className="p-4 font-medium text-gray-600">Net Salary</th>
                <th className="p-4 font-medium text-gray-600">Status</th>
                <th className="p-4 font-medium text-gray-600">Month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedPayrolls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">No payroll records found for this month</td>
                </tr>
              ) : (
                paginatedPayrolls.map((payroll) => (
                  <tr key={payroll.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetails(payroll)}>
                    <td className="p-4 font-medium text-gray-900">
                      {payroll.employeeName}
                      <div className="text-xs text-gray-500">
                        {payroll.ssnNo && `SSF: ${payroll.ssnNo}`}
                        {payroll.ssnNo && payroll.ghanaCardNo && ' | '}
                        {payroll.ghanaCardNo && `GHA: ${payroll.ghanaCardNo}`}
                        {!payroll.ssnNo && !payroll.ghanaCardNo && payroll.employeeId}
                      </div>
                    </td>
                    <td className="p-4 text-gray-500">
                      {dbBranches.find(b => b.id === payroll.branchId || b.branchId === payroll.branchId || b.name === payroll.branchId)?.name || payroll.branchId}
                    </td>
                    <td className="p-4">{formatCurrency(payroll.basicSalary)}</td>
                    <td className="p-4 text-green-600">+ {formatCurrency(payroll.bonuses)}</td>
                    <td className="p-4 text-red-600">
                      - {formatCurrency(payroll.ssnit + payroll.paye + payroll.otherDeductions)}
                      <div className="text-[10px] text-gray-400">
                        S:{payroll.ssnit} P:{payroll.paye} O:{payroll.otherDeductions}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-gray-900">{formatCurrency(payroll.netSalary)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium
                        ${payroll.status === 'Paid' ? 'bg-green-100 text-green-700' : 
                          payroll.status === 'Approved' ? 'bg-blue-100 text-blue-700' :
                          (payroll.status === 'Pending Approval' || payroll.status === 'Draft') ? 'bg-yellow-100 text-yellow-700' : 
                          'bg-gray-100 text-gray-700'}`}>
                        {payroll.status === 'Draft' ? 'Pending Approval' : payroll.status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500">
                      {payroll.month}
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

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">New Payroll Entry</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddPayroll} className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Search Employee</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Type name or ID..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={staffSearchTerm}
                    onChange={e => {
                      setStaffSearchTerm(e.target.value);
                      setShowStaffResults(true);
                    }}
                    onFocus={() => setShowStaffResults(true)}
                  />
                </div>
                
                {showStaffResults && staffSearchTerm && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {staff
                      .filter(s => 
                        s.displayName?.toLowerCase().includes(staffSearchTerm.toLowerCase()) ||
                        s.id?.toLowerCase().includes(staffSearchTerm.toLowerCase()) ||
                        s.staffId?.toLowerCase().includes(staffSearchTerm.toLowerCase())
                      )
                      .map(s => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 flex flex-col"
                          onClick={() => {
                            setEmployeeName(s.displayName || 'Unnamed');
                            setEmployeeId(s.id);
                            setStaffId(s.staffId || '');
                            setSsnNo(s.ssnNo || '');
                            setGhanaCardNo(s.ghanaCardNo || '');
                            setBasicSalary(s.basicSalary?.toString() || '0');
                            setBranchId(s.branchId || '');
                            setStaffSearchTerm(s.displayName || '');
                            setShowStaffResults(false);
                          }}
                        >
                          <span className="font-medium">{s.displayName} {s.staffId && <span className="text-blue-600 ml-1">({s.staffId})</span>}</span>
                          <span className="text-xs text-gray-500">
                            Role: {s.role} | Branch: {dbBranches.find(b => b.id === s.branchId || b.branchId === s.branchId || b.name === s.branchId)?.name || s.branchId}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee Name</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500"
                    value={employeeName}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500"
                    value={dbBranches.find(b => b.id === branchId || b.branchId === branchId || b.name === branchId)?.name || branchId}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSF No.</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500"
                    value={ssnNo}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghana Card No.</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500"
                    value={ghanaCardNo}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Basic Salary</label>
                  <input
                    type="number"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={basicSalary}
                    onChange={e => setBasicSalary(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bonuses</label>
                  <input
                    type="number"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={bonuses}
                    onChange={e => setBonuses(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSNIT</label>
                  <input
                    type="number"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={ssnit}
                    onChange={e => setSsnit(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PAYE</label>
                  <input
                    type="number"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={paye}
                    onChange={e => setPaye(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Other Ded.</label>
                  <input
                    type="number"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={otherDeductions}
                    onChange={e => setOtherDeductions(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-800">Calculated Net Salary:</span>
                  <span className="text-lg font-bold text-blue-900">
                    {formatCurrency(
                      (parseFloat(basicSalary) || 0) + 
                      (parseFloat(bonuses) || 0) - 
                      (parseFloat(ssnit) || 0) - 
                      (parseFloat(paye) || 0) - 
                      (parseFloat(otherDeductions) || 0)
                    )}
                  </span>
                </div>
              </div>

              {isGlobalUser(userProfile?.role || '') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    {dbBranches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Details Modal */}
      {selectedPayroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Payroll Details</h2>
              <button onClick={() => { setSelectedPayroll(null); setIsEditing(false); }} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="mb-4 flex gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium
                ${selectedPayroll.status === 'Paid' ? 'bg-green-100 text-green-700' : 
                  selectedPayroll.status === 'Approved' ? 'bg-blue-100 text-blue-700' :
                  (selectedPayroll.status === 'Pending Approval' || selectedPayroll.status === 'Draft') ? 'bg-yellow-100 text-yellow-700' : 
                  'bg-gray-100 text-gray-700'}`}>
                {selectedPayroll.status === 'Draft' ? 'Pending Approval' : selectedPayroll.status}
              </span>
              <span className="text-sm text-gray-500">{selectedPayroll.month}</span>
            </div>

            <form onSubmit={handleUpdatePayroll} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee Name</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500"
                    value={employeeName}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500"
                    value={dbBranches.find(b => b.id === selectedPayroll.branchId || b.branchId === selectedPayroll.branchId || b.name === selectedPayroll.branchId)?.name || selectedPayroll.branchId}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSF No.</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500"
                    value={ssnNo}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghana Card No.</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500"
                    value={ghanaCardNo}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Basic Salary</label>
                  <input
                    type="number"
                    required
                    readOnly={!isEditing}
                    className={`w-full p-2 border rounded-lg ${!isEditing ? 'border-gray-100 bg-gray-50 text-gray-500' : 'border-gray-200'}`}
                    value={basicSalary}
                    onChange={e => setBasicSalary(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bonuses</label>
                  <input
                    type="number"
                    required
                    readOnly={!isEditing}
                    className={`w-full p-2 border rounded-lg ${!isEditing ? 'border-gray-100 bg-gray-50 text-gray-500' : 'border-gray-200'}`}
                    value={bonuses}
                    onChange={e => setBonuses(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSNIT</label>
                  <input
                    type="number"
                    required
                    readOnly={!isEditing}
                    className={`w-full p-2 border rounded-lg ${!isEditing ? 'border-gray-100 bg-gray-50 text-gray-500' : 'border-gray-200'}`}
                    value={ssnit}
                    onChange={e => setSsnit(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PAYE</label>
                  <input
                    type="number"
                    required
                    readOnly={!isEditing}
                    className={`w-full p-2 border rounded-lg ${!isEditing ? 'border-gray-100 bg-gray-50 text-gray-500' : 'border-gray-200'}`}
                    value={paye}
                    onChange={e => setPaye(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Other Ded.</label>
                  <input
                    type="number"
                    required
                    readOnly={!isEditing}
                    className={`w-full p-2 border rounded-lg ${!isEditing ? 'border-gray-100 bg-gray-50 text-gray-500' : 'border-gray-200'}`}
                    value={otherDeductions}
                    onChange={e => setOtherDeductions(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-800">Calculated Net Salary:</span>
                  <span className="text-lg font-bold text-blue-900">
                    {formatCurrency(
                      (parseFloat(basicSalary) || 0) + 
                      (parseFloat(bonuses) || 0) - 
                      (parseFloat(ssnit) || 0) - 
                      (parseFloat(paye) || 0) - 
                      (parseFloat(otherDeductions) || 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                {isEditing ? (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        openDetails(selectedPayroll); // Reset fields
                      }}
                      className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                ) : (
                  <>
                    {selectedPayroll.status !== 'Paid' && (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        Edit Record
                      </button>
                    )}
                    
                    <div className="flex gap-3">
                      {selectedPayroll.status === 'Paid' && (
                        <>
                          <button 
                            type="button"
                            onClick={() => printDiv('payslip-print', `Payslip_${selectedPayroll.employeeName}_${selectedPayroll.month}`)}
                            className="flex-1 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2"
                          >
                            <Printer size={18} /> Print
                          </button>
                          <button 
                            type="button"
                            onClick={handleDownloadPayslip}
                            className="flex-1 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2"
                          >
                            <Download size={18} /> Download
                          </button>
                        </>
                      )}
                      {(selectedPayroll.status === 'Pending Approval' || selectedPayroll.status === 'Draft') && (userProfile?.role === 'Director' || userProfile?.role === 'Admin') && (
                        <button 
                          type="button"
                          onClick={() => handleStatusChange(selectedPayroll.id, 'Approved')}
                          className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={18} /> Approve
                        </button>
                      )}
                      {selectedPayroll.status === 'Approved' && (userProfile?.role === 'Director' || userProfile?.role === 'Admin' || userProfile?.role === 'Accountant') && (
                        <button 
                          type="button"
                          onClick={() => handleStatusChange(selectedPayroll.id, 'Paid')}
                          className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                        >
                          <DollarSign size={18} /> Mark as Paid
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setSelectedPayroll(null); setIsEditing(false); }}
                        className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        Okay
                      </button>
                      {(selectedPayroll.status === 'Pending Approval' || selectedPayroll.status === 'Draft') && (
                        <button
                          type="button"
                          onClick={() => handleDeletePayroll(selectedPayroll.id)}
                          className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                        >
                          <Trash2 size={18} /> Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Hidden Payslip for Printing */}
              <div id="payslip-print" className="hidden">
                <div className="p-8 bg-white">
                  <div className="flex flex-col items-center text-center mb-8">
                    <div className="flex items-center gap-3 mb-2">
                      <img src="/logo.png" alt="Logo" className="h-12 w-12 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      <h1 className="text-3xl font-black text-gray-900 tracking-tighter">MASTERS PUBLICATION</h1>
                    </div>
                    <p className="text-lg font-bold text-gray-700">{selectedPayroll.branchId} Branch</p>
                    <p className="text-sm text-gray-500">Ghana</p>
                  </div>

                  <div className="flex flex-col items-center text-center mb-10">
                    <h2 className="text-xl font-black uppercase tracking-[0.2em] text-gray-900 border-b-2 border-gray-900 px-8 pb-1 mb-2">
                      Payslip
                    </h2>
                    <p className="text-sm font-mono text-gray-500">#{selectedPayroll.id}</p>
                    <p className="text-sm text-gray-900 mt-1 uppercase tracking-widest font-bold">
                      Month: {selectedPayroll.month}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-12 mb-10">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Employee Details:</h3>
                      <div className="space-y-1">
                        <p className="text-lg font-bold text-gray-900">{selectedPayroll.employeeName}</p>
                        <p className="text-sm text-gray-600">ID: {selectedPayroll.employeeId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Status:</h3>
                      <p className="text-sm font-bold text-green-600 uppercase">{selectedPayroll.status}</p>
                    </div>
                  </div>

                  <table className="w-full text-left mb-8">
                    <thead>
                      <tr className="border-b-2 border-gray-900 text-[10px] font-black uppercase tracking-widest text-gray-900">
                        <th className="py-3">Description</th>
                        <th className="py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr className="text-sm">
                        <td className="py-4 font-medium text-gray-900">Basic Salary</td>
                        <td className="py-4 text-right text-gray-900">{formatCurrency(selectedPayroll.basicSalary)}</td>
                      </tr>
                      <tr className="text-sm">
                        <td className="py-4 font-medium text-gray-900">Bonuses</td>
                        <td className="py-4 text-right text-green-600">+ {formatCurrency(selectedPayroll.bonuses)}</td>
                      </tr>
                      <tr className="text-sm">
                        <td className="py-4 font-medium text-gray-900">SSNIT Deduction</td>
                        <td className="py-4 text-right text-red-600">- {formatCurrency(selectedPayroll.ssnit)}</td>
                      </tr>
                      <tr className="text-sm">
                        <td className="py-4 font-medium text-gray-900">PAYE Deduction</td>
                        <td className="py-4 text-right text-red-600">- {formatCurrency(selectedPayroll.paye)}</td>
                      </tr>
                      <tr className="text-sm">
                        <td className="py-4 font-medium text-gray-900">Other Deductions</td>
                        <td className="py-4 text-right text-red-600">- {formatCurrency(selectedPayroll.otherDeductions)}</td>
                      </tr>
                    </tbody>
                    <tfoot className="border-t-2 border-gray-900">
                      <tr className="bg-gray-900 text-white">
                        <td className="py-4 text-right text-sm font-black uppercase tracking-widest px-4">Net Salary</td>
                        <td className="py-4 text-right text-lg font-black px-4">{formatCurrency(selectedPayroll.netSalary)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  <div className="grid grid-cols-2 gap-8 mt-20">
                    <div className="text-center">
                      <div className="border-b border-gray-900 mb-2"></div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">Employee Signature</p>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-gray-900 mb-2"></div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">Manager Signature</p>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
