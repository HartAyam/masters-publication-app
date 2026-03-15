import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';

export default function Unauthorized() {
  const { userProfile } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <h1 className="text-4xl font-bold text-red-600 mb-4">Access Denied</h1>
      <p className="text-gray-600 mb-8 text-center max-w-md">
        You do not have permission to view this page. 
        Your current role is <span className="font-bold">{userProfile?.role}</span>.
      </p>
      <Link to="/" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
        Return to Dashboard
      </Link>
    </div>
  );
}
