import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Customer, ClientType, Branch, BranchModel } from '@/types';
import { isGlobalUser } from '@/lib/utils';
import { useBranches } from '@/hooks/useBranches';
import { Plus, Search, User, Building, Edit2, X, Download, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/idUtils';
import Pagination from '@/components/common/Pagination';

export default function ClientsList() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const { branches: dbBranches } = useBranches();
  const [clients, setClients] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<ClientType | 'ALL'>('ALL');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<ClientType>('Individual');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [primaryBranch, setPrimaryBranch] = useState<string>('');

  useEffect(() => {
    if (dbBranches.length > 0 && !primaryBranch) {
      setPrimaryBranch(dbBranches[0].name);
    }
  }, [dbBranches]);
  
  // Contact Person State
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('');

  useEffect(() => {
    if (!userProfile) return;

    let q;
    if (isGlobalUser(userProfile.role)) {
      q = query(collection(db, 'customers'));
    } else {
      q = query(collection(db, 'customers'), where('primaryBranch', '==', userProfile.branchId));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setClients(data);
    });

    return () => unsubscribe();
  }, [userProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setLoading(true);

    try {
      // Check for duplicates when adding new client
      if (!editingClient) {
        // Check phone
        const phoneQuery = query(collection(db, 'customers'), where('phone', '==', phone));
        const phoneSnapshot = await getDocs(phoneQuery);
        if (!phoneSnapshot.empty) {
          alert('A client with this phone number already exists.');
          setLoading(false);
          return;
        }

        // Check email if provided
        if (email) {
          const emailQuery = query(collection(db, 'customers'), where('email', '==', email));
          const emailSnapshot = await getDocs(emailQuery);
          if (!emailSnapshot.empty) {
            alert('A client with this email already exists.');
            setLoading(false);
            return;
          }
        }
      }

      const clientData: any = {
        name,
        type,
        phone,
        email,
        address,
        primaryBranch: isGlobalUser(userProfile.role) ? primaryBranch : userProfile.branchId,
      };

      if (type === 'Organization') {
        clientData.contactPerson = {
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          role: contactRole
        };
      }

      if (editingClient) {
        await updateDoc(doc(db, 'customers', editingClient.id), clientData);
        alert('Client updated successfully');
      } else {
        await addDoc(collection(db, 'customers'), {
          ...clientData,
          totalDebt: 0,
          createdAt: serverTimestamp(),
        });
        alert('Client created successfully');
      }

      closeModal();
    } catch (error) {
      console.error("Error saving client:", error);
      alert('Failed to save client');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (client?: Customer) => {
    if (client) {
      setEditingClient(client);
      setName(client.name);
      setType(client.type);
      setPhone(client.phone);
      setEmail(client.email || '');
      setAddress(client.address || '');
      setPrimaryBranch(client.primaryBranch);
      if (client.contactPerson) {
        setContactName(client.contactPerson.name);
        setContactPhone(client.contactPerson.phone);
        setContactEmail(client.contactPerson.email || '');
        setContactRole(client.contactPerson.role || '');
      } else {
        setContactName('');
        setContactPhone('');
        setContactEmail('');
        setContactRole('');
      }
    } else {
      setEditingClient(null);
      setName('');
      setType('Individual');
      setPhone('');
      setEmail('');
      setAddress('');
      setPrimaryBranch(isGlobalUser(userProfile?.role || '') ? (dbBranches[0]?.name || '') : userProfile?.branchId || (dbBranches[0]?.name || ''));
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setContactRole('');
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingClient(null);
  };

  const handleExport = () => {
    const dataToExport = filteredClients.map(c => ({
      Name: c.name,
      Type: c.type,
      Phone: c.phone,
      Email: c.email || '',
      Address: c.address || '',
      Debt: c.totalDebt,
      Branch: c.primaryBranch
    }));
    exportToCSV(dataToExport, `Clients_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone.includes(searchTerm);
    const matchesBranch = selectedBranch === 'ALL' || client.primaryBranch === selectedBranch;
    const matchesType = selectedType === 'ALL' || client.type === selectedType;
    return matchesSearch && matchesBranch && matchesType;
  });

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedClients.length === filteredClients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(filteredClients.map(c => c.id));
    }
  };

  const toggleSelectClient = (id: string) => {
    if (selectedClients.includes(id)) {
      setSelectedClients(selectedClients.filter(cId => cId !== id));
    } else {
      setSelectedClients([...selectedClients, id]);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients Management</h1>
          <p className="text-gray-500 text-sm">Manage your customer database and credit accounts</p>
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
            onClick={() => printDiv('clients-table', 'Clients Report')}
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
            Add New Client
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
              placeholder="Search clients by name or phone..."
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" id="clients-table">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 w-10">
                  <input 
                    type="checkbox"
                    checked={selectedClients.length === filteredClients.length && filteredClients.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="p-4 font-medium text-gray-600">Name</th>
                <th className="p-4 font-medium text-gray-600">Type</th>
                <th className="p-4 font-medium text-gray-600">Contact</th>
                <th className="p-4 font-medium text-gray-600">Branch</th>
                <th className="p-4 font-medium text-gray-600">Debt</th>
                <th className="p-4 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">No clients found</td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr 
                    key={client.id} 
                    className={`hover:bg-gray-50 cursor-pointer ${selectedClients.includes(client.id) ? 'bg-blue-50/50' : ''}`}
                    onClick={() => navigate(`/clients/${client.id}`)}
                  >
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        checked={selectedClients.includes(client.id)}
                        onChange={() => toggleSelectClient(client.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-4">
                      <span className="font-medium text-blue-600 hover:underline">
                        {client.name}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${client.type === 'Organization' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                        {client.type === 'Organization' ? <Building size={12} /> : <User size={12} />}
                        {client.type}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500" onClick={(e) => e.stopPropagation()}>
                      <div><a href={`tel:${client.phone}`} className="hover:text-blue-600">{client.phone}</a></div>
                      {client.email && <div className="text-xs text-gray-400"><a href={`mailto:${client.email}`} className="hover:text-blue-600">{client.email}</a></div>}
                    </td>
                    <td className="p-4 text-gray-500">{client.primaryBranch}</td>
                    <td className={`p-4 font-medium ${client.totalDebt > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(client.totalDebt)}
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => openModal(client)}
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
              <h2 className="text-xl font-bold text-gray-900">{editingClient ? 'Edit Client' : 'New Client'}</h2>
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
                    onChange={e => setPrimaryBranch(e.target.value)}
                  >
                    {dbBranches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
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
                  {loading ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
