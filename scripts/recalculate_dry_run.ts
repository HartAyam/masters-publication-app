import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const customersSnap = await db.collection("customers").get();
  const txsSnap = await db.collection("transactions").get();
  const paymentsSnap = await db.collection("payments").get();

  const transactions = txsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
  const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, isPayment: true }));

  console.log(`Auditing and simulating balance recalculation for ${customersSnap.size} customers...`);

  let customerUpdates = 0;
  let txUpdates = 0;
  const changedCustomers: any[] = [];

  for (const cDoc of customersSnap.docs) {
    const customer = { id: cDoc.id, ...cDoc.data() as any };
    
    // Find all transactions and payments for this customer
    const custTxs = transactions.filter(t => t.customerId === customer.id);
    const custPayments = payments.filter(p => p.customerId === customer.id);

    // Combine and sort chronologically by date
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
        // Backups / reference-only records do not affect customer balance
        if (event.isBackup || event.referenceOnly) {
          continue;
        }

        // Voided orders do not affect customer balance
        if (event.status === 'Voided') {
          continue;
        }

        if (event.type === 'Credit Sale') {
          const previousBalance = -runningDebt;
          const balanceDue = event.totalAmount - previousBalance;
          if (event.previousBalance !== previousBalance || event.balanceDue !== balanceDue) {
            txUpdates++;
          }
          runningDebt += event.totalAmount;
        } else if (event.type === 'Stock Return') {
          // Check if this stock return is for a Credit Sale or Cash Sale
          // If amountPaid < 0 and type was Cash Sale, cash was refunded directly
          // But if it was against a Credit Sale, it reduces running debt
          if (event.amountPaid === 0 || !event.amountPaid) {
            runningDebt -= event.totalAmount;
          } else if (event.originalTransactionId) {
            const orig = transactions.find(t => t.id === event.originalTransactionId);
            if (orig && orig.type === 'Credit Sale') {
              runningDebt -= event.totalAmount;
            }
          }
        }
      }
    }

    if (Math.abs((customer.totalDebt || 0) - runningDebt) > 0.01) {
      customerUpdates++;
      changedCustomers.push({
        id: customer.id,
        name: customer.name,
        oldDebt: customer.totalDebt,
        newDebt: runningDebt,
        diff: (customer.totalDebt || 0) - runningDebt
      });
    }
  }

  console.log({
    totalCustomers: customersSnap.size,
    customersNeedingUpdate: customerUpdates,
    transactionsNeedingUpdate: txUpdates,
    sampleChangedCustomers: changedCustomers.slice(0, 10)
  });

  process.exit(0);
}
run();
