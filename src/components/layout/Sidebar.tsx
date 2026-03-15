import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  FileText, 
  Users, 
  LogOut, 
  Menu,
  X,
  Truck,
  UserCheck,
  ClipboardList,
  DollarSign,
  TrendingUp,
  ShieldAlert,
  MapPin,
  Settings,
  CreditCard
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sidebar = () => {
  const { userProfile, logout } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false); // Mobile drawer
  const [isCollapsed, setIsCollapsed] = React.useState(false); // Desktop collapse

  const toggleMobileSidebar = () => setIsOpen(!isOpen);
  const toggleDesktopSidebar = () => setIsCollapsed(!isCollapsed);

  if (!userProfile) return null;

  const links = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'POS', href: '/pos', icon: ShoppingCart, roles: ['Cashier', 'Manager', 'Director', 'Admin'] },
    { name: 'Orders', href: '/orders', icon: ClipboardList, roles: ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Payments', href: '/payments', icon: CreditCard, roles: ['Cashier','Accountant', 'Director', 'Admin'] },
    { name: 'Expenses', href: '/expenses', icon: FileText, roles: ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Inventory', href: '/inventory', icon: Package, roles: ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Clients', href: '/clients', icon: UserCheck, roles: ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Staff', href: '/staff', icon: Users, roles: ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Branches', href: '/branches', icon: MapPin, roles: ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Suppliers', href: '/suppliers', icon: Truck, roles: ['Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Payroll', href: '/payroll', icon: DollarSign, roles: ['Accountant', 'Director', 'Admin'] },
    { name: 'Financials', href: '/financials', icon: TrendingUp, roles: ['Accountant', 'Director', 'Admin'] },
    { name: 'Audit Logs', href: '/audit-logs', icon: ShieldAlert, roles: ['Accountant', 'Director', 'Admin'] },
    { name: 'Admin', href: '/admin', icon: Settings, roles: ['Director','Admin'] },
  ];

  const filteredLinks = links.filter(link => link.roles.includes(userProfile.role));

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu Button */}
      {!isOpen && (
        <button 
          className="md:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors shadow-lg"
          onClick={toggleMobileSidebar}
          aria-label="Open Menu"
        >
          <Menu size={24} />
        </button>
      )}

      {/* Sidebar Container */}
      <div 
        className={cn(
          "fixed inset-y-0 left-0 z-40 bg-gray-900 text-white transition-all duration-300 ease-in-out flex flex-col md:translate-x-0 md:static md:inset-auto shadow-xl overflow-hidden",
          isOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0",
          !isOpen && (isCollapsed ? "md:w-20" : "md:w-64")
        )}
      >
        <div className={cn("p-4 border-b border-gray-800 flex items-center h-[88px]", isCollapsed && !isOpen ? "justify-center" : "justify-between w-64")}>
          {(!isCollapsed || isOpen) && (
            <div className="flex items-center gap-3 overflow-hidden">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-10 h-10 rounded bg-white p-1 object-contain shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div>
                <h1 className="text-xl font-bold leading-tight whitespace-nowrap">Masters<br/>Publications</h1>
                <p className="text-[10px] text-gray-400 mt-1">{userProfile.branchId} Branch</p>
              </div>
            </div>
          )}
          
          <div className={cn("flex items-center gap-2 shrink-0", isCollapsed && !isOpen && "mx-auto")}>
            {/* Desktop Toggle Button */}
            <button
              onClick={toggleDesktopSidebar}
              className="hidden md:block text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu size={24} />
            </button>

            {/* Close button inside sidebar for mobile */}
            <button 
              onClick={() => setIsOpen(false)}
              className="md:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label="Close Menu"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
          <ul className="space-y-2 px-4 min-w-[256px]">
            {filteredLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.href;
              return (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors whitespace-nowrap",
                      isActive 
                        ? "bg-blue-600 text-white" 
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <Icon size={20} className="shrink-0" />
                    <span className={cn("transition-opacity duration-300", isCollapsed && !isOpen && "md:opacity-0")}>{link.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800 min-w-[256px]">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full text-left text-red-400 hover:bg-gray-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut size={20} className="shrink-0" />
            <span className={cn("transition-opacity duration-300", isCollapsed && !isOpen && "md:opacity-0")}>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );
};
