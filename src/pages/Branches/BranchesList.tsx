import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { BranchModel } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { Plus, Search, MapPin, Phone, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '@/services/audit';
import Pagination from '@/components/common/Pagination';

export default function BranchesList() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<BranchModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Form State
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [managerId, setManagerId] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [momoNumber, setMomoNumber] = useState('');

  const canEdit = ['Admin', 'Director', 'Accountant'].includes(userProfile?.role || '');

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'branches'));
      const snapshot = await getDocs(q);
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BranchModel));
      
      // Fetch users to compute employee count
      const usersQ = query(collection(db, 'users'));
      const usersSnapshot = await getDocs(usersQ);
      const usersData = usersSnapshot.docs.map(doc => doc.data());

      // Compute employee count and manager name per branch
      data = data.map(branch => {
        const employeeCount = usersData.filter(user => user.branchId === branch.id || user.branchId === branch.name).length;
        let managerName = branch.managerName;
        if (!managerName && branch.managerId) {
          const manager = usersData.find(user => user.uid === branch.managerId || user.id === branch.managerId);
          if (manager) {
            managerName = manager.displayName || manager.name || manager.email;
          }
        }
        return { ...branch, employeeCount, managerName };
      });

      // Deduplicate branches by name (in case seeding ran twice)
      const uniqueBranchesMap = new Map<string, BranchModel>();
      const duplicatesToDelete: string[] = [];
      
      data.forEach(branch => {
        if (!uniqueBranchesMap.has(branch.name)) {
          uniqueBranchesMap.set(branch.name, branch);
        } else {
          duplicatesToDelete.push(branch.id);
        }
      });
      
      data = Array.from(uniqueBranchesMap.values());
      
      // Delete duplicates from DB
      for (const id of duplicatesToDelete) {
        try {
          await deleteDoc(doc(db, 'branches', id));
        } catch (e) {
          console.error('Failed to delete duplicate branch', id, e);
        }
      }
      
      setBranches(data);
    } catch (error) {
      console.error("Error fetching branches:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'branches'), {
        name,
        location,
        managerId,
        contactPhone,
        momoNumber,
        isActive: true,
        createdAt: serverTimestamp(),
      });
      
      if (userProfile) {
        await logActivity(
          'Add Branch',
          `Added new branch: ${name} at ${location}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId
        );
      }

      setShowModal(false);
      setName('');
      setLocation('');
      setManagerId('');
      setContactPhone('');
      setMomoNumber('');
      fetchBranches();
      alert('Branch added successfully');
    } catch (error) {
      console.error("Error adding branch:", error);
      alert('Failed to add branch');
    } finally {
      setLoading(false);
    }
  };

  const filteredBranches = branches.filter(branch => 
    branch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    branch.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredBranches.length / itemsPerPage);
  const paginatedBranches = filteredBranches.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Branches Management</h1>
        {canEdit && (
          <button 
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={20} />
            Add New Branch
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search branches..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedBranches.map((branch) => (
          <div 
            key={branch.id} 
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(`/branches/${branch.id}`)}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">{branch.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${branch.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {branch.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-gray-400" />
                <span className="font-medium">Location:</span> {branch.location}
              </div>
              <div className="flex items-center gap-2">
                <User size={16} className="text-gray-400" />
                <span className="font-medium">Manager:</span> {branch.managerName || branch.managerId || 'No Manager Assigned'}
              </div>
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-gray-400" />
                <span className="font-medium">Contact:</span> {branch.contactPhone || 'No Contact Info'}
              </div>
              {branch.momoNumber && (
                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-gray-400" />
                  <span className="font-medium">MoMo:</span> {branch.momoNumber}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold">
                  {branch.employeeCount || 0}
                </div>
                <span className="font-medium">Employees:</span> {branch.employeeCount || 0}
              </div>
            </div>
          </div>
        ))}
        {paginatedBranches.length === 0 && !loading && (
          <div className="col-span-full text-center py-12 text-gray-500">
            No branches found.
          </div>
        )}
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
              <h2 className="text-xl font-bold text-gray-900">Add New Branch</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddBranch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manager ID (Optional)</label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={managerId}
                  onChange={e => setManagerId(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">MoMo Number</label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={momoNumber}
                  onChange={e => setMomoNumber(e.target.value)}
                />
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
                  {loading ? 'Saving...' : 'Save Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
