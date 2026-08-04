import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { Customer, Transaction, ClientType } from '@/types';
import { ArrowLeft, User, Building, Phone, Mail, MapPin, DollarSign, Clock, CreditCard, Trash2, Edit2, X } from 'lucide-react';
import { formatCurrency } from '@/lib/idUtils';
import { useBranches } from '@/hooks/useBranches';
import { isGlobalUser } from '@/lib/utils';

export default function ClientDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [client, setClient] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ClientType>('Individual');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [primaryBranch, setPrimaryBranch] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<string>('');

  // Contact Person State
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('');

  const openEditModal = () => {
    if (!client) return;
    setName(client.name);
    setType(client.type);
    setPhone(client.phone);
    setEmail(client.email || '');
    setAddress(client.address || '');
    setPrimaryBranch(client.primaryBranch);
    setOpeningBalance(client.openingBalance !== undefined ? client.openingBalance.toString() : '');
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
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !userProfile) return;
    setLoading(true);

    try {
      const clientData: any = {
        name,
        type,
        phone,
        email,
        address,
        primaryBranch: isGlobalUser(userProfile.role) ? primaryBranch : userProfile.branchId || client.primaryBranch,
        openingBalance: parseFloat(openingBalance) || 0,
      };

      if (type === 'Organization') {
        clientData.contactPerson = {
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          role: contactRole
        };
      }

      const prevOpeningBalance = client.openingBalance || 0;
      const newOpeningBalance = parseFloat(openingBalance) || 0;
      const debtDiff = newOpeningBalance - prevOpeningBalance;
      clientData.totalDebt = (client.totalDebt || 0) + debtDiff;

      await updateDoc(doc(db, 'customers', client.id), clientData);
      
      setClient({
        ...client,
        ...clientData,
      });

      alert('Client updated successfully');
      setShowEditModal(false);
    } catch (error) {
      console.error("Error updating client:", error);
      alert('Failed to update client');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id || !userProfile) return;

    const fetchClientData = async () => {
      try {
        setError(null);
        // Fetch Client
        const clientDoc = await getDoc(doc(db, 'customers', id));
        if (clientDoc.exists()) {
          setClient({ id: clientDoc.id, ...clientDoc.data() } as Customer);
        } else {
          console.error("Client not found");
          setError("Client not found");
          return;
        }

        // Fetch Transactions
        const q = query(
          collection(db, 'transactions'),
          where('customerId', '==', id),
          orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const transData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        setTransactions(transData);
      } catch (error: any) {
        console.error("Error fetching client details:", error);
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
            setError("Missing Index: This query requires a Firestore index. Please check the console for the creation link.");
        } else {
            setError("Failed to load client details.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchClientData();
  }, [id, userProfile]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this client?')) return;
    try {
      await deleteDoc(doc(db, 'customers', id!));
      alert('Client deleted successfully');
      navigate('/clients');
    } catch (error) {
      console.error("Error deleting client:", error);
      alert('Failed to delete client');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!client) return <div className="p-8 text-center">Client not found</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={20} className="mr-2" />
        Back
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-full ${client.type === 'Organization' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
              {client.type === 'Organization' ? <Building size={32} /> : <User size={32} />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs uppercase">{client.type}</span>
                <span>•</span>
                <span>{dbBranches.find(b => b.id === client.primaryBranch || b.branchId === client.primaryBranch || b.name === client.primaryBranch)?.name || client.primaryBranch} Branch</span>
              </div>
            </div>
          </div>
          
          <div className="text-right space-y-3">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Debt</p>
              <p className={`text-3xl font-bold ${client.totalDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(client.totalDebt)}
              </p>
            </div>
            {userProfile?.role !== 'Supervisor' && (
              <div className="flex flex-col md:flex-row gap-2 justify-end">
                <button
                  onClick={openEditModal}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm justify-center"
                >
                  <Edit2 size={18} />
                  Edit Client
                </button>
                {client.totalDebt > 0 && (
                  <button 
                    onClick={() => navigate('/payments', { state: { customerId: client.id } })}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm justify-center"
                  >
                    <CreditCard size={18} />
                    Record Payment
                  </button>
                )}
                <button
                   onClick={handleDelete}
                   className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm justify-center"
                >
                  <Trash2 size={18} />
                  Delete Client
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 pt-6 border-t border-gray-100">
          <div className="flex items-center gap-3 text-gray-600">
            <Phone size={20} className="text-gray-400" />
            <a href={`tel:${client.phone}`} className="hover:text-blue-600 hover:underline">{client.phone}</a>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <Mail size={20} className="text-gray-400" />
            {client.email ? (
              <a href={`mailto:${client.email}`} className="hover:text-blue-600 hover:underline">{client.email}</a>
            ) : (
              <span>No email provided</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <MapPin size={20} className="text-gray-400" />
            <span>{client.address || 'No address provided'}</span>
          </div>
        </div>

        {client.type === 'Organization' && client.contactPerson && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Contact Person</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-3 text-gray-600">
                <User size={20} className="text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{client.contactPerson.name}</p>
                  <p className="text-xs text-gray-500">{client.contactPerson.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Phone size={20} className="text-gray-400" />
                <a href={`tel:${client.contactPerson.phone}`} className="hover:text-blue-600 hover:underline">
                  {client.contactPerson.phone}
                </a>
              </div>
              {client.contactPerson.email && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Mail size={20} className="text-gray-400" />
                  <a href={`mailto:${client.contactPerson.email}`} className="hover:text-blue-600 hover:underline">
                    {client.contactPerson.email}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Transaction History</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-medium text-gray-600">Date</th>
                <th className="p-4 font-medium text-gray-600">Type</th>
                <th className="p-4 font-medium text-gray-600">Items</th>
                <th className="p-4 font-medium text-gray-600">Total</th>
                <th className="p-4 font-medium text-gray-600">Paid</th>
                <th className="p-4 font-medium text-gray-600">Balance</th>
                <th className="p-4 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">No transactions found</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr 
                    key={tx.id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/orders/${tx.id}`)}
                  >
                    <td className="p-4 text-gray-500">
                      {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-4 font-medium text-gray-900">{tx.type}</td>
                    <td className="p-4 text-gray-500">
                      {tx.items.length} items
                      <span className="text-xs text-gray-400 block truncate max-w-[150px]">
                        {tx.items.map(i => i.productName).join(', ')}
                      </span>
                    </td>
                    <td className="p-4 font-medium">{formatCurrency(tx.totalAmount)}</td>
                    <td className="p-4 text-green-600">{formatCurrency(tx.amountPaid)}</td>
                    <td className="p-4 text-red-600">{formatCurrency(tx.balanceDue)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        tx.status === 'Completed' ? 'bg-green-100 text-green-700' :
                        tx.status === 'Pending Payment' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar text-left">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit Client</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleUpdate} className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance (GHS)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(e.target.value)}
                  placeholder="0.00"
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
                    {dbBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
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
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
