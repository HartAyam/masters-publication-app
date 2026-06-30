import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { UserProfile, Role, Branch, BranchModel, Staff } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useBranches';
import { ArrowLeft, User, Mail, Shield, MapPin, Save, Phone, DollarSign, Calendar, Clock, Trash2 } from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { formatCurrency } from '@/lib/idUtils';

export default function StaffDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Cashier');
  const [branchId, setBranchId] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [ssnNo, setSsnNo] = useState('');
  const [ghanaCardNo, setGhanaCardNo] = useState('');

  const canEdit = ['Admin', 'Director', 'Accountant'].includes(userProfile?.role || '');
  const canDelete = true; // Granted access to all roles for the delete functionality

  useEffect(() => {
    fetchStaff();
  }, [id]);

  useEffect(() => {
    if (staff && dbBranches.length > 0) {
      const matchingBranch = dbBranches.find(b => b.id === staff.branchId || b.branchId === staff.branchId || b.name === staff.branchId);
      if (matchingBranch) {
        setBranchId(matchingBranch.id);
      }
    }
  }, [staff, dbBranches]);

  const fetchStaff = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'staff', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Staff;
        setStaff(data);
        setDisplayName(data.displayName || '');
        setEmail(data.email || '');
        setRole(data.role);
        setBranchId(data.branchId);
        setPhone(data.phone || '');
        setBasicSalary(data.basicSalary?.toString() || '0');
        setSsnNo(data.ssnNo || '');
        setGhanaCardNo(data.ghanaCardNo || '');
        setHireDate(data.hireDate ? format(new Date(data.hireDate), 'yyyy-MM-dd') : '');
      } else {
        alert('Staff member not found');
        navigate('/staff');
      }
    } catch (error) {
      console.error("Error fetching staff:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !canEdit) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'staff', id), {
        displayName,
        email,
        role,
        branchId,
        phone,
        basicSalary: parseFloat(basicSalary) || 0,
        ssnNo,
        ghanaCardNo,
        hireDate: hireDate ? new Date(hireDate).toISOString() : null
      });
      setIsEditing(false);
      fetchStaff();
      alert('Staff updated successfully');
    } catch (error) {
      console.error("Error updating staff:", error);
      alert('Failed to update staff');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !canDelete) return;
    setLoading(true);

    try {
      // Check for approved payrolls
      const q = query(
        collection(db, 'payroll'),
        where('employeeId', '==', id),
        where('status', 'in', ['Approved', 'Paid'])
      );
      const payrollSnap = await getDocs(q);
      
      if (!payrollSnap.empty) {
        alert("Cannot delete staff member because they have approved or paid payroll records.");
        setLoading(false);
        return;
      }
    } catch (error) {
      console.error("Error checking payrolls:", error);
      alert("Error verifying staff payrolls before deletion.");
      setLoading(false);
      return;
    }

    if (!window.confirm('Are you sure you want to delete this staff member?')) {
      setLoading(false);
      return;
    }

    try {
      await deleteDoc(doc(db, 'staff', id));
      alert('Staff member deleted successfully');
      navigate('/staff');
    } catch (error) {
      console.error("Error deleting staff:", error);
      alert('Failed to delete staff member');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading staff details...</div>;
  if (!staff) return null;

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
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl flex-shrink-0">
              {staff.displayName ? staff.displayName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {staff.displayName || 'Unnamed User'}
              </h1>
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <span className="truncate max-w-[150px] sm:max-w-xs">{staff.email}</span>
                {staff.staffId && (
                  <>
                    <span>•</span>
                    <span className="font-mono font-bold text-blue-600">{staff.staffId}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-start sm:justify-end">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit Profile
              </button>
            )}
            {canDelete && !isEditing && (
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
            <form onSubmit={handleUpdate} className="space-y-4 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
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
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghana Card No.</label>
                  <input
                    type="text"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={ghanaCardNo}
                    onChange={e => setGhanaCardNo(e.target.value)}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="bg-blue-50 p-2 rounded-lg">
                  <User className="text-blue-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Full Name</h3>
                  <p className="text-lg font-medium text-gray-900">{staff.displayName || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-purple-50 p-2 rounded-lg">
                  <Mail className="text-purple-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Email Address</h3>
                  <p className="text-lg font-medium text-gray-900">{staff.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-green-50 p-2 rounded-lg">
                  <Shield className="text-green-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Role</h3>
                  <p className="text-lg font-medium text-gray-900">{staff.role}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-orange-50 p-2 rounded-lg">
                  <MapPin className="text-orange-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Branch</h3>
                  <p className="text-lg font-medium text-gray-900">
                    {dbBranches.find(b => b.id === staff.branchId || b.branchId === staff.branchId || b.name === staff.branchId)?.name || staff.branchId}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-green-50 p-2 rounded-lg">
                  <Phone className="text-green-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Phone Number</h3>
                  <p className="text-lg font-medium text-gray-900">{staff.phone || 'N/A'}</p>
                </div>
              </div>
              {userProfile?.role !== 'Cashier' && (
                <div className="flex items-start gap-3">
                  <div className="bg-blue-50 p-2 rounded-lg">
                    <DollarSign className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Basic Salary</h3>
                    <p className="text-lg font-medium text-gray-900">{formatCurrency(staff.basicSalary || 0)}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="bg-teal-50 p-2 rounded-lg">
                  <Calendar className="text-teal-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Hire Date</h3>
                  <p className="text-lg font-medium text-gray-900">
                    {staff.hireDate ? format(new Date(staff.hireDate), 'MMM dd, yyyy') : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-gray-50 p-2 rounded-lg">
                  <Shield className="text-gray-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">SSF No.</h3>
                  <p className="text-lg font-medium text-gray-900">{staff.ssnNo || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-gray-50 p-2 rounded-lg">
                  <Shield className="text-gray-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Ghana Card No.</h3>
                  <p className="text-lg font-medium text-gray-900">{staff.ghanaCardNo || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-indigo-50 p-2 rounded-lg">
                  <Clock className="text-indigo-600" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Years Engaged</h3>
                  <p className="text-lg font-medium text-gray-900">
                    {staff.hireDate ? differenceInYears(new Date(), new Date(staff.hireDate)) : 0} Years
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
