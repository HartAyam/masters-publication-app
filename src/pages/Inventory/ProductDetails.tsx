import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, increment, serverTimestamp, addDoc, collection, deleteDoc } from 'firebase/firestore';
import { Modal } from '@/components/common/Modal';
import { Product } from '@/types';
import { ArrowLeft, Package, AlertTriangle, CheckCircle, Truck, X, MapPin, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useBranches';
import { formatCurrency } from '@/lib/idUtils';
import { logActivity } from '@/services/audit';

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'products', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProduct({ id: docSnap.id, ...docSnap.data() } as Product);
      } else {
        alert('Product not found');
        navigate('/inventory');
      }
    } catch (error) {
      console.error("Error fetching product:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStockUpdate = async (type: 'receive' | 'damage') => {
    if (!product || !id || !quantity) return;
    setActionLoading(true);
    const qty = parseInt(quantity);

    try {
      const productRef = doc(db, 'products', id);
      
      // Update stock level and damaged stock
      if (type === 'damage') {
        await updateDoc(productRef, {
          stockLevel: increment(-qty),
          damagedStock: increment(qty)
        });

        // Add to damaged_stock collection for dashboard tracking
        await addDoc(collection(db, 'damaged_stock'), {
          productId: id,
          productName: product.name,
          quantity: qty,
          value: qty * (product.costPrice || product.price),
          notes,
          userId: userProfile?.uid,
          timestamp: serverTimestamp(),
          branchId: product.branchId
        });
      } else {
        await updateDoc(productRef, {
          stockLevel: increment(qty)
        });
      }

      // Log the activity (optional but good for tracking)
      await addDoc(collection(db, 'stock_movements'), {
        productId: id,
        productName: product.name,
        type: type === 'receive' ? 'Stock Received' : 'Damage Report',
        quantity: qty,
        notes,
        userId: userProfile?.uid,
        userName: userProfile?.displayName || 'Unknown',
        timestamp: serverTimestamp(),
        branchId: product.branchId
      });

      alert(type === 'receive' ? 'Stock received successfully' : 'Damage reported successfully');
      setShowStockModal(false);
      setShowDamageModal(false);
      setQuantity('');
      setNotes('');
      fetchProduct(); // Refresh data
    } catch (error) {
      console.error("Error updating stock:", error);
      alert('Failed to update stock');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!id || !product) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'products', id));
      
      if (userProfile) {
        await logActivity(
          'Delete Product',
          `Deleted product: ${product.name} (SKU: ${product.sku})`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }
      
      alert('Product deleted successfully');
      navigate('/inventory');
    } catch (error) {
      console.error("Error deleting product:", error);
      alert('Failed to delete product');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading product details...</div>;
  }

  if (!product) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back
      </button>

      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-gray-500">
            <span className="flex items-center gap-1">
              <Package size={16} />
              SKU: {product.sku}
            </span>
            <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-medium">
              {product.category}
            </span>
            <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
              <MapPin size={14} />
              {dbBranches.find(b => b.id === product.branchId || b.name === product.branchId)?.name || product.branchId}
            </span>
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <div className="text-3xl font-bold text-gray-900">
            {product.stockLevel}
          </div>
          <div className="text-sm text-gray-500">Current Stock</div>
          {userProfile?.role !== 'Supervisor' && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="mt-2 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
              title="Delete Product"
            >
              <Trash2 size={14} /> Delete Record
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Unit Price</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(product.price)}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Stock Value</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(product.price * product.stockLevel)}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Status</div>
          <div className="flex items-center mt-1">
            {product.stockLevel <= product.minStockLevel ? (
              <span className="flex items-center gap-2 text-red-600 font-medium">
                <AlertTriangle size={20} />
                Low Stock
              </span>
            ) : (
              <span className="flex items-center gap-2 text-green-600 font-medium">
                <CheckCircle size={20} />
                In Stock
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {userProfile?.role !== 'Supervisor' && (
        <div className="flex gap-4">
          <button
            onClick={() => setShowStockModal(true)}
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <Truck size={20} />
            Receive New Stock
          </button>
          <button
            onClick={() => setShowDamageModal(true)}
            className="flex-1 bg-white text-red-600 border border-red-200 py-3 px-4 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <AlertTriangle size={20} />
            Report Damage
          </button>
        </div>
      )}

      {/* Receive Stock Modal */}
      <Modal 
        isOpen={showStockModal} 
        onClose={() => setShowStockModal(false)} 
        title="Receive New Stock"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Received</label>
            <input
              type="number"
              min="1"
              className="w-full p-2 border border-gray-200 rounded-lg"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
            <textarea
              className="w-full p-2 border border-gray-200 rounded-lg"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Supplier details, invoice number, etc."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowStockModal(false)}
              className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => handleStockUpdate('receive')}
              disabled={actionLoading || !quantity}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading ? 'Updating...' : 'Confirm Receipt'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Report Damage Modal */}
      <Modal 
        isOpen={showDamageModal} 
        onClose={() => setShowDamageModal(false)} 
        title="Report Damaged Items"
      >
        <div className="space-y-4">
          <div className="bg-red-50 p-3 rounded-lg text-sm text-red-700">
            This will deduct items from your current stock level.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Damaged</label>
            <input
              type="number"
              min="1"
              className="w-full p-2 border border-gray-200 rounded-lg"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Notes</label>
            <textarea
              className="w-full p-2 border border-gray-200 rounded-lg"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the damage..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowDamageModal(false)}
              className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => handleStockUpdate('damage')}
              disabled={actionLoading || !quantity}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading ? 'Updating...' : 'Confirm Damage'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Product Record"
      >
        <div className="space-y-4">
          <div className="bg-red-50 p-4 rounded-lg flex items-start gap-3">
            <AlertTriangle className="text-red-600 shrink-0" size={24} />
            <div>
              <p className="text-sm font-bold text-red-800">Warning: Irreversible Action</p>
              <p className="text-xs text-red-700 mt-1">
                This will permanently delete <strong>{product.name}</strong> from the inventory. 
                This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteProduct}
              disabled={actionLoading}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
