import { db } from './firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

export async function runInvoiceMigration() {
  if (!db) {
    console.warn("Migration skipped: Firestore db is not initialized.");
    return;
  }
  
  if (localStorage.getItem('masters_publications_invoice_migration_v2') === 'completed') {
    return;
  }
  
  console.log("Starting invoice migration v2...");
  try {
    // 1. Fetch all customers
    const customersSnap = await getDocs(collection(db, 'customers'));
    const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    
    // 2. Fetch all payments
    const paymentsSnap = await getDocs(collection(db, 'payments'));
    const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, isPayment: true }));
    
    // 3. Fetch all transactions
    const txsSnap = await getDocs(collection(db, 'transactions'));
    const transactions = txsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, isTransaction: true }));
    
    let updatedCount = 0;
    
    for (const customer of customers) {
      // Find all transactions and payments for this customer
      const custTxs = transactions.filter(t => t.customerId === customer.id);
      const custPayments = payments.filter(p => p.customerId === customer.id);
      
      // Combine and sort chronologically by date
      const events = [
        ...custTxs.map(t => ({
          ...t,
          sortDate: t.date?.toDate ? t.date.toDate() : (t.date?.seconds ? new Date(t.date.seconds * 1000) : (t.date ? new Date(t.date) : new Date(0)))
        })),
        ...custPayments.map(p => ({
          ...p,
          sortDate: p.date?.toDate ? p.date.toDate() : (p.date?.seconds ? new Date(p.date.seconds * 1000) : (p.date ? new Date(p.date) : new Date(0)))
        }))
      ];
      
      events.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
      
      let runningDebt = customer.openingBalance || 0;
      
      for (const event of events) {
        if (event.isPayment) {
          runningDebt -= event.amount;
        } else if (event.isTransaction) {
          const previousBalance = -runningDebt;
          let balanceDue = event.balanceDue;
          
          if (event.type === 'Credit Sale') {
            balanceDue = event.totalAmount - previousBalance;
          }
          
          // Only update if previousBalance is missing or balanceDue is different
          if (event.previousBalance === undefined || event.balanceDue !== balanceDue) {
            const txRef = doc(db, 'transactions', event.id);
            await updateDoc(txRef, {
              previousBalance,
              balanceDue
            });
            updatedCount++;
          }
          
          if (event.status !== 'Voided' && event.status !== 'Returned') {
            if (event.type === 'Credit Sale') {
              runningDebt += event.totalAmount;
            } else if (event.type === 'Stock Return') {
              runningDebt -= event.totalAmount;
            }
          }
        }
      }
    }
    
    console.log(`Invoice migration v2 completed successfully! Updated ${updatedCount} transactions.`);
    localStorage.setItem('masters_publications_invoice_migration_v2', 'completed');
  } catch (error) {
    console.error("Error during invoice migration v2:", error);
  }
}
