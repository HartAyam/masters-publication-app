import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { Supplier, Expense } from '@/types';
import { ArrowLeft, User, Building, Phone, Mail, MapPin, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/idUtils';
import { useBranches } from '@/hooks/useBranches';

export default function SupplierDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !userProfile) return;

    const fetchSupplierData = async () => {
      try {
        setError(null);
        // Fetch Supplier
        const supplierDoc = await getDoc(doc(db, 'suppliers', id));
        if (supplierDoc.exists()) {
          setSupplier({ id: supplierDoc.id, ...supplierDoc.data() } as Supplier);
        } else {
          console.error("Supplier not found");
          setError("Supplier not found");
          return;
        }

        // Fetch Expenses (Payments to this supplier)
        if (supplierDoc.exists()) {
            const suppData = supplierDoc.data() as Supplier;
            const q = query(
                collection(db, 'expenses'),
                where('recipient', '==', suppData.name),
                orderBy('date', 'desc')
            );
            const querySnapshot = await getDocs(q);
            const expData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
            setExpenses(expData);
        }

      } catch (error: any) {
        console.error("Error fetching supplier details:", error);
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
            setError("Missing Index: This query requires a Firestore index. Please check the console for the creation link.");
        } else {
            setError("Failed to load supplier details.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSupplierData();
  }, [id, userProfile]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this supplier?')) return;
    try {
      await deleteDoc(doc(db, 'suppliers', id!));
      alert('Supplier deleted successfully');
      navigate('/suppliers');
    } catch (error) {
      console.error("Error deleting supplier:", error);
      alert('Failed to delete supplier');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!supplier) return <div className="p-8 text-center">Supplier not found</div>;

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
            <div className={`p-4 rounded-full ${supplier.type === 'Organization' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
              {supplier.type === 'Organization' ? <Building size={32} /> : <User size={32} />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs uppercase">{supplier.type}</span>
                <span>•</span>
                <span>{dbBranches.find(b => b.id === supplier.primaryBranch || b.name === supplier.primaryBranch)?.name || supplier.primaryBranch} Branch</span>
              </div>
            </div>
          </div>
          <div className="text-right space-y-3">
            <button
               onClick={handleDelete}
               className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm ml-auto"
            >
              <Trash2 size={18} />
              Delete Supplier
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 pt-6 border-t border-gray-100">
          <div className="flex items-center gap-3 text-gray-600">
            <Phone size={20} className="text-gray-400" />
            <a href={`tel:${supplier.phone}`} className="hover:text-blue-600 hover:underline">{supplier.phone}</a>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <Mail size={20} className="text-gray-400" />
            {supplier.email ? (
              <a href={`mailto:${supplier.email}`} className="hover:text-blue-600 hover:underline">{supplier.email}</a>
            ) : (
              <span>No email provided</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <MapPin size={20} className="text-gray-400" />
            <span>{supplier.address || 'No address provided'}</span>
          </div>
        </div>

        {supplier.type === 'Organization' && supplier.contactPerson && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Contact Person</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-3 text-gray-600">
                <User size={20} className="text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{supplier.contactPerson.name}</p>
                  <p className="text-xs text-gray-500">{supplier.contactPerson.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Phone size={20} className="text-gray-400" />
                <a href={`tel:${supplier.contactPerson.phone}`} className="hover:text-blue-600 hover:underline">
                  {supplier.contactPerson.phone}
                </a>
              </div>
              {supplier.contactPerson.email && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Mail size={20} className="text-gray-400" />
                  <a href={`mailto:${supplier.contactPerson.email}`} className="hover:text-blue-600 hover:underline">
                    {supplier.contactPerson.email}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expense/Payment History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Payment History (Expenses)</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-medium text-gray-600">Date</th>
                <th className="p-4 font-medium text-gray-600">Category</th>
                <th className="p-4 font-medium text-gray-600">Description</th>
                <th className="p-4 font-medium text-gray-600">Amount</th>
                <th className="p-4 font-medium text-gray-600">Approver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">No payments found</td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="p-4 text-gray-500">
                      {exp.date?.seconds ? new Date(exp.date.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-4 font-medium text-gray-900">{exp.category}</td>
                    <td className="p-4 text-gray-500">{exp.description || '-'}</td>
                    <td className="p-4 font-medium">{formatCurrency(exp.amount)}</td>
                    <td className="p-4 text-gray-500">{exp.approverName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
