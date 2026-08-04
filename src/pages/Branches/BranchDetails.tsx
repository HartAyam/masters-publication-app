import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { BranchModel } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, MapPin, Phone, User, Save, Banknote, Trash2 } from 'lucide-react';

export default function BranchDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [branch, setBranch] = useState<BranchModel | null>(null);
  const [employeeCount, setEmployeeCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [managerId, setManagerId] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [momoNumber, setMomoNumber] = useState('');
  const [isActive, setIsActive] = useState(true);

  const canEdit = ['Admin', 'Director', 'Accountant'].includes(userProfile?.role || '');

  useEffect(() => {
    fetchBranch();
  }, [id]);

  const fetchBranch = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'branches', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as BranchModel;
        
        // Fetch staff to compute employee count and manager name
        const staffQ = query(collection(db, 'staff'));
        const staffSnapshot = await getDocs(staffQ);
        const staffData = staffSnapshot.docs.map(doc => doc.data());
        
        const count = staffData.filter(s => 
          s.branchId === data.id || 
          s.branchId === data.branchId || 
          s.branchId === data.name
        ).length;
        setEmployeeCount(count);

        if (!data.managerName && data.managerId) {
          const manager = staffData.find(s => s.uid === data.managerId || s.id === data.managerId || s.staffId === data.managerId);
          if (manager) {
            data.managerName = manager.displayName || manager.name || manager.email;
          }
        }

        setBranch(data);
        setName(data.name);
        setLocation(data.location);
        setManagerId(data.managerId || '');
        setContactPhone(data.contactPhone || '');
        setMomoNumber(data.momoNumber || '');
        setIsActive(data.isActive);
      } else {
        alert('Branch not found');
        navigate('/branches');
      }
    } catch (error) {
      console.error("Error fetching branch:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !canEdit) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'branches', id), {
        name,
        location,
        managerId,
        contactPhone,
        momoNumber,
        isActive
      });
      setIsEditing(false);
      fetchBranch();
      alert('Branch updated successfully');
    } catch (error) {
      console.error("Error updating branch:", error);
      alert('Failed to update branch');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this branch?')) return;
    try {
      await deleteDoc(doc(db, 'branches', id!));
      alert('Branch deleted successfully');
      navigate('/branches');
    } catch (error) {
      console.error("Error deleting branch:", error);
      alert('Failed to delete branch');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading branch details...</div>;
  if (!branch) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing ? 'Edit Branch' : branch.name}
            </h1>
            {!isEditing && branch.branchId && (
              <span className="text-xs font-mono font-bold text-blue-600">{branch.branchId}</span>
            )}
          </div>
          <div className="flex gap-2">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit Branch
              </button>
            )}
            {canEdit && !isEditing && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {isEditing ? (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager ID</label>
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
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active Branch</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Save size={18} /> Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-50 p-2 rounded-lg">
                    <MapPin className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Location</h3>
                    <p className="text-lg font-medium text-gray-900">{branch.location}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-purple-50 p-2 rounded-lg">
                    <User className="text-purple-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Manager</h3>
                    <p className="text-lg font-medium text-gray-900">{branch.managerName || branch.managerId || 'Not Assigned'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-green-50 p-2 rounded-lg">
                    <Phone className="text-green-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Contact</h3>
                    <p className="text-lg font-medium text-gray-900">{branch.contactPhone || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-green-50 p-2 rounded-lg">
                    <Banknote className="text-green-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">MoMo Number</h3>
                    <p className="text-lg font-medium text-gray-900">{branch.momoNumber || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${branch.isActive ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className={`w-6 h-6 rounded-full ${branch.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Status</h3>
                    <p className={`text-lg font-medium ${branch.isActive ? 'text-green-700' : 'text-red-700'}`}>
                      {branch.isActive ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-orange-50 p-2 rounded-lg">
                    <User className="text-orange-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Employees</h3>
                    <p className="text-lg font-medium text-gray-900">{employeeCount}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
