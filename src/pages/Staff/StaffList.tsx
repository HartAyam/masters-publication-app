import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { UserProfile, Role, Branch } from '@/types';
import { BRANCHES } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Plus, Search, User, X, Download, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '@/services/audit';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { format } from 'date-fns';
import Pagination from '@/components/common/Pagination';

export default function StaffList() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Form State
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('Cashier');
  const [branchId, setBranchId] = useState<Branch>(BRANCHES[0] as Branch);
  const [phone, setPhone] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [hireDate, setHireDate] = useState('');
  // Note: Creating a user usually requires Firebase Auth create, which is separate from Firestore.
  // For this demo, we'll just add to Firestore 'users' collection, but in reality, an Admin SDK or Cloud Function is needed to create Auth users.
  // We'll simulate the Firestore part.

  const canEdit = ['Admin', 'Director', 'Accountant'].includes(userProfile?.role || '');

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      let q = query(collection(db, 'users'));
      if (userProfile?.role === 'Cashier' || userProfile?.role === 'Manager') {
        q = query(collection(db, 'users'), where('branchId', '==', userProfile.branchId));
      }
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setStaff(data);
    } catch (error) {
      console.error("Error fetching staff:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setLoading(true);
    try {
      // In a real app, you'd trigger a cloud function to create the Auth user.
      // Here we just add the document.
      await addDoc(collection(db, 'users'), {
        email,
        displayName,
        role,
        branchId,
        phone,
        basicSalary: parseFloat(basicSalary) || 0,
        hireDate: hireDate ? new Date(hireDate).toISOString() : null,
        createdAt: serverTimestamp(),
      });
      
      if (userProfile) {
        await logActivity(
          'Add Staff',
          `Added new staff member: ${displayName} (${email}) as ${role}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId
        );
      }

      setShowModal(false);
      setEmail('');
      setDisplayName('');
      setPhone('');
      setBasicSalary('');
      setHireDate('');
      setRole('Cashier');
      fetchStaff();
      alert('Staff member added successfully (Note: Auth account not created in this demo)');
    } catch (error) {
      console.error("Error adding staff:", error);
      alert('Failed to add staff');
    } finally {
      setLoading(false);
    }
  };

  const filteredStaff = staff.filter(user => 
    (user.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredStaff.length / itemsPerPage);
  const paginatedStaff = filteredStaff.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = () => {
    const dataToExport = filteredStaff.map(s => {
      const data: any = {
        Name: s.displayName || s.email,
        Email: s.email,
        Role: s.role,
        Branch: s.branchId,
        Phone: s.phone || 'N/A',
      };
      if (userProfile?.role !== 'Cashier') {
        data.Salary = s.basicSalary || 0;
      }
      return data;
    });
    exportToCSV(dataToExport, `Staff_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-500">Manage employees and their roles</p>
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
            onClick={() => printDiv('staff-table', 'Staff Report')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
          {canEdit && (
            <button 
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus size={20} />
              Add New Staff
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search staff..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" id="staff-table">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-4 font-medium text-gray-600">Name</th>
              <th className="p-4 font-medium text-gray-600">Email</th>
              <th className="p-4 font-medium text-gray-600">Role</th>
              <th className="p-4 font-medium text-gray-600">Branch</th>
              <th className="p-4 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedStaff.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">No staff found</td>
              </tr>
            ) : (
              paginatedStaff.map((user) => (
                <tr 
                  key={user.uid} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/staff/${user.uid}`)}
                >
                  <td className="p-4 font-medium text-gray-900 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                      {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                    {user.displayName || 'Unnamed User'}
                  </td>
                  <td className="p-4 text-gray-500">{user.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium
                      ${user.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 
                        user.role === 'Manager' ? 'bg-blue-100 text-blue-700' : 
                        'bg-gray-100 text-gray-700'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500">{user.branchId}</td>
                  <td className="p-4 text-gray-400">
                    <button className="hover:text-blue-600">View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Add New Staff</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date</label>
                  <input
                    type="date"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={hireDate}
                    onChange={e => setHireDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={role}
                    onChange={e => setRole(e.target.value as Role)}
                  >
                    <option value="Cashier">Cashier</option>
                    <option value="Manager">Manager</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Director">Director</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={branchId}
                    onChange={e => setBranchId(e.target.value as Branch)}
                  >
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

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
                  {loading ? 'Saving...' : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
