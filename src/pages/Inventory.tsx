import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { Product, Branch, BranchModel } from '@/types';
import { logActivity } from '@/services/audit';
import { cn, isGlobalUser } from '@/lib/utils';
import { useBranches } from '@/hooks/useBranches';
import { Plus, AlertTriangle, Package, Search, Download, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToCSV, printDiv } from '@/lib/exportUtils';
import { format } from 'date-fns';
import { generateInvoiceId, formatCurrency } from '@/lib/idUtils';
import Pagination from '@/components/common/Pagination';

export default function Inventory() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const { branches: dbBranches } = useBranches();
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | 'ALL'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [viewTab, setViewTab] = useState<'ALL' | 'LOW' | 'DAMAGED'>('ALL');

  // Form State
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('General');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stockLevel, setStockLevel] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('10');
  const [branchId, setBranchId] = useState<string>('');

  useEffect(() => {
    if (dbBranches.length > 0 && !branchId) {
      setBranchId(dbBranches[0].id);
    }
  }, [dbBranches, branchId]);

  useEffect(() => {
    if (!userProfile) return;

    let productsQ;
    if (isGlobalUser(userProfile.role)) {
      productsQ = query(collection(db, 'products'));
    } else {
      productsQ = query(collection(db, 'products'), where('branchId', '==', userProfile.branchId));
    }

    let movementsQ;
    if (isGlobalUser(userProfile.role)) {
      movementsQ = query(collection(db, 'stock_movements'));
    } else {
      movementsQ = query(
        collection(db, 'stock_movements'), 
        where('branchId', '==', userProfile.branchId)
      );
    }

    const unsubscribeProducts = onSnapshot(productsQ, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      
      // We need movements to calculate damaged stock accurately
      getDocs(movementsQ).then(movementsSnap => {
        const allMovements = movementsSnap.docs.map(doc => doc.data() as any);
        const damageMovements = allMovements.filter(m => m.type === 'Damage Report');
        
        const enrichedProducts = productsData.map(product => {
          const calculatedDamaged = damageMovements
            .filter(m => m.productId === product.id)
            .reduce((sum, m) => sum + (m.quantity || 0), 0);

          return {
            ...product,
            damagedStock: calculatedDamaged,
            costPrice: product.costPrice || 0
          };
        });
        setProducts(enrichedProducts);
      });
    });

    return () => unsubscribeProducts();
  }, [userProfile]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const targetBranch = isGlobalUser(userProfile?.role) ? branchId : userProfile?.branchId;
      
      // Check for duplicates
      const duplicateQuery = query(
        collection(db, 'products'),
        where('name', '==', name),
        where('sku', '==', sku),
        where('category', '==', category),
        where('branchId', '==', targetBranch)
      );
      
      const duplicateSnapshot = await getDocs(duplicateQuery);
      
      if (!duplicateSnapshot.empty) {
        alert('A product with the same name, SKU, category, and branch already exists.');
        setLoading(false);
        return;
      }

      await addDoc(collection(db, 'products'), {
        name,
        sku,
        category,
        price: parseFloat(price),
        costPrice: parseFloat(costPrice),
        stockLevel: parseInt(stockLevel),
        minStockLevel: parseInt(minStockLevel),
        damagedStock: 0,
        branchId: targetBranch,
      });

      setShowAddForm(false);
      setName('');
      setSku('');
      setPrice('');
      setCostPrice('');
      setStockLevel('');

      // Log activity
      if (userProfile) {
        await logActivity(
          'Product Added',
          `Product ${name} (SKU: ${sku}) added to inventory.`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }

      alert('Product Added Successfully');
    } catch (error) {
      console.error("Error adding product:", error);
      alert('Failed to add product');
    } finally {
      setLoading(false);
    }
  };

  // Get unique categories for filter
  const categories = Array.from(new Set(products.map(p => p.category)));

  const handleExport = () => {
    const dataToExport = filteredProducts.map(p => ({
      Name: p.name,
      SKU: p.sku,
      Category: p.category,
      Price: p.price,
      Stock: p.stockLevel,
      'Min Stock': p.minStockLevel,
      'Damaged Stock': p.damagedStock || 0,
      Branch: p.branchId
    }));
    exportToCSV(dataToExport, `Inventory_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBranch = selectedBranch === 'ALL' || product.branchId === selectedBranch;
    const matchesCategory = selectedCategory === 'ALL' || product.category === selectedCategory;
    
    let matchesTab = true;
    if (viewTab === 'LOW') {
      matchesTab = product.stockLevel <= product.minStockLevel;
    } else if (viewTab === 'DAMAGED') {
      matchesTab = (product.damagedStock || 0) > 0;
    }

    return matchesSearch && matchesBranch && matchesCategory && matchesTab;
  });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-500 text-sm">Track and manage stock levels across all branches</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => navigate('/reports/inventory')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Package size={18} />
            Generate Report
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download size={18} />
            Export
          </button>
          <button 
            onClick={() => printDiv('inventory-table', 'Inventory Report')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <Plus size={20} />
            Add New
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => { setViewTab('ALL'); setCurrentPage(1); }}
          className={cn(
            "pb-2 px-4 text-sm font-medium transition-colors relative",
            viewTab === 'ALL' ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
          )}
        >
          All Inventory
          {viewTab === 'ALL' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button
          onClick={() => { setViewTab('LOW'); setCurrentPage(1); }}
          className={cn(
            "pb-2 px-4 text-sm font-medium transition-colors relative flex items-center gap-2",
            viewTab === 'LOW' ? "text-red-600" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Low Stock
          <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-[10px]">
            {products.filter(p => p.stockLevel <= p.minStockLevel).length}
          </span>
          {viewTab === 'LOW' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />}
        </button>
        <button
          onClick={() => { setViewTab('DAMAGED'); setCurrentPage(1); }}
          className={cn(
            "pb-2 px-4 text-sm font-medium transition-colors relative flex items-center gap-2",
            viewTab === 'DAMAGED' ? "text-orange-600" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Damaged Stock
          <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full text-[10px]">
            {products.filter(p => (p.damagedStock || 0) > 0).length}
          </span>
          {viewTab === 'DAMAGED' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600" />}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {isGlobalUser(userProfile?.role) && (
            <div className="w-full md:w-48">
              <select
                className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="ALL">All Branches</option>
                {dbBranches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="w-full md:w-48">
            <select
              className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6 animate-in slide-in-from-top-2">
          <h2 className="text-lg font-semibold mb-4">Add New Item</h2>
          <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Product Name"
              required
              className="p-2 border border-gray-200 rounded-lg"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              type="text"
              placeholder="SKU"
              required
              className="p-2 border border-gray-200 rounded-lg"
              value={sku}
              onChange={e => setSku(e.target.value)}
            />
            <input
              type="text"
              placeholder="Category"
              className="p-2 border border-gray-200 rounded-lg"
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
            <input
              type="number"
              placeholder="Selling Price (GHS)"
              required
              step="0.01"
              className="p-2 border border-gray-200 rounded-lg"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
            <input
              type="number"
              placeholder="Cost Price (GHS)"
              required
              step="0.01"
              className="p-2 border border-gray-200 rounded-lg"
              value={costPrice}
              onChange={e => setCostPrice(e.target.value)}
            />
            <input
              type="number"
              placeholder="Initial Stock"
              required
              className="p-2 border border-gray-200 rounded-lg"
              value={stockLevel}
              onChange={e => setStockLevel(e.target.value)}
            />
            <input
              type="number"
              placeholder="Min Stock Alert"
              required
              className="p-2 border border-gray-200 rounded-lg"
              value={minStockLevel}
              onChange={e => setMinStockLevel(e.target.value)}
            />
            
            {isGlobalUser(userProfile?.role) && (
              <select
                className="p-2 border border-gray-200 rounded-lg"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {dbBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}

            <div className="md:col-span-3 flex justify-end gap-2 mt-2">
              <button 
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" id="inventory-table">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center">
            <Package size={48} className="text-gray-300 mb-4" />
            <p>No inventory items found.</p>
            <p className="text-sm">Add products to start tracking stock.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 font-medium text-gray-600">Product Name</th>
                  <th className="p-4 font-medium text-gray-600">SKU</th>
                  <th className="p-4 font-medium text-gray-600">Category</th>
                  <th className="p-4 font-medium text-gray-600">Branch</th>
                  <th className="p-4 font-medium text-gray-600">Stock</th>
                  <th className="p-4 font-medium text-gray-600">Damaged</th>
                  <th className="p-4 font-medium text-gray-600">Price</th>
                  <th className="p-4 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/inventory/${product.id}`)}
                  >
                    <td className="p-4 font-medium text-gray-900">{product.name}</td>
                    <td className="p-4 text-gray-500">{product.sku}</td>
                    <td className="p-4 text-gray-500">{product.category}</td>
                    <td className="p-4 text-gray-500">
                      {dbBranches.find(b => b.id === product.branchId || b.name === product.branchId)?.name || product.branchId}
                    </td>
                    <td className={cn(
                      "p-4 font-bold",
                      product.stockLevel <= product.minStockLevel ? "text-red-600" : "text-gray-900"
                    )}>
                      {product.stockLevel}
                    </td>
                    <td className="p-4 text-orange-600 font-medium">
                      {product.damagedStock || 0}
                    </td>
                    <td className="p-4">{formatCurrency(product.price)}</td>
                    <td className="p-4">
                      {product.stockLevel <= product.minStockLevel ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                          <AlertTriangle size={12} /> Low Stock
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">In Stock</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </div>
  );
}

