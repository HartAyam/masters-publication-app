/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AlertCircle, Key } from 'lucide-react';

import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import POS from '@/pages/POS';
import Inventory from '@/pages/Inventory';
import Expenses from '@/pages/Expenses';
import Admin from '@/pages/Admin';
import Unauthorized from '@/pages/Unauthorized';
import ClientsList from '@/pages/Clients/ClientsList';
import ClientDetails from '@/pages/Clients/ClientDetails';
import SuppliersList from '@/pages/Suppliers/SuppliersList';
import SupplierDetails from '@/pages/Suppliers/SupplierDetails';
import OrdersList from '@/pages/Orders/OrdersList';
import OrderDetails from '@/pages/Orders/OrderDetails';
import ProductDetails from '@/pages/Inventory/ProductDetails';
import PayrollList from '@/pages/Payroll/PayrollList';
import FinancialStatements from '@/pages/Financials/FinancialStatements';
import PaymentsList from '@/pages/Financials/PaymentsList';
import PaymentDetails from '@/pages/Financials/PaymentDetails';
import AuditLogsList from '@/pages/AuditLogs/AuditLogsList';
import BranchesList from '@/pages/Branches/BranchesList';
import BranchDetails from '@/pages/Branches/BranchDetails';
import StaffList from '@/pages/Staff/StaffList';
import StaffDetails from '@/pages/Staff/StaffDetails';
import InventoryReport from '@/pages/Reports/InventoryReport';

import SetupDemo from '@/pages/SetupDemo';

const SetupRequired = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-orange-100">
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-orange-100 rounded-full">
          <AlertCircle className="h-8 w-8 text-orange-600" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">Firebase Setup Required</h1>
      <p className="text-gray-600 text-center mb-8">
        To use the Masters Publications Platform, you need to configure your Firebase environment variables in the <strong>Secrets</strong> panel.
      </p>
      
      <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100 mb-8">
        <div className="flex items-start gap-3">
          <Key className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Required Variables:</p>
            <ul className="text-xs text-gray-500 mt-1 list-disc list-inside space-y-1">
              <li>VITE_FIREBASE_API_KEY</li>
              <li>VITE_FIREBASE_AUTH_DOMAIN</li>
              <li>VITE_FIREBASE_PROJECT_ID</li>
              <li>VITE_FIREBASE_STORAGE_BUCKET</li>
              <li>VITE_FIREBASE_MESSAGING_SENDER_ID</li>
              <li>VITE_FIREBASE_APP_ID</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500 text-center">
        <p>Once set, the application will automatically initialize.</p>
      </div>
    </div>
  </div>
);

import ErrorBoundary from '@/components/common/ErrorBoundary';

const AppRoutes = () => {
  const { isConfigured, error } = useAuth();

  if (!isConfigured) {
    return <SetupRequired />;
  }

  if (error) {
    const isPermissionError = error.includes('permission') || error.includes('insufficient');
    
    return (
      <div className={`min-h-screen ${isPermissionError ? 'bg-red-50' : 'bg-yellow-50'} flex items-center justify-center p-4`}>
        <div className={`max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 border ${isPermissionError ? 'border-red-100' : 'border-yellow-100'}`}>
          <div className="flex justify-center mb-6">
            <div className={`p-3 ${isPermissionError ? 'bg-red-100' : 'bg-yellow-100'} rounded-full`}>
              <AlertCircle className={`h-8 w-8 ${isPermissionError ? 'text-red-600' : 'text-yellow-600'}`} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">
            {isPermissionError ? 'Access Denied' : 'Account Error'}
          </h1>
          <p className="text-gray-600 text-center mb-6">
            {isPermissionError ? 'You do not have the necessary permissions to access this data. Please contact your administrator.' : error}
          </p>
          
          <div className="flex flex-col gap-3">
            {isPermissionError ? (
              <button
                onClick={() => window.location.href = '/'}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                Return to Dashboard
              </button>
            ) : (
              <button
                onClick={() => window.location.href = '/login'}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700"
              >
                Return to Login
              </button>
            )}
            
            {/* Allow logout to clear the bad state */}
             <button
                onClick={async () => {
                  try {
                    const { signOut } = await import('firebase/auth');
                    const { auth } = await import('@/lib/firebase');
                    if (auth) await signOut(auth);
                    window.location.reload();
                  } catch (e) {
                    console.error(e);
                    window.location.href = '/login';
                  }
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Sign Out
              </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/setup-demo" element={<SetupDemo />} />
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout><Dashboard /></Layout>} path="/" />
        <Route element={<Layout><Expenses /></Layout>} path="/expenses" />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['Cashier', 'Manager', 'Director', 'Admin']} />}>
        <Route element={<Layout><POS /></Layout>} path="/pos" />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['Cashier', 'Manager', 'Accountant', 'Director', 'Admin']} />}>
        <Route element={<Layout><OrdersList /></Layout>} path="/orders" />
        <Route element={<Layout><OrderDetails /></Layout>} path="/orders/:id" />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['Cashier', 'Manager', 'Accountant', 'Director', 'Admin']} />}>
        <Route element={<Layout><Inventory /></Layout>} path="/inventory" />
        <Route element={<Layout><ProductDetails /></Layout>} path="/inventory/:id" />
        <Route element={<Layout><InventoryReport /></Layout>} path="/reports/inventory" />
        <Route element={<Layout><PaymentsList /></Layout>} path="/payments" />
        <Route element={<Layout><PaymentDetails /></Layout>} path="/payments/:id" />
        <Route element={<Layout><ClientsList /></Layout>} path="/clients" />
        <Route element={<Layout><ClientDetails /></Layout>} path="/clients/:id" />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['Manager', 'Accountant', 'Director', 'Admin']} />}>
        <Route element={<Layout><SuppliersList /></Layout>} path="/suppliers" />
        <Route element={<Layout><SupplierDetails /></Layout>} path="/suppliers/:id" />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['Accountant', 'Director', 'Admin']} />}>
        <Route element={<Layout><PayrollList /></Layout>} path="/payroll" />
        <Route element={<Layout><FinancialStatements /></Layout>} path="/financials" />
        <Route element={<Layout><AuditLogsList /></Layout>} path="/audit-logs" />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['Cashier', 'Manager', 'Accountant', 'Director', 'Admin']} />}>
        <Route element={<Layout><BranchesList /></Layout>} path="/branches" />
        <Route element={<Layout><BranchDetails /></Layout>} path="/branches/:id" />
        <Route element={<Layout><StaffList /></Layout>} path="/staff" />
        <Route element={<Layout><StaffDetails /></Layout>} path="/staff/:id" />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
        <Route element={<Layout><Admin /></Layout>} path="/admin" />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
