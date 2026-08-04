import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Payment, Customer, BranchModel } from '@/types';
import { 
  ArrowLeft, 
  Printer, 
  Download, 
  Calendar, 
  User, 
  CreditCard, 
  MapPin, 
  CheckCircle2,
  Clock,
  Building,
  Phone,
  ShoppingCart
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { printDiv } from '@/lib/exportUtils';
import { formatCurrency } from '@/lib/idUtils';

export default function PaymentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [branch, setBranch] = useState<BranchModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentTypeTotal, setPaymentTypeTotal] = useState(0);

  useEffect(() => {
    if (id) {
      fetchPayment(id);
    }
  }, [id]);

  const fetchPayment = async (paymentId: string) => {
    setLoading(true);
    try {
      const docRef = doc(db, 'payments', paymentId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const paymentData = { id: docSnap.id, ...docSnap.data() } as Payment;
        setPayment(paymentData);

        // Fetch Customer
        if (paymentData.customerId) {
          const custSnap = await getDoc(doc(db, 'customers', paymentData.customerId));
          if (custSnap.exists()) {
            setCustomer({ id: custSnap.id, ...custSnap.data() } as Customer);
          }
        }

        // Fetch Branch
        if (paymentData.branchId) {
          const branchRef = doc(db, 'branches', paymentData.branchId);
          const branchSnap = await getDoc(branchRef);
          if (branchSnap.exists()) {
            setBranch({ id: branchSnap.id, ...branchSnap.data() } as BranchModel);
          } else {
            const branchQ = query(collection(db, 'branches'), where('name', '==', paymentData.branchId));
            const branchSnapshot = await getDocs(branchQ);
            if (!branchSnapshot.empty) {
              setBranch({ id: branchSnapshot.docs[0].id, ...branchSnapshot.docs[0].data() as any } as BranchModel);
            }
          }
        }

        // Fetch total for this payment type today
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const paymentsQ = query(
          collection(db, 'payments'), 
          where('date', '>=', Timestamp.fromDate(start)),
          where('date', '<=', Timestamp.fromDate(end))
        );
        const paymentsSnapshot = await getDocs(paymentsQ);
        const total = paymentsSnapshot.docs
          .filter(doc => doc.data().paymentMethod === paymentData.paymentMethod)
          .reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
        setPaymentTypeTotal(total);
      } else {
        console.log("No such document!");
      }
    } catch (error) {
      console.error("Error fetching payment:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Payment not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-blue-600 hover:underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex flex-col">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Daily {payment.paymentMethod} Total</p>
            <p className="text-sm font-bold text-blue-600">{formatCurrency(paymentTypeTotal)}</p>
          </div>
        </div>
        <div className="flex gap-3">
          {payment.orderId && (
            <button 
              onClick={() => navigate(`/orders/${payment.orderId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <ShoppingCart size={18} />
              View Order
            </button>
          )}
          <button 
            onClick={() => printDiv('payment-receipt', `Receipt_${payment.id}`)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print Receipt
          </button>
        </div>
      </div>

      <div id="payment-receipt" className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.05] z-0">
          <img src="/logo.png" alt="" className="w-1/2 object-contain" />
        </div>

        {/* Header */}
        <div className="p-4 border-b border-gray-100 relative z-10">
          <div className="flex flex-col items-center text-center mb-4">
            <img src="/logo.png" alt="Logo" className="h-20 w-20 object-contain mb-2" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <h1 className="text-2xl font-black text-gray-900 tracking-tighter">MASTERS PUBLICATION</h1>
            <p className="text-base font-bold text-gray-700">{branch?.name || payment.branchId} Branch</p>
            <p className="text-xs text-gray-500">{branch?.location || 'Ghana'}</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {branch?.contactPhone && <span><span className="font-bold">Tel:</span> {branch.contactPhone}</span>}
              {branch?.momoNumber && <span><span className="font-bold">MoMo:</span> {branch.momoNumber}</span>}
            </div>
            <p className="text-xs text-gray-500">kwamentimmasters@gmail.com</p>
          </div>

          <div className="flex flex-col items-center text-center mb-6">
            <h2 className="text-lg font-black uppercase tracking-[0.2em] text-gray-900 border-b-2 border-gray-900 px-6 pb-0.5 mb-1">
              Payment Receipt
            </h2>
            <p className="text-xs font-mono text-gray-500">#{payment.id}</p>
            <p className="text-xs text-gray-900 mt-0.5 uppercase tracking-widest font-bold">
              Date: {payment.date?.toDate ? format(payment.date.toDate(), 'dd MMM yyyy, HH:mm') : 'N/A'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Received From:</h3>
                <div className="space-y-0.5">
                  <p className="text-base font-bold text-gray-900">{payment.customerName}</p>
                  <p className="text-xs text-gray-600">{customer?.address || 'N/A'}</p>
                  <p className="text-xs text-gray-600">{customer?.phone || 'N/A'}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-right">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Payment Details:</h3>
                <div className="space-y-0.5 text-xs">
                  <p className="text-gray-600"><span className="font-bold text-gray-900">Method:</span> {payment.paymentMethod}</p>
                  {payment.accountNumber && (
                    <p className="text-gray-600"><span className="font-bold text-gray-900">Acc No:</span> {payment.accountNumber}</p>
                  )}
                  <p className="text-gray-600"><span className="font-bold text-gray-900">Received By:</span> {payment.receivedBy}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-6">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-gray-900 text-[10px] font-black uppercase tracking-widest text-gray-900">
                  <th className="py-2 px-4">Description</th>
                  <th className="py-2 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="text-xs">
                  <td className="py-2 px-4 font-medium text-gray-900">Payment Received</td>
                  <td className="py-2 px-4 text-right font-bold text-gray-900">{formatCurrency(payment.amount)}</td>
                </tr>
              </tbody>
              <tfoot className="border-t-2 border-gray-900 bg-white">
                <tr>
                  <td className="py-2 px-4 text-right text-xs font-black uppercase tracking-widest text-gray-900">Total Amount</td>
                  <td className="py-2 px-4 text-right text-base font-black text-gray-900">{formatCurrency(payment.amount)}</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-1 px-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest">Previous Debt</td>
                  <td className="py-1 px-4 text-right text-xs font-bold text-gray-700">{formatCurrency(payment.previousDebt)}</td>
                </tr>
                <tr className="bg-gray-900 text-white">
                  <td className="py-2 px-4 text-right text-xs font-black uppercase tracking-widest">New Balance</td>
                  <td className="py-2 px-4 text-right text-base font-black">{formatCurrency(payment.newDebt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {payment.notes && (
            <div className="mb-6 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Notes</h3>
              <p className="text-xs text-gray-600">{payment.notes}</p>
            </div>
          )}

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
    </div>
  );
}
