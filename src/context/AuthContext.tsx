import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
import { UserProfile } from '@/types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  isConfigured: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  logout: async () => {},
  isConfigured: false,
  error: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setError(null);
      
      if (firebaseUser) {
        try {
          // Fetch user profile from Firestore to get role and branch
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          } else {
            // Handle case where auth exists but no firestore profile
            console.error("User profile not found in Firestore");
            setUserProfile(null);
            setError("User profile not found in Firestore. Please contact an administrator.");
          }
        } catch (err: any) {
          console.error("Error fetching user profile:", err);
          if (err.code === 'permission-denied') {
            setError('Missing or insufficient permissions. Please check your Firestore Security Rules.');
          } else {
            setError(err.message);
          }
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    if (auth) {
      localStorage.removeItem('lastActivity');
      await firebaseSignOut(auth);
    }
  };

  // Session Management: Auto-logout after 10 minutes of inactivity
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

    const updateActivity = () => {
      localStorage.setItem('lastActivity', Date.now().toString());
    };

    const checkInactivity = () => {
      const lastActivity = parseInt(localStorage.getItem('lastActivity') || '0');
      if (lastActivity && Date.now() - lastActivity > INACTIVITY_LIMIT) {
        // Clear activity and logout
        localStorage.removeItem('lastActivity');
        // Set a flag for the login page to show the expired message
        localStorage.setItem('sessionExpired', 'true');
        logout();
      }
    };

    // Initialize activity on login
    if (!localStorage.getItem('lastActivity')) {
      updateActivity();
    }

    // Listen for user interactions
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, updateActivity));

    // Check inactivity every 10 seconds
    const interval = setInterval(checkInactivity, 10000);

    return () => {
      events.forEach(event => window.removeEventListener(event, updateActivity));
      clearInterval(interval);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, logout, isConfigured: isFirebaseConfigured, error }}>
      {children}
    </AuthContext.Provider>
  );
};
