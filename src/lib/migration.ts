import { db } from './firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

export async function runInvoiceMigration() {
  if (!db) {
    console.warn("Migration skipped: Firestore db is not initialized.");
    return;
  }
  
  if (localStorage.getItem('masters_publications_invoice_migration_v4') === 'completed') {
    return;
  }
  
  console.log("Starting invoice migration v4 (Synchronizing adjusted orders, archived originals, and customer balances)...");
  try {
    const customersSnap = await getDocs(collection(db, 'customers'));
    const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    
    const paymentsSnap = await getDocs(collection(db, 'payments'));
    const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, isPayment: true }));
    
    const txsSnap = await getDocs(collection(db, 'transactions'));
    const transactions = txsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, isTransaction: true }));
    
    let updatedCount = 0;
    
    // Ensure backups and active adjusted orders have correct metadata
    for (const tx of transactions) {
      if (tx.isBackup || (tx.originalTransactionId && tx.status === 'Adjusted')) {
        if (tx.status === 'Adjusted' || !tx.referenceOnly || !tx.isBackup || tx.balanceDue !== 0) {
          const txRef = doc(db, 'transactions', tx.id);
          await updateDoc(txRef, {
            isBackup: true,
            referenceOnly: true,
            balanceDue: 0,
            status: 'Original (Archived)'
          });
          tx.isBackup = true;
          tx.referenceOnly = true;
          tx.balanceDue = 0;
          tx.status = 'Original (Archived)';
          updatedCount++;
        }
      }

      if (!tx.isBackup && !tx.referenceOnly) {
        const hasBackups = transactions.some(t => t.originalTransactionId === tx.id && (t.isBackup || t.status === 'Original (Archived)'));
        if (hasBackups && !tx.isAdjusted) {
          const txRef = doc(db, 'transactions', tx.id);
          await updateDoc(txRef, { isAdjusted: true });
          tx.isAdjusted = true;
          updatedCount++;
        }
      }
    }
    
    for (const customer of customers) {
      const custTxs = transactions.filter(t => t.customerId === customer.id);
      const custPayments = payments.filter(p => p.customerId === customer.id);
      
      const events = [
        ...custTxs.map(t => ({
          ...t,
          isTx: true,
          sortDate: t.date?.toDate ? t.date.toDate() : (t.date?.seconds ? new Date(t.date.seconds * 1000) : (t.date ? new Date(t.date) : new Date(0)))
        })),
        ...custPayments.map(p => ({
          ...p,
          isPayment: true,
          sortDate: p.date?.toDate ? p.date.toDate() : (p.date?.seconds ? new Date(p.date.seconds * 1000) : (p.date ? new Date(p.date) : new Date(0)))
        }))
      ];
      
      events.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
      
      let runningDebt = customer.openingBalance || 0;
      
      for (const event of events) {
        if (event.isPayment) {
          runningDebt -= (event.amount || 0);
        } else if (event.isTx) {
          if (event.isBackup || event.referenceOnly || event.status === 'Voided') {
            continue;
          }

          if (event.type === 'Credit Sale') {
            const previousBalance = -runningDebt;
            const balanceDue = event.totalAmount - previousBalance;
            
            if (event.previousBalance !== previousBalance || event.balanceDue !== balanceDue) {
              const txRef = doc(db, 'transactions', event.id);
              await updateDoc(txRef, {
                previousBalance,
                balanceDue
              });
              updatedCount++;
            }
            
            runningDebt += event.totalAmount;
          } else if (event.type === 'Stock Return') {
            let isCreditSaleReturn = true;
            if (event.originalTransactionId) {
              const orig = transactions.find(t => t.id === event.originalTransactionId);
              if (orig && orig.type === 'Cash Sale') {
                isCreditSaleReturn = false;
              }
            }
            if (isCreditSaleReturn) {
              runningDebt -= (event.totalAmount || 0);
            }
          }
        }
      }

      if (Math.abs((customer.totalDebt || 0) - runningDebt) > 0.01) {
        console.log(`Fixing customer balance for ${customer.name || customer.id}: was ${customer.totalDebt}, now ${runningDebt}`);
        const customerRef = doc(db, 'customers', customer.id);
        await updateDoc(customerRef, {
          totalDebt: runningDebt
        });
      }
    }
    
    console.log(`Invoice migration v4 completed successfully! Updated ${updatedCount} records.`);
    localStorage.setItem('masters_publications_invoice_migration_v4', 'completed');
  } catch (error) {
    console.error("Error during invoice migration v4:", error);
  }
}
