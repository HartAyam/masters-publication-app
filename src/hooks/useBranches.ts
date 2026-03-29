import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BranchModel } from '@/types';

export function useBranches() {
  const [branches, setBranches] = useState<BranchModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'branches'), orderBy('name', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const branchData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BranchModel[];
      setBranches(branchData);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching branches:", err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { branches, loading, error };
}
