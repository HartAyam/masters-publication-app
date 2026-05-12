import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc, addDoc, setDoc, collection, serverTimestamp, increment, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Transaction, SaleItem, Customer, BranchModel, UserProfile } from '../../types';
import { ArrowLeft, Printer, Download, Calendar, User, CreditCard, MapPin, X, Trash2, AlertCircle, CheckCircle2, ShoppingCart, Mail, Phone, Building } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logActivity } from '@/services/audit';
import { formatCurrency, generateInvoiceId } from '../../lib/idUtils';
import { format } from 'date-fns';
import { exportToCSV, printDiv } from '@/lib/exportUtils';

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [order, setOrder] = useState<Transaction | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [branch, setBranch] = useState<BranchModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [supplyType, setSupplyType] = useState<'Full' | 'Partial'>('Full');
  const [supplyItems, setSupplyItems] = useState<SaleItem[]>([]);
  const [suppliedByStaff, setSuppliedByStaff] = useState('');
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [processing, setProcessing] = useState(false);
  
  // Adjust state
  const [adjustedItems, setAdjustedItems] = useState<SaleItem[]>([]);
  
  // Return state
  const [returnType, setReturnType] = useState<'Full' | 'Partial'>('Full');
  const [returnItems, setReturnItems] = useState<SaleItem[]>([]);

  useEffect(() => {
    if (id) {
      fetchOrder(id);
      fetchStaff();
    }
  }, [id]);

  useEffect(() => {
    if (order) {
      setAdjustedItems([...order.items]);
      setReturnItems(order.items.map(item => ({ ...item, quantity: 0, total: 0 })));
      setSupplyItems(order.items.map(item => ({ 
        ...item, 
        quantity: item.quantity - (item.suppliedQuantity || 0),
        total: (item.quantity - (item.suppliedQuantity || 0)) * item.price
      })));
    }
  }, [order, showAdjustModal, showReturnModal, showSupplyModal]);

  const fetchStaff = async () => {
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      setStaffList(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    } catch (error) {
      console.error("Error fetching staff:", error);
    }
  };

  const fetchOrder = async (orderId: string) => {
    setLoading(true);
    try {
      const docRef = doc(db, 'transactions', orderId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const orderData = { id: docSnap.id, ...docSnap.data() } as Transaction;
        setOrder(orderData);

        // Fetch Customer
        if (orderData.customerId) {
          const custSnap = await getDoc(doc(db, 'customers', orderData.customerId));
          if (custSnap.exists()) {
            setCustomer({ id: custSnap.id, ...custSnap.data() } as Customer);
          }
        }

        // Fetch Branch
        const branchQ = query(collection(db, 'branches'));
        const branchSnapshot = await getDocs(branchQ);
        const branches = branchSnapshot.docs.map(d => ({ id: d.id, ...d.data() as any } as BranchModel));
        const matchedBranch = branches.find(b => b.id === orderData.branchId || b.branchId === orderData.branchId || b.name === orderData.branchId);
        if (matchedBranch) {
          setBranch(matchedBranch);
        }
      } else {
        console.log("No such document!");
      }
    } catch (error) {
      console.error("Error fetching order:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async () => {
    if (!order || processing) return;
    setProcessing(true);
    try {
      // 1. Create backup of original
      const { id: _, ...orderData } = order;
      // Remove any undefined values from orderData to avoid Firestore errors
      Object.keys(orderData).forEach(key => {
        if ((orderData as any)[key] === undefined) {
          delete (orderData as any)[key];
        }
      });

      const backupData = {
        ...orderData,
        isBackup: true,
        status: 'Adjusted' as const,
        originalTransactionId: order.id,
        adjustmentDate: serverTimestamp()
      };
      await addDoc(collection(db, 'transactions'), backupData);

      // 2. Calculate new totals
      const newTotalAmount = adjustedItems.reduce((sum, item) => sum + item.total, 0);
      const amountDiff = order.totalAmount - newTotalAmount;

      // 3. Update stock
      for (const originalItem of order.items) {
        const adjustedItem = adjustedItems.find(i => i.productId === originalItem.productId);
        const qtyDiff = originalItem.quantity - (adjustedItem ? adjustedItem.quantity : 0);
        
        if (qtyDiff !== 0) {
          const productRef = doc(db, 'products', originalItem.productId);
          await updateDoc(productRef, {
            stockLevel: increment(qtyDiff)
          });
        }
      }

      // 4. Update customer debt if credit sale
      if (order.type === 'Credit Sale' && order.customerId && amountDiff !== 0) {
        const customerRef = doc(db, 'customers', order.customerId);
        await updateDoc(customerRef, {
          totalDebt: increment(-amountDiff)
        });
      }

      // 5. Update current transaction
      const transactionRef = doc(db, 'transactions', order.id);
      await updateDoc(transactionRef, {
        items: adjustedItems,
        totalAmount: newTotalAmount,
        balanceDue: order.type === 'Credit Sale' ? newTotalAmount - order.amountPaid : order.balanceDue,
        isAdjusted: true,
        adjustmentDate: serverTimestamp()
      });

      // 6. Log Activity
      if (userProfile) {
        await logActivity(
          'Order Adjusted',
          `Order ${order.id} adjusted. New Total: ${formatCurrency(newTotalAmount)}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }

      setShowAdjustModal(false);
      fetchOrder(order.id);
      alert('Order adjusted successfully!');
    } catch (error) {
      console.error("Adjustment failed:", error);
      alert('Adjustment failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleReturn = async () => {
    if (!order || processing) return;
    setProcessing(true);
    try {
      const itemsToReturn = returnType === 'Full' ? order.items : returnItems.filter(i => i.quantity > 0);
      if (itemsToReturn.length === 0) {
        alert("No items selected for return");
        return;
      }

      const returnTotal = itemsToReturn.reduce((sum, item) => sum + item.total, 0);

      // 1. Create Return Transaction Record
      const returnTransaction: any = {
        type: 'Stock Return',
        items: itemsToReturn,
        totalAmount: returnTotal,
        amountPaid: -returnTotal, // Refund
        balanceDue: 0,
        customerId: order.customerId || null,
        customerName: order.customerName || 'Walk-in Customer',
        customerPhone: order.customerPhone || '',
        status: 'Returned',
        date: serverTimestamp(),
        cashierId: order.cashierId,
        branchId: order.branchId,
        originalTransactionId: order.id
      };
      
      // Clean up any undefined fields just in case
      Object.keys(returnTransaction).forEach(key => {
        if (returnTransaction[key] === undefined) {
          delete returnTransaction[key];
        }
      });

      await addDoc(collection(db, 'transactions'), returnTransaction);

      // 2. Update Stock
      for (const item of itemsToReturn) {
        const productRef = doc(db, 'products', item.productId);
        await updateDoc(productRef, {
          stockLevel: increment(item.quantity)
        });
      }

      // 3. Update Customer Debt if Credit Sale
      if (order.type === 'Credit Sale' && order.customerId) {
        const customerRef = doc(db, 'customers', order.customerId);
        await updateDoc(customerRef, {
          totalDebt: increment(-returnTotal)
        });
      }

      // 4. Update original order status if full return
      if (returnType === 'Full') {
        const transactionRef = doc(db, 'transactions', order.id);
        await updateDoc(transactionRef, {
          status: 'Returned'
        });
      }

      // 5. Log Activity
      if (userProfile) {
        await logActivity(
          'Order Returned',
          `Order ${order.id} ${returnType === 'Full' ? 'fully' : 'partially'} returned. Amount: ${formatCurrency(returnTotal)}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }

      setShowReturnModal(false);
      fetchOrder(order.id);
      alert('Return processed successfully!');
    } catch (error) {
      console.error("Return failed:", error);
      alert('Return failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleSupply = async () => {
    if (!order || processing || !suppliedByStaff) {
      if (!suppliedByStaff) alert("Please select who is supplying the items");
      return;
    }
    setProcessing(true);
    try {
      const itemsToSupply = supplyType === 'Full' 
        ? order.items.map(item => ({ ...item, quantity: item.quantity - (item.suppliedQuantity || 0) }))
        : supplyItems.filter(i => i.quantity > 0);

      if (itemsToSupply.length === 0) {
        alert("No items to supply");
        return;
      }

      // 1. Update the original order items suppliedQuantity
      const updatedItems = order.items.map(item => {
        const supplyItem = itemsToSupply.find(si => si.productId === item.productId);
        if (supplyItem) {
          return {
            ...item,
            suppliedQuantity: (item.suppliedQuantity || 0) + supplyItem.quantity
          };
        }
        return item;
      });

      // Check if fully supplied
      const isFullySupplied = updatedItems.every(item => item.suppliedQuantity === item.quantity);
      const newStatus = isFullySupplied ? 'Supplied' : 'Partially Supplied';

      const transactionRef = doc(db, 'transactions', order.id);
      await updateDoc(transactionRef, {
        items: updatedItems,
        status: newStatus,
        suppliedBy: suppliedByStaff // Update the last person who supplied
      });

      // 2. Create a Supply Note (Transaction record)
      const invoiceId = await generateInvoiceId('Supply Note', order.branchId);
      const supplyNote = {
        id: invoiceId,
        type: 'Supply Note',
        items: itemsToSupply,
        totalAmount: itemsToSupply.reduce((sum, i) => sum + i.total, 0),
        amountPaid: 0,
        balanceDue: 0,
        customerId: order.customerId || null,
        customerName: order.customerName || 'Walk-in Customer',
        customerPhone: order.customerPhone || '',
        status: 'Completed',
        date: serverTimestamp(),
        cashierId: userProfile?.uid,
        preparedBy: userProfile?.displayName || userProfile?.email,
        suppliedBy: suppliedByStaff,
        branchId: order.branchId,
        originalTransactionId: order.id
      };
      await setDoc(doc(db, 'transactions', invoiceId), supplyNote);

      // 3. Update Stock
      for (const item of itemsToSupply) {
        const productRef = doc(db, 'products', item.productId);
        await updateDoc(productRef, {
          stockLevel: increment(-item.quantity)
        });
      }

      // 4. Log Activity
      if (userProfile) {
        await logActivity(
          'Items Supplied',
          `Order ${order.id} ${isFullySupplied ? 'fully' : 'partially'} supplied by ${suppliedByStaff}`,
          userProfile.uid,
          userProfile.role,
          userProfile.branchId,
          userProfile.displayName,
          userProfile.email
        );
      }

      setShowSupplyModal(false);
      alert('Supply processed successfully!');
      navigate(`/orders/${invoiceId}`);
    } catch (error) {
      console.error("Supply failed:", error);
      alert('Supply failed');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center">Loading order details...</div>;
  }

  if (!order) {
    return <div className="p-6 text-center">Order not found</div>;
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleDownload = () => {
    if (!order) return;
    const data = order.items.map(item => ({
      'Item Description': item.productName,
      'Quantity': item.quantity,
      'Unit Price': item.price,
      'Total': item.total
    }));
    exportToCSV(data, `Invoice_${order.id}`);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => printDiv('invoice-print', `Invoice_${order.id}`)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
          <button 
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download size={18} />
            Download
          </button>
          <button 
            onClick={() => setShowAdjustModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <AlertCircle size={18} />
            Adjust
          </button>
          <button 
            onClick={() => setShowReturnModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <ShoppingCart size={18} />
            Return
          </button>
          {order.type === 'Deposit' && order.status !== 'Supplied' && (
            <button 
              onClick={() => setShowSupplyModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 hover:bg-green-100 transition-colors"
            >
              <CheckCircle2 size={18} />
              Supply Items
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative" id="invoice-print">
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.05] z-0">
          <img src="/logo.png" alt="" className="w-1/2 object-contain" />
        </div>

        {/* Invoice Header */}
        <div className="p-4 border-b border-gray-100 relative z-10">
          <div className="flex flex-col items-center text-center mb-4">
            <img src="/logo.png" alt="Logo" className="h-20 w-20 object-contain mb-2" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <h1 className="text-2xl font-black text-gray-900 tracking-tighter">MASTERS PUBLICATION</h1>
            <p className="text-base font-bold text-gray-700">{branch?.name || order.branchId} Branch</p>
            <p className="text-xs text-gray-500">{branch?.location || 'Ghana'}</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {branch?.contactPhone && <span><span className="font-bold">Tel:</span> {branch.contactPhone}</span>}
              {branch?.momoNumber && <span><span className="font-bold">MoMo:</span> {branch.momoNumber}</span>}
            </div>
            <p className="text-xs text-gray-500">kwamentimmasters@gmail.com</p>
          </div>

          <div className="flex flex-col items-center text-center mb-6">
            <h2 className="text-lg font-black uppercase tracking-[0.2em] text-gray-900 border-b-2 border-gray-900 px-6 pb-0.5 mb-1">
              {order.type === 'Supply Note' ? 'Supply Note' : 'Invoice'}
            </h2>
            <p className="text-xs font-mono text-gray-500">#{order.id}</p>
            <p className="text-xs text-gray-900 mt-0.5 uppercase tracking-widest font-bold">
              Date: {order.date?.toDate ? format(order.date.toDate(), 'dd MMM yyyy, HH:mm') : (order.date ? format(new Date(order.date), 'dd MMM yyyy, HH:mm') : 'N/A')}
            </p>
            {order.originalTransactionId && (
              <p className="text-[10px] text-gray-400 mt-0.5">Ref: #{order.originalTransactionId}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Bill To:</h3>
                <div className="space-y-0.5">
                  <p className="text-base font-bold text-gray-900">{order.customerName}</p>
                  <p className="text-xs text-gray-600">{customer?.address || 'N/A'}</p>
                  <p className="text-xs text-gray-600">{order.customerPhone || 'N/A'}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-right">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">
                  {order.type === 'Supply Note' ? 'Supply Details:' : 'Payment Details:'}
                </h3>
                <div className="space-y-0.5 text-xs">
                  <p className="text-gray-600"><span className="font-bold text-gray-900">Type:</span> {order.type}</p>
                  {order.type !== 'Supply Note' && (
                    <>
                      <p className="text-gray-600"><span className="font-bold text-gray-900">Method:</span> {order.paymentMethod || 'Cash'}</p>
                      {order.paymentMethod !== 'Cash' && order.paymentMethod && (
                        <>
                          <p className="text-gray-600"><span className="font-bold text-gray-900">Acc No:</span> {order.accountNumber}</p>
                          <p className="text-gray-600"><span className="font-bold text-gray-900">Bank:</span> {order.bankName}</p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 py-2 border-y border-gray-100 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Prepared By:</span>
              <span className="text-xs font-bold text-gray-900">{order.preparedBy || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Supplied By:</span>
              <span className="text-xs font-bold text-gray-900">{order.suppliedBy || 'N/A'}</span>
            </div>
          </div>

          {/* Order Items */}
          <table className="w-full text-left mb-6">
            <thead>
              <tr className="border-b-2 border-gray-900 text-[10px] font-black uppercase tracking-widest text-gray-900">
                <th className="py-2">Item Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit Price</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items.map((item, index) => (
                <tr key={index} className="text-xs">
                  <td className="py-1.5 font-medium text-gray-900">{item.productName}</td>
                  <td className="py-1.5 text-right text-gray-600">{item.quantity}</td>
                  <td className="py-1.5 text-right text-gray-600">{formatCurrency(item.price)}</td>
                  <td className="py-1.5 text-right font-bold text-gray-900">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-900">
              <tr>
                <td colSpan={3} className="py-2 text-right text-xs font-black uppercase tracking-widest text-gray-900">Subtotal</td>
                <td className="py-2 text-right text-base font-black text-gray-900">{formatCurrency(order.items.reduce((sum, i) => sum + i.total, 0))}</td>
              </tr>
              {order.discount > 0 && (
                <tr>
                  <td colSpan={3} className="py-1 text-right text-[10px] font-bold text-rose-600 uppercase tracking-widest">Discount ({order.discount}%)</td>
                  <td className="py-1 text-right text-xs font-bold text-rose-600">-{formatCurrency((order.items.reduce((sum, i) => sum + i.total, 0) * order.discount) / 100)}</td>
                </tr>
              )}
              <tr className="bg-gray-50">
                <td colSpan={3} className="py-2 text-right text-xs font-black uppercase tracking-widest text-gray-900">Total Amount</td>
                <td className="py-2 text-right text-base font-black text-gray-900">{formatCurrency(order.totalAmount)}</td>
              </tr>
              {order.type === 'Credit Sale' && (
                <>
                  <tr>
                    <td colSpan={3} className="py-1 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest">Payment/Credits</td>
                    <td className="py-1 text-right text-xs font-bold text-gray-700">{formatCurrency(customer?.totalDebt || 0)}</td>
                  </tr>
                  <tr className="bg-gray-900 text-white">
                    <td colSpan={3} className="py-2 text-right text-xs font-black uppercase tracking-widest px-4">Balance Due</td>
                    <td className="py-2 text-right text-base font-black px-4">{formatCurrency(customer?.totalDebt || 0)}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-8 mt-10">
            <div className="text-center">
              <div className="border-b border-gray-900 mb-2"></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">Cashier Sign</p>
            </div>
            <div className="text-center">
              <div className="border-b border-gray-900 mb-2"></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">Supplier Sign</p>
            </div>
            <div className="text-center">
              <div className="border-b border-gray-900 mb-2"></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">Customer Sign</p>
            </div>
          </div>
        </div>
      </div>

      {/* Adjust Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-amber-50">
              <h2 className="font-bold text-amber-900 flex items-center gap-2">
                <AlertCircle size={20} />
                Adjust Order Items
              </h2>
              <button onClick={() => setShowAdjustModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-gray-500 mb-6">
                Adjust quantities to match what the customer actually received. 
                Reducing quantities will increase stock levels.
              </p>
              
              <table className="w-full text-left">
                <thead>
                  <tr className="text-sm text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium text-center">Original Qty</th>
                    <th className="pb-2 font-medium text-center">New Qty</th>
                    <th className="pb-2 font-medium text-center">New Price</th>
                    <th className="pb-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {adjustedItems.map((item, idx) => {
                    const original = order.items.find(i => i.productId === item.productId);
                    return (
                      <tr key={idx}>
                        <td className="py-3 text-sm font-medium text-gray-900">{item.productName}</td>
                        <td className="py-3 text-sm text-center text-gray-500">{original?.quantity || 0}</td>
                        <td className="py-3 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            <input 
                              type="number"
                              min="0"
                              max={original?.quantity || 0}
                              className="w-16 p-1 border border-gray-200 rounded text-center text-sm"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQty = parseInt(e.target.value) || 0;
                                setAdjustedItems(prev => prev.map((it, i) => 
                                  i === idx ? { ...it, quantity: newQty, total: newQty * it.price } : it
                                ));
                              }}
                            />
                            <span className="text-[10px] text-gray-400">Qty</span>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            <input 
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-20 p-1 border border-gray-200 rounded text-center text-sm"
                              value={item.price}
                              onChange={(e) => {
                                const newPrice = parseFloat(e.target.value) || 0;
                                setAdjustedItems(prev => prev.map((it, i) => 
                                  i === idx ? { ...it, price: newPrice, total: it.quantity * newPrice } : it
                                ));
                              }}
                            />
                            <span className="text-[10px] text-gray-400">Price</span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <button 
                            onClick={() => setAdjustedItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">New Total</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(adjustedItems.reduce((sum, i) => sum + i.total, 0))}
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAdjust}
                  disabled={processing}
                  className="px-6 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Confirm Adjustment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-rose-50">
              <h2 className="font-bold text-rose-900 flex items-center gap-2">
                <ArrowLeft size={20} className="rotate-180" />
                Process Stock Return
              </h2>
              <button onClick={() => setShowReturnModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex gap-4 mb-6">
                <button 
                  onClick={() => setReturnType('Full')}
                  className={cn(
                    "flex-1 p-4 rounded-xl border-2 transition-all text-left",
                    returnType === 'Full' ? "border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-200"
                  )}
                >
                  <CheckCircle2 className={cn("mb-2", returnType === 'Full' ? "text-rose-600" : "text-gray-300")} />
                  <h3 className="font-bold text-gray-900">Full Return</h3>
                  <p className="text-xs text-gray-500">Return all items on this invoice</p>
                </button>
                <button 
                  onClick={() => setReturnType('Partial')}
                  className={cn(
                    "flex-1 p-4 rounded-xl border-2 transition-all text-left",
                    returnType === 'Partial' ? "border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-200"
                  )}
                >
                  <ShoppingCart className={cn("mb-2", returnType === 'Partial' ? "text-rose-600" : "text-gray-300")} />
                  <h3 className="font-bold text-gray-900">Partial Return</h3>
                  <p className="text-xs text-gray-500">Select specific items to return</p>
                </button>
              </div>

              {returnType === 'Partial' && (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-sm text-gray-500 border-b border-gray-100">
                      <th className="pb-2 font-medium">Product</th>
                      <th className="pb-2 font-medium text-center">Supplied</th>
                      <th className="pb-2 font-medium text-center">Returning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {returnItems.map((item, idx) => {
                      const original = order.items.find(i => i.productId === item.productId);
                      return (
                        <tr key={idx}>
                          <td className="py-3 text-sm font-medium text-gray-900">{item.productName}</td>
                          <td className="py-3 text-sm text-center text-gray-500">{original?.quantity || 0}</td>
                          <td className="py-3 text-center">
                            <input 
                              type="number"
                              min="0"
                              max={original?.quantity || 0}
                              className="w-16 p-1 border border-gray-200 rounded text-center text-sm"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQty = parseInt(e.target.value) || 0;
                                setReturnItems(prev => prev.map((it, i) => 
                                  i === idx ? { ...it, quantity: newQty, total: newQty * it.price } : it
                                ));
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Return Value</p>
                <p className="text-xl font-bold text-rose-600">
                  {formatCurrency(returnType === 'Full' ? order.totalAmount : returnItems.reduce((sum, i) => sum + i.total, 0))}
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleReturn}
                  disabled={processing}
                  className="px-6 py-2 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Process Return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Supply Modal */}
      {showSupplyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-green-50">
              <h2 className="font-bold text-green-900 flex items-center gap-2">
                <CheckCircle2 size={20} />
                Process Item Supply
              </h2>
              <button onClick={() => setShowSupplyModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-700 uppercase mb-2">Supplied By (Staff Member)</label>
                <select 
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={suppliedByStaff}
                  onChange={(e) => setSuppliedByStaff(e.target.value)}
                >
                  <option value="">Select Staff Member</option>
                  {staffList.map(s => (
                    <option key={s.uid} value={s.displayName || s.email}>{s.displayName || s.email}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4 mb-6">
                <button 
                  onClick={() => setSupplyType('Full')}
                  className={cn(
                    "flex-1 p-4 rounded-xl border-2 transition-all text-left",
                    supplyType === 'Full' ? "border-green-500 bg-green-50" : "border-gray-100 hover:border-gray-200"
                  )}
                >
                  <CheckCircle2 className={cn("mb-2", supplyType === 'Full' ? "text-green-600" : "text-gray-300")} />
                  <h3 className="font-bold text-gray-900">Full Supply</h3>
                  <p className="text-xs text-gray-500">Supply all remaining items</p>
                </button>
                <button 
                  onClick={() => setSupplyType('Partial')}
                  className={cn(
                    "flex-1 p-4 rounded-xl border-2 transition-all text-left",
                    supplyType === 'Partial' ? "border-green-500 bg-green-50" : "border-gray-100 hover:border-gray-200"
                  )}
                >
                  <ShoppingCart className={cn("mb-2", supplyType === 'Partial' ? "text-green-600" : "text-gray-300")} />
                  <h3 className="font-bold text-gray-900">Partial Supply</h3>
                  <p className="text-xs text-gray-500">Select specific items to supply</p>
                </button>
              </div>

              {supplyType === 'Partial' && (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-sm text-gray-500 border-b border-gray-100">
                      <th className="pb-2 font-medium">Product</th>
                      <th className="pb-2 font-medium text-center">Remaining</th>
                      <th className="pb-2 font-medium text-center">Supplying</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {supplyItems.map((item, idx) => {
                      const original = order.items.find(i => i.productId === item.productId);
                      const remaining = (original?.quantity || 0) - (original?.suppliedQuantity || 0);
                      return (
                        <tr key={idx}>
                          <td className="py-3 text-sm font-medium text-gray-900">{item.productName}</td>
                          <td className="py-3 text-sm text-center text-gray-500">{remaining}</td>
                          <td className="py-3 text-center">
                            <input 
                              type="number"
                              min="0"
                              max={remaining}
                              className="w-16 p-1 border border-gray-200 rounded text-center text-sm"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQty = Math.min(parseInt(e.target.value) || 0, remaining);
                                setSupplyItems(prev => prev.map((it, i) => 
                                  i === idx ? { ...it, quantity: newQty, total: newQty * it.price } : it
                                ));
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Items to Supply</p>
                <p className="text-xl font-bold text-green-600">
                  {supplyType === 'Full' 
                    ? order.items.reduce((sum, i) => sum + (i.quantity - (i.suppliedQuantity || 0)), 0)
                    : supplyItems.reduce((sum, i) => sum + i.quantity, 0)} Units
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowSupplyModal(false)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSupply}
                  disabled={processing || !suppliedByStaff}
                  className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Confirm Supply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
