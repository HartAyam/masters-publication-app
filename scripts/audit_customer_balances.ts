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

  const txs = txsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Auditing ${customersSnap.size} customers, ${txs.length} transactions, ${payments.length} payments...`);

  let mismatches = 0;
  const mismatchList: any[] = [];

  for (const cDoc of customersSnap.docs) {
    const cust = cDoc.data();
    const custId = cDoc.id;

    const custTxs = txs.filter((t: any) => t.customerId === custId);
    const custPayments = payments.filter((p: any) => p.customerId === custId);

    // Let's compute debt with two different models:
    // Model A: Active transactions (isBackup !== true), payments subtracted
    let debtActiveOnly = cust.openingBalance || 0;
    
    // Sort chronologically
    const allEvents = [
      ...custTxs.map((t: any) => ({
        ...t,
        isTx: true,
        time: t.date?.toMillis ? t.date.toMillis() : (t.date?.seconds ? t.date.seconds * 1000 : (t.date ? new Date(t.date).getTime() : 0))
      })),
      ...custPayments.map((p: any) => ({
        ...p,
        isPay: true,
        time: p.date?.toMillis ? p.date.toMillis() : (p.date?.seconds ? p.date.seconds * 1000 : (p.date ? new Date(p.date).getTime() : 0))
      }))
    ];
    allEvents.sort((a, b) => a.time - b.time);

    let runningDebtA = cust.openingBalance || 0;
    for (const ev of allEvents) {
      if (ev.isPay) {
        runningDebtA -= (ev.amount || 0);
      } else if (ev.isTx) {
        if (ev.isBackup || ev.referenceOnly) {
          continue; // skip backups
        }
        if (ev.status === 'Voided') {
          continue;
        }
        if (ev.type === 'Credit Sale') {
          runningDebtA += (ev.totalAmount || 0);
        } else if (ev.type === 'Stock Return') {
          runningDebtA -= (ev.totalAmount || 0);
        }
      }
    }

    // Compare with cust.totalDebt
    if (Math.abs((cust.totalDebt || 0) - runningDebtA) > 0.01) {
      mismatches++;
      mismatchList.push({
        id: custId,
        name: cust.name,
        storedDebt: cust.totalDebt,
        calculatedDebtA: runningDebtA,
        diff: (cust.totalDebt || 0) - runningDebtA,
        txCount: custTxs.length,
        paymentCount: custPayments.length
      });
    }
  }

  console.log(`Total mismatches: ${mismatches} out of ${customersSnap.size} customers.`);
  if (mismatches > 0) {
    console.log("Sample mismatches:", mismatchList.slice(0, 15));
  }

  process.exit(0);
}
run();
