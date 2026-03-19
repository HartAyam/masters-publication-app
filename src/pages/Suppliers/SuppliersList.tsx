import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Supplier, ClientType, Branch } from '@/types';
import { BRANCHES, isGlobalUser } from '@/lib/utils';
import { Plus, Search, User, Building, Edit2, X, Download, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { format } from 'date-fns';
import Pagination from '@/components/common/Pagination';

export default function SuppliersList() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<ClientType | 'ALL'>('ALL');
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<ClientType>('Organization');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [primaryBranch, setPrimaryBranch] = useState<Branch>(BRANCHES[0] as Branch);
  
  // Contact Person State
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('');

  useEffect(() => {
    if (!userProfile) return;

    let q;
    if (isGlobalUser(userProfile.role)) {
      q = query(collection(db, 'suppliers'));
    } else {
      q = query(collection(db, 'suppliers'), where('primaryBranch', '==', userProfile.branchId));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
      setSuppliers(data);
    });

    return () => unsubscribe();
  }, [userProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setLoading(true);

    try {
      const supplierData: any = {
        name,
        type,
        phone,
        email,
        address,
        primaryBranch: isGlobalUser(userProfile.role) ? primaryBranch : userProfile.branchId,
      };

      if (type === 'Organization') {
        supplierData.contactPerson = {
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          role: contactRole
        };
      }

      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), supplierData);
        alert('Supplier updated successfully');
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...supplierData,
          createdAt: serverTimestamp(),
        });
        alert('Supplier created successfully');
      }

      closeModal();
    } catch (error) {
      console.error("Error saving supplier:", error);
      alert('Failed to save supplier');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setName(supplier.name);
      setType(supplier.type);
      setPhone(supplier.phone);
      setEmail(supplier.email || '');
      setAddress(supplier.address || '');
      setPrimaryBranch(supplier.primaryBranch);
      if (supplier.contactPerson) {
        setContactName(supplier.contactPerson.name);
        setContactPhone(supplier.contactPerson.phone);
        setContactEmail(supplier.contactPerson.email || '');
        setContactRole(supplier.contactPerson.role || '');
      } else {
        setContactName('');
        setContactPhone('');
        setContactEmail('');
        setContactRole('');
      }
    } else {
      setEditingSupplier(null);
      setName('');
      setType('Organization');
      setPhone('');
      setEmail('');
      setAddress('');
      setPrimaryBranch(isGlobalUser(userProfile?.role || '') ? 'Gyinyase' : userProfile?.branchId || 'Gyinyase');
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setContactRole('');
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSupplier(null);
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.phone.includes(searchTerm);
    const matchesBranch = selectedBranch === 'ALL' || supplier.primaryBranch === selectedBranch;
    const matchesType = selectedType === 'ALL' || supplier.type === selectedType;
    return matchesSearch && matchesBranch && matchesType;
  });

  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
  const paginatedSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedSuppliers.length === filteredSuppliers.length) {
      setSelectedSuppliers([]);
    } else {
      setSelectedSuppliers(filteredSuppliers.map(s => s.id));
    }
  };

  const toggleSelectSupplier = (id: string) => {
    if (selectedSuppliers.includes(id)) {
      setSelectedSuppliers(selectedSuppliers.filter(sId => sId !== id));
    } else {
      setSelectedSuppliers([...selectedSuppliers, id]);
    }
  };

  const handleExport = () => {
    const dataToExport = filteredSuppliers.map(s => ({
      Name: s.name,
      Type: s.type,
      Phone: s.phone,
      Email: s.email || '',
      Address: s.address || '',
      Branch: s.primaryBranch
    }));
    exportToCSV(dataToExport, `Suppliers_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers Management</h1>
          <p className="text-gray-500">Manage your product suppliers and vendors</p>
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
            onClick={() => printDiv('suppliers-table', 'Suppliers Report')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
          <button 
            onClick={() => openModal()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus size={20} />
            Add New Supplier
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search suppliers by name or phone..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {isGlobalUser(userProfile?.role || '') && (
            <div className="w-full md:w-48">
              <select
                className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as ClientType | 'ALL')}
            >
              <option value="ALL">All Types</option>
              <option value="Individual">Individual</option>
              <option value="Organization">Organization</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" id="suppliers-table">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 w-10">
                  <input 
                    type="checkbox"
                    checked={selectedSuppliers.length === filteredSuppliers.length && filteredSuppliers.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="p-4 font-medium text-gray-600">Name</th>
                <th className="p-4 font-medium text-gray-600">Type</th>
                <th className="p-4 font-medium text-gray-600">Contact</th>
                <th className="p-4 font-medium text-gray-600">Branch</th>
                <th className="p-4 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">No suppliers found</td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr 
                    key={supplier.id} 
                    className={`hover:bg-gray-50 cursor-pointer ${selectedSuppliers.includes(supplier.id) ? 'bg-blue-50/50' : ''}`}
                    onClick={() => navigate(`/suppliers/${supplier.id}`)}
                  >
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        checked={selectedSuppliers.includes(supplier.id)}
                        onChange={() => toggleSelectSupplier(supplier.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-4">
                      <span className="font-medium text-blue-600 hover:underline">
                        {supplier.name}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${supplier.type === 'Organization' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                        {supplier.type === 'Organization' ? <Building size={12} /> : <User size={12} />}
                        {supplier.type}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500" onClick={(e) => e.stopPropagation()}>
                      <div><a href={`tel:${supplier.phone}`} className="hover:text-blue-600">{supplier.phone}</a></div>
                      {supplier.email && <div className="text-xs text-gray-400"><a href={`mailto:${supplier.email}`} className="hover:text-blue-600">{supplier.email}</a></div>}
                    </td>
                    <td className="p-4 text-gray-500">{supplier.primaryBranch}</td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => openModal(supplier)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">{editingSupplier ? 'Edit Supplier' : 'New Supplier'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={type}
                    onChange={e => setType(e.target.value as ClientType)}
                  >
                    <option value="Individual">Individual</option>
                    <option value="Organization">Organization</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address (Optional)</label>
                <textarea
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  rows={2}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />
              </div>

              {type === 'Organization' && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Contact Person Details</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        required={type === 'Organization'}
                        className="w-full p-2 border border-gray-200 rounded-lg"
                        value={contactName}
                        onChange={e => setContactName(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="text"
                          required={type === 'Organization'}
                          className="w-full p-2 border border-gray-200 rounded-lg"
                          value={contactPhone}
                          onChange={e => setContactPhone(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <input
                          type="text"
                          className="w-full p-2 border border-gray-200 rounded-lg"
                          value={contactRole}
                          onChange={e => setContactRole(e.target.value)}
                          placeholder="e.g. Manager"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                      <input
                        type="email"
                        className="w-full p-2 border border-gray-200 rounded-lg"
                        value={contactEmail}
                        onChange={e => setContactEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {isGlobalUser(userProfile?.role || '') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Branch</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={primaryBranch}
                    onChange={e => setPrimaryBranch(e.target.value as Branch)}
                  >
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
