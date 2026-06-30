import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { UserProfile, Role, Staff } from '@/types';
import { useBranches } from '@/hooks/useBranches';
import { useAuth } from '@/context/AuthContext';
import { Plus, Search, User, X, Download, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '@/services/audit';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { generateStaffId } from '@/lib/idUtils';
import { format } from 'date-fns';
import Pagination from '@/components/common/Pagination';

export default function StaffList() {
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Form State
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('Cashier');
  const [branchId, setBranchId] = useState('');
  const [phone, setPhone] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [ssnNo, setSsnNo] = useState('');
  const [ghanaCardNo, setGhanaCardNo] = useState('');
  // Note: Creating a user usually requires Firebase Auth create, which is separate from Firestore.
  // For this demo, we'll just add to Firestore 'users' collection, but in reality, an Admin SDK or Cloud Function is needed to create Auth users.
  // We'll simulate the Firestore part.

  const canEdit = ['Admin', 'Director', 'Accountant'].includes(userProfile?.role || '');

  useEffect(() => {
    fetchStaff();
  }, []);

  useEffect(() => {
    if (dbBranches.length > 0 && !branchId) {
      const defaultBranch = dbBranches[0];
      setBranchId(defaultBranch.branchId || defaultBranch.id);
    }
  }, [dbBranches, branchId]);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      let q = query(collection(db, 'staff'));
      if (userProfile?.role === 'Cashier' || userProfile?.role === 'Manager') {
        const branchIdentifiers = [userProfile.branchId];
        try {
          const { getDoc, doc } = await import('firebase/firestore');
          const branchDoc = await getDoc(doc(db, 'branches', userProfile.branchId));
          if (branchDoc.exists()) {
            const bData = branchDoc.data() as any;
            if (bData.branchId) branchIdentifiers.push(bData.branchId);
            if (bData.name) branchIdentifiers.push(bData.name);
          } else {
            const branchNameQ = query(collection(db, 'branches'), where('name', '==', userProfile.branchId));
            const branchNameSnapshot = await getDocs(branchNameQ);
            if (!branchNameSnapshot.empty) {
              const bDoc = branchNameSnapshot.docs[0];
              if (bDoc.id) branchIdentifiers.push(bDoc.id);
              const bData = bDoc.data() as any;
              if (bData && bData.branchId) branchIdentifiers.push(bData.branchId);
            }
          }
        } catch (e) {
          console.error("Error resolving branch identifiers in StaffList:", e);
        }
        q = query(collection(db, 'staff'), where('branchId', 'in', branchIdentifiers));
      }
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
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
      // Check for duplicates
      const duplicateQuery = query(
        collection(db, 'staff'),
        where('email', '==', email),
        where('branchId', '==', branchId)
      );
      
      const duplicateSnapshot = await getDocs(duplicateQuery);
      
      if (!duplicateSnapshot.empty) {
        alert('A staff member with the same email already exists in this branch.');
        setLoading(false);
        return;
      }

      // In a real app, you'd trigger a cloud function to create the Auth user.
      // Here we just add the document.
      const branchName = dbBranches.find(b => b.id === branchId || b.branchId === branchId)?.name || branchId;
      const staffId = await generateStaffId(branchName, role);

      await addDoc(collection(db, 'staff'), {
        staffId,
        email,
        displayName,
        role,
        branchId,
        phone,
        basicSalary: parseFloat(basicSalary) || 0,
        ssnNo,
        ghanaCardNo,
        hireDate: hireDate ? new Date(hireDate).toISOString() : null,
        createdAt: serverTimestamp(),
        hasUserAccount: false,
      });
      
      if (userProfile) {
        await logActivity(
          'Add Staff',
          `Added new staff member: ${displayName} (${email}) as ${role}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }

      setShowModal(false);
      setEmail('');
      setDisplayName('');
      setPhone('');
      setBasicSalary('');
      setHireDate('');
      setSsnNo('');
      setGhanaCardNo('');
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
        Branch: dbBranches.find(b => b.id === s.branchId || b.branchId === s.branchId || b.name === s.branchId)?.name || s.branchId,
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
        <div className="flex flex-wrap items-center gap-3">
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
              className="w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 shadow-sm transition-colors"
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[600px]">
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
                  key={user.id} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/staff/${user.id}`)}
                >
                  <td className="p-4 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="flex flex-col">
                        <span>{user.displayName || 'Unnamed User'}</span>
                        {user.staffId && <span className="text-[10px] font-mono font-bold text-blue-600">{user.staffId}</span>}
                      </div>
                    </div>
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
                  <td className="p-4 text-gray-500">
                    {dbBranches.find(b => b.id === user.branchId || b.branchId === user.branchId || b.name === user.branchId)?.name || user.branchId}
                  </td>
                  <td className="p-4 text-gray-400">
                    <button className="hover:text-blue-600">View</button>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSF No.</label>
                  <input
                    type="text"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={ssnNo}
                    onChange={e => setSsnNo(e.target.value)}
                    placeholder="Enter SSF No."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghana Card No.</label>
                  <input
                    type="text"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={ghanaCardNo}
                    onChange={e => setGhanaCardNo(e.target.value)}
                    placeholder="Enter Ghana Card No."
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
                    <option value="Marketer">Marketer</option>
                    <option value="Driver">Driver</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={branchId}
                    onChange={e => setBranchId(e.target.value)}
                  >
                    {dbBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
