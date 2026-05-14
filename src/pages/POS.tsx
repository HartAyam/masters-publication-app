import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, setDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, increment } from 'firebase/firestore';
import { Product, SaleItem, Customer, UserProfile, BranchModel, Staff } from '@/types/index';
import { Plus, Trash2, Search, UserPlus, User, ChevronDown } from 'lucide-react';
import { cn, isGlobalUser } from '@/lib/utils';
import { logActivity } from '@/services/audit';
import { generateInvoiceId, formatCurrency } from '@/lib/idUtils';

export default function POS() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [transactionType, setTransactionType] = useState<'Cash Sale' | 'Credit Sale' | 'Deposit'>('Cash Sale');
  
  // Customer State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  // Payment & Staff State
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'MoMo' | 'Bank Transfer' | ''>('Cash');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [suppliedBy, setSuppliedBy] = useState('');
  const [currentBranch, setCurrentBranch] = useState<BranchModel | null>(null);
  const [discount, setDiscount] = useState<number>(0);
  
  const [loading, setLoading] = useState(false);

  // Fetch products, customers, and staff for the user's branch
  useEffect(() => {
    if (!userProfile) return;
    
    const fetchData = async () => {
      const isGlobal = isGlobalUser(userProfile.role);
      
      // Products Query
      let prodQ;
      if (isGlobal) {
         prodQ = query(collection(db, 'products'));
      } else {
         prodQ = query(collection(db, 'products'), where('branchId', '==', userProfile.branchId));
      }
      
      const prodSnapshot = await getDocs(prodQ);
      setProducts(prodSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any } as Product)));

      // Customers Query
      let custQ;
      if (isGlobal) {
        custQ = query(collection(db, 'customers'));
      } else {
        custQ = query(collection(db, 'customers'), where('primaryBranch', '==', userProfile.branchId));
      }
      const custSnapshot = await getDocs(custQ);
      setCustomers(custSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any } as Customer)));

      // Staff Query (Supplied By)
      let staffQ;
      if (userProfile.branchId) {
        staffQ = query(collection(db, 'staff'), where('branchId', '==', userProfile.branchId));
      } else {
        staffQ = query(collection(db, 'staff'));
      }
      const staffSnapshot = await getDocs(staffQ);
      setStaff(staffSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any } as Staff)));

      // Branch Info
      if (!isGlobal && userProfile.branchId) {
        // Try to find by document ID first
        try {
          const { getDoc } = await import('firebase/firestore');
          const branchDoc = await getDoc(doc(db, 'branches', userProfile.branchId));
          
          if (branchDoc.exists()) {
            setCurrentBranch({ id: branchDoc.id, ...branchDoc.data() as any } as BranchModel);
          } else {
            // Fallback for legacy data where branchId might be the name
            const branchNameQ = query(collection(db, 'branches'), where('name', '==', userProfile.branchId));
            const branchSnapshot = await getDocs(branchNameQ);
            if (!branchSnapshot.empty) {
              setCurrentBranch({ id: branchSnapshot.docs[0].id, ...branchSnapshot.docs[0].data() as any } as BranchModel);
            }
          }
        } catch (e) {
          console.error("Error fetching branch:", e);
        }
      }
    };
    fetchData();
  }, [userProfile]);

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      if (existing.quantity + 1 > product.stockLevel) {
        alert("Not enough stock!");
        return;
      }
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
          : item
      ));
    } else {
      if (product.stockLevel < 1) {
        alert("Out of stock!");
        return;
      }
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price,
        total: product.price
      }]);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: string, quantityStr: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (quantityStr === '') {
      setCart(cart.map(item => 
        item.productId === productId 
          ? { ...item, quantity: 0, total: 0 }
          : item
      ));
      return;
    }

    const quantity = parseInt(quantityStr);
    if (isNaN(quantity)) return;

    if (quantity > product.stockLevel) {
      alert("Not enough stock!");
      return;
    }

    setCart(cart.map(item => 
      item.productId === productId 
        ? { ...item, quantity: quantity, total: quantity * item.price }
        : item
    ));
  };

  const calculateTotal = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = (discount / 100) * subtotal;
    return subtotal - discountAmount;
  };

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + item.total, 0);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        name: newCustomerName,
        phone: newCustomerPhone,
        address: newCustomerAddress,
        type: 'Individual',
        primaryBranch: userProfile.branchId,
        totalDebt: 0,
        createdAt: serverTimestamp()
      });
      
      const newCustomer: Customer = {
        id: docRef.id,
        name: newCustomerName,
        phone: newCustomerPhone,
        address: newCustomerAddress,
        type: 'Individual',
        primaryBranch: userProfile.branchId,
        totalDebt: 0,
        createdAt: new Date()
      };
      
      setCustomers([...customers, newCustomer]);
      setSelectedCustomer(newCustomer);
      setShowAddCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerAddress('');
    } catch (error) {
      console.error("Error creating customer:", error);
      alert("Failed to create customer");
    }
  };

  const handleCheckout = async () => {
    if (!userProfile || cart.length === 0) return;
    
    // Validation
    if (!selectedCustomer) {
      alert("Please select a customer. Walk-in customers are not allowed.");
      return;
    }

    if (!suppliedBy && transactionType !== 'Deposit') {
      alert("Please select who supplied the items.");
      return;
    }

    if (transactionType !== 'Credit Sale' && transactionType !== 'Deposit' && !paymentMethod) {
      alert("Please select a payment method.");
      return;
    }

    if (transactionType !== 'Credit Sale' && (paymentMethod === 'MoMo' || paymentMethod === 'Bank Transfer') && (!accountNumber || !bankName)) {
      alert("Please provide Account Number and Bank Name for this payment method.");
      return;
    }

    setLoading(true);

    try {
      const totalAmount = calculateTotal();
      const subtotal = calculateSubtotal();
      
      // Determine Status and Payment
      let status = 'Completed';
      let amountPaid = totalAmount;
      let balanceDue = 0;

      if (transactionType === 'Credit Sale') {
        status = 'Pending Payment';
        amountPaid = 0;
        balanceDue = totalAmount;
      } else if (transactionType === 'Deposit') {
        status = 'Pending Delivery';
        // For deposit, we assume full payment for now, but stock is reserved
        amountPaid = totalAmount; 
        balanceDue = 0;
      }

      // 1. Create Transaction Record
      const invoiceId = await generateInvoiceId(transactionType, userProfile.branchId);
      
      const transactionData = {
        id: invoiceId,
        type: transactionType,
        items: cart.filter(i => i.quantity > 0),
        totalAmount,
        discount,
        amountPaid,
        balanceDue,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || '',
        status,
        date: serverTimestamp(),
        cashierId: userProfile.uid,
        preparedBy: userProfile.displayName || userProfile.email,
        suppliedBy: suppliedBy,
        branchId: userProfile.branchId,
        paymentMethod,
        accountNumber: (paymentMethod === 'MoMo' || paymentMethod === 'Bank Transfer') ? accountNumber : null,
        bankName: (paymentMethod === 'MoMo' || paymentMethod === 'Bank Transfer') ? bankName : null,
      };

      await setDoc(doc(db, 'transactions', invoiceId), transactionData);

      // 2. Update Customer Debt (if Credit Sale)
      if (transactionType === 'Credit Sale' && selectedCustomer) {
        const customerRef = doc(db, 'customers', selectedCustomer.id);
        await updateDoc(customerRef, {
          totalDebt: increment(totalAmount)
        });
      }

      // 3. Log Activity
      await logActivity(
        `New ${transactionType}`,
        `Amount: ${formatCurrency(totalAmount)} by ${userProfile.email}`,
        userProfile.uid,
        userProfile.role,
        userProfile.branchId,
        userProfile.displayName,
        userProfile.email
      );

      // 4. Update Stock
      for (const item of cart) {
        // Only deduct stock for Cash and Credit sales (immediate delivery)
        // Deposits will have stock deducted when supplied
        if (transactionType !== 'Deposit') {
          const productRef = doc(db, 'products', item.productId);
          const quantityChange = -item.quantity;
          
          await updateDoc(productRef, {
            stockLevel: increment(quantityChange)
          });
        }
      }

      // Reset
      setCart([]);
      setSelectedCustomer(null);
      setTransactionType('Cash Sale');
      setPaymentMethod('Cash');
      setAccountNumber('');
      setBankName('');
      setSuppliedBy('');
      setDiscount(0);
      
      // Refresh products (simple re-fetch)
      const q = isGlobalUser(userProfile.role) 
        ? query(collection(db, 'products'))
        : query(collection(db, 'products'), where('branchId', '==', userProfile.branchId));
      const querySnapshot = await getDocs(q);
      setProducts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any } as Product)));

      alert('Transaction Completed!');
      navigate(`/orders/${invoiceId}`);
    } catch (error) {
      console.error("Transaction failed:", error);
      alert('Transaction Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-100px)]">
      {/* Product Selection */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search products..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto">
          {products.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">
              <p>No products found. (Add products in Inventory)</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {products
                .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                >
                  <h3 className="font-medium text-gray-900">{product.name}</h3>
                  <p className="text-sm text-gray-500">{formatCurrency(product.price)}</p>
                  <p className={cn("text-xs mt-1", product.stockLevel < 1 ? "text-red-500" : "text-gray-400")}>
                    Stock: {product.stockLevel}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart & Checkout */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl">
          <h2 className="font-bold text-lg text-gray-900">Current Sale</h2>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {cart.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">Cart is empty</p>
          )}
          {cart.map((item, index) => (
            <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-sm">{item.productName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <input 
                    type="number"
                    className="w-16 p-1 text-xs border border-gray-200 rounded"
                    value={item.quantity === 0 ? '' : item.quantity}
                    onChange={(e) => updateQuantity(item.productId, e.target.value)}
                  />
                  <span className="text-xs text-gray-500">x {formatCurrency(item.price)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm">{formatCurrency(item.total)}</span>
                <button 
                  onClick={() => removeFromCart(item.productId)}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 space-y-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 uppercase">Transaction Type</label>
                <select 
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={transactionType}
                  onChange={(e: any) => {
                    const type = e.target.value;
                    setTransactionType(type);
                    if (type === 'Credit Sale') setPaymentMethod('');
                    else if (paymentMethod === '') setPaymentMethod('Cash');
                  }}
                >
                  <option value="Cash Sale">Cash Sale</option>
                  <option value="Credit Sale">Credit Sale</option>
                  <option value="Deposit">Deposit</option>
                </select>
              </div>
              {transactionType !== 'Credit Sale' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-700 uppercase">Payment Method</label>
                  <select 
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="MoMo">MoMo</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
              )}
            </div>

            {(paymentMethod === 'MoMo' || paymentMethod === 'Bank Transfer') && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">Account Number</label>
                  <input 
                    type="text"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="Enter number"
                    value={accountNumber}
                    onChange={e => setAccountNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">Bank/Provider</label>
                  <input 
                    type="text"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="e.g. MTN, GCB"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700 uppercase">Supplied By</label>
              <select 
                className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                value={suppliedBy}
                onChange={(e) => setSuppliedBy(e.target.value)}
              >
                <option value="">Select Staff Member</option>
                {staff.map(s => (
                  <option key={s.id} value={s.displayName || s.email}>{s.displayName || s.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Customer Selection */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-medium text-gray-700 uppercase">Customer</label>
              <button 
                onClick={() => setShowAddCustomer(!showAddCustomer)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <UserPlus size={12} /> New
              </button>
            </div>
            
            {showAddCustomer ? (
              <div className="bg-gray-50 p-3 rounded-lg space-y-2 border border-gray-200">
                <input
                  type="text"
                  placeholder="Name"
                  className="w-full p-2 text-sm border border-gray-200 rounded"
                  value={newCustomerName}
                  onChange={e => setNewCustomerName(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Phone"
                  className="w-full p-2 text-sm border border-gray-200 rounded"
                  value={newCustomerPhone}
                  onChange={e => setNewCustomerPhone(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Address"
                  className="w-full p-2 text-sm border border-gray-200 rounded"
                  value={newCustomerAddress}
                  onChange={e => setNewCustomerAddress(e.target.value)}
                />
                <div className="flex gap-2">
                  <button 
                    onClick={handleCreateCustomer}
                    disabled={!newCustomerName}
                    className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button 
                    onClick={() => setShowAddCustomer(false)}
                    className="flex-1 bg-gray-200 text-gray-700 text-xs py-1.5 rounded hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                  className="w-full flex items-center justify-between p-2 border border-gray-200 rounded-lg text-sm bg-white hover:border-gray-300 transition-colors"
                >
                  <span className={cn(selectedCustomer ? "text-gray-900" : "text-gray-400")}>
                    {selectedCustomer ? selectedCustomer.name : "Select Customer (Required)"}
                  </span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>

                {showCustomerDropdown && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-2 border-b border-gray-100">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input 
                          type="text"
                          placeholder="Search customer..."
                          className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={customerSearchTerm}
                          onChange={(e) => setCustomerSearchTerm(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {customers
                        .filter(c => c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()))
                        .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setShowCustomerDropdown(false);
                            setCustomerSearchTerm('');
                          }}
                          className="w-full text-left p-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <p className="font-medium text-gray-900">{c.name}</p>
                          <p className="text-[10px] text-gray-500">
                            {c.phone} {c.totalDebt > 0 ? `• Debt: ${formatCurrency(c.totalDebt)}` : ''}
                          </p>
                        </button>
                      ))}
                      {customers.filter(c => c.name.toLowerCase().includes(customerSearchTerm.toLowerCase())).length === 0 && (
                        <p className="p-4 text-center text-xs text-gray-500">No customers found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-lg font-medium text-gray-900">{formatCurrency(calculateSubtotal())}</span>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 uppercase mb-1">Discount (%)</label>
              <input 
                type="number"
                min="0"
                max="100"
                className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                placeholder="0"
                value={discount === 0 ? '' : discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>
            <div className="text-right">
              <span className="text-gray-500 block text-xs uppercase font-medium mb-1">Total</span>
              <span className="text-2xl font-bold text-gray-900">{formatCurrency(calculateTotal())}</span>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || !selectedCustomer || loading}
            className={cn(
              "w-full py-3 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700"
            )}
          >
            {loading ? 'Processing...' : 'Complete Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
