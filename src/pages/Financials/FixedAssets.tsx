import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where } from 'firebase/firestore';
import { FixedAsset, BranchModel } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useBranches';
import { Plus, Search, Trash2, Edit2, Save, X, Package } from 'lucide-react';
import { format } from 'date-fns';

export default function FixedAssets() {
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [depreciationRate, setDepreciationRate] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (dbBranches.length > 0 && !branchId) {
      setBranchId(userProfile?.branchId || dbBranches[0].id);
    }
  }, [dbBranches, userProfile, branchId]);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'fixed_assets'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FixedAsset));
      setAssets(data);
    } catch (error) {
      console.error("Error fetching fixed assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Check for duplicates when adding new asset
      if (!editingAsset) {
        const duplicateQuery = query(
          collection(db, 'fixed_assets'),
          where('name', '==', name),
          where('branchId', '==', branchId)
        );
        
        const duplicateSnapshot = await getDocs(duplicateQuery);
        
        if (!duplicateSnapshot.empty) {
          alert('An asset with this name already exists in this branch.');
          setLoading(false);
          return;
        }
      }

      const assetData = {
        name,
        category,
        purchaseDate: new Date(purchaseDate),
        purchasePrice: parseFloat(purchasePrice),
        currentValue: parseFloat(currentValue),
        depreciationRate: parseFloat(depreciationRate),
        branchId,
        description,
        updatedAt: serverTimestamp(),
      };

      if (editingAsset) {
        await updateDoc(doc(db, 'fixed_assets', editingAsset.id), assetData);
      } else {
        await addDoc(collection(db, 'fixed_assets'), {
          ...assetData,
          createdAt: serverTimestamp(),
        });
      }

      setShowModal(false);
      resetForm();
      fetchAssets();
    } catch (error) {
      console.error("Error saving fixed asset:", error);
      alert('Failed to save fixed asset');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this asset?')) return;
    try {
      await deleteDoc(doc(db, 'fixed_assets', id));
      fetchAssets();
    } catch (error) {
      console.error("Error deleting fixed asset:", error);
    }
  };

  const resetForm = () => {
    setName('');
    setCategory('');
    setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setPurchasePrice('');
    setCurrentValue('');
    setDepreciationRate('');
    setBranchId(userProfile?.branchId || (dbBranches[0]?.id || ''));
    setDescription('');
    setEditingAsset(null);
  };

  const openEditModal = (asset: FixedAsset) => {
    setEditingAsset(asset);
    setName(asset.name);
    setCategory(asset.category);
    setPurchaseDate(format(asset.purchaseDate.toDate ? asset.purchaseDate.toDate() : new Date(asset.purchaseDate), 'yyyy-MM-dd'));
    setPurchasePrice(asset.purchasePrice.toString());
    setCurrentValue(asset.currentValue.toString());
    setDepreciationRate(asset.depreciationRate.toString());
    setBranchId(asset.branchId);
    setDescription(asset.description || '');
    setShowModal(true);
  };

  const filteredAssets = assets.filter(asset => 
    asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Fixed Assets Management</h1>
        <button 
          onClick={() => { resetForm(); setShowModal(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Add Asset
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search assets..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">Asset Name</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">Category</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">Branch</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">Purchase Price</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">Current Value</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Package className="text-blue-600" size={20} />
                      </div>
                      <span className="font-medium text-gray-900">{asset.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{asset.category}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                    {dbBranches.find(b => b.id === asset.branchId || b.name === asset.branchId)?.name || asset.branchId}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium whitespace-nowrap">GH₵ {asset.purchasePrice.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium whitespace-nowrap">GH₵ {asset.currentValue.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => openEditModal(asset)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(asset.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAssets.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No assets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-gray-900">
                {editingAsset ? 'Edit Asset' : 'Add New Asset'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name</label>
                    <input
                      type="text"
                      required
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      required
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                    >
                      <option value="">Select Category</option>
                      <option value="Furniture">Furniture</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Vehicles">Vehicles</option>
                      <option value="Machinery">Machinery</option>
                      <option value="Buildings">Buildings</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                    <input
                      type="date"
                      required
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={purchaseDate}
                      onChange={e => setPurchaseDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                    <select
                      required
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={branchId}
                      onChange={e => setBranchId(e.target.value)}
                    >
                      {dbBranches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price (GH₵)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={purchasePrice}
                      onChange={e => setPurchasePrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Value (GH₵)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={currentValue}
                      onChange={e => setCurrentValue(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Depreciation Rate (% Annual)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      className="w-full p-2 border border-gray-200 rounded-lg"
                      value={depreciationRate}
                      onChange={e => setDepreciationRate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
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
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Save size={20} />
                    {loading ? 'Saving...' : 'Save Asset'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
