import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Payment } from '@/types';
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
  Building
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { printDiv } from '@/lib/exportUtils';
import { formatCurrency } from '@/lib/idUtils';

export default function PaymentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

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
        setPayment({ id: docSnap.id, ...docSnap.data() } as Payment);
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
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <div className="flex gap-3">
          <button 
            onClick={() => printDiv('payment-receipt', `Receipt_${payment.id}`)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print Receipt
          </button>
        </div>
      </div>

      <div id="payment-receipt" className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="p-8 border-b border-gray-100">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="flex items-center gap-3 mb-2">
              <img src="/logo.png" alt="Logo" className="h-12 w-12 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
              <h1 className="text-3xl font-black text-gray-900 tracking-tighter">MASTERS PUBLICATION</h1>
            </div>
            <p className="text-lg font-bold text-gray-700">{payment.branchId} Branch</p>
            <p className="text-sm text-gray-500">kwamentimmasters@gmail.com</p>
          </div>

          <div className="flex flex-col items-center text-center mb-10">
            <h2 className="text-xl font-black uppercase tracking-[0.2em] text-gray-900 border-b-2 border-gray-900 px-8 pb-1 mb-2">
              Payment Receipt
            </h2>
            <p className="text-sm font-mono text-gray-500">#{payment.id}</p>
            <p className="text-sm text-gray-900 mt-1 uppercase tracking-widest font-bold">
              Date: {payment.date?.toDate ? format(payment.date.toDate(), 'dd MMM yyyy, HH:mm') : 'N/A'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-12 mb-10">
            <div className="space-y-4">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Received From:</h3>
                <div className="space-y-1">
                  <p className="text-lg font-bold text-gray-900">{payment.customerName}</p>
                  <p className="text-sm text-gray-600">ID: {payment.customerId}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 text-right">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Payment Details:</h3>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-600"><span className="font-bold text-gray-900">Method:</span> {payment.paymentMethod}</p>
                  <p className="text-gray-600"><span className="font-bold text-gray-900">Received By:</span> {payment.receivedBy}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-8">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-gray-900 text-[10px] font-black uppercase tracking-widest text-gray-900">
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="text-sm">
                  <td className="py-4 px-4 font-medium text-gray-900">Payment Received</td>
                  <td className="py-4 px-4 text-right font-bold text-gray-900">{formatCurrency(payment.amount)}</td>
                </tr>
              </tbody>
              <tfoot className="border-t-2 border-gray-900 bg-white">
                <tr>
                  <td className="py-4 px-4 text-right text-sm font-black uppercase tracking-widest text-gray-900">Total Amount</td>
                  <td className="py-4 px-4 text-right text-lg font-black text-gray-900">{formatCurrency(payment.amount)}</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-2 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-widest">Previous Debt</td>
                  <td className="py-2 px-4 text-right text-sm font-bold text-gray-700">{formatCurrency(payment.previousDebt)}</td>
                </tr>
                <tr className="bg-gray-900 text-white">
                  <td className="py-3 px-4 text-right text-sm font-black uppercase tracking-widest">New Balance</td>
                  <td className="py-3 px-4 text-right text-lg font-black">{formatCurrency(payment.newDebt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {payment.notes && (
            <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{payment.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-8 mt-20">
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
