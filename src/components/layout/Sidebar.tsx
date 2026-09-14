import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useBranches';
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
  const { branches, loading: branchesLoading } = useBranches();
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false); // Mobile drawer
  const [isCollapsed, setIsCollapsed] = React.useState(false); // Desktop collapse
  const [hoveredItem, setHoveredItem] = React.useState<{
    name: string;
    description?: string;
    top: number;
    left: number;
  } | null>(null);

  const toggleMobileSidebar = () => setIsOpen(!isOpen);
  const toggleDesktopSidebar = () => setIsCollapsed(!isCollapsed);

  if (!userProfile) return null;

  // Find branch name from ID if necessary
  const currentBranch = branches.find(b => b.id === userProfile.branchId || b.name === userProfile.branchId);
  const branchName = branchesLoading ? 'Loading...' : (userProfile.branchId === 'ALL' ? 'All Branches' : (currentBranch ? currentBranch.name : userProfile.branchId));

  const links = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, description: 'Overview, analytics & performance metrics', roles: ['Cashier', 'Supervisor', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'POS', href: '/pos', icon: ShoppingCart, description: 'Point of sale, checkout & quick orders', roles: ['Cashier', 'Manager', 'Director', 'Admin'] },
    { name: 'Orders', href: '/orders', icon: ClipboardList, description: 'Sales invoices, delivery & order adjustments', roles: ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Payments', href: '/payments', icon: CreditCard, description: 'Customer debt payments & receipt collection', roles: ['Cashier', 'Supervisor', 'Accountant', 'Director', 'Admin'] },
    { name: 'Expenses', href: '/expenses', icon: FileText, description: 'Branch operating expenses & approvals', roles: ['Cashier', 'Supervisor', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Inventory', href: '/inventory', icon: Package, description: 'Stock catalogue, pricing & warehouse levels', roles: ['Cashier', 'Supervisor', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Clients', href: '/clients', icon: UserCheck, description: 'Customer accounts, balances & ledgers', roles: ['Cashier', 'Supervisor', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Staff', href: '/staff', icon: Users, description: 'Staff directory, branches & roles', roles: ['Cashier', 'Supervisor', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Branches', href: '/branches', icon: MapPin, description: 'Branch locations & sales management', roles: ['Cashier', 'Supervisor', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Suppliers', href: '/suppliers', icon: Truck, description: 'Vendors, purchase notes & payables', roles: ['Supervisor', 'Manager', 'Accountant', 'Director', 'Admin'] },
    { name: 'Payroll', href: '/payroll', icon: DollarSign, description: 'Salaries, deductions & payslip generator', roles: ['Accountant', 'Director', 'Admin'] },
    { name: 'Financials', href: '/financials', icon: TrendingUp, description: 'P&L, income statements & financial position', roles: ['Accountant', 'Director', 'Admin'] },
    { name: 'Fixed Assets', href: '/fixed-assets', icon: Package, description: 'Company machinery & equipment registers', roles: ['Accountant', 'Director', 'Admin'] },
    { name: 'Payments By Source', href: '/payments-by-source', icon: CreditCard, description: 'Cash, bank & mobile money accounts', roles: ['Accountant', 'Director', 'Admin'] },
    { name: 'Audit Logs', href: '/audit-logs', icon: ShieldAlert, description: 'Security audit trail & user activity log', roles: ['Accountant', 'Director', 'Admin'] },
    { name: 'Admin', href: '/admin', icon: Settings, description: 'Platform settings & permissions control', roles: ['Director','Admin'] },
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
                className="w-10 h-10 rounded p-1 object-contain shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div>
                <h1 className="text-xl font-bold leading-tight whitespace-nowrap">Masters<br/>Publications</h1>
                <p className="text-[10px] text-gray-400 mt-1">
                  {branchName === 'All Branches' || branchName === 'Loading...' ? branchName : `${branchName} Branch`}
                </p>
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

        <nav 
          onScroll={() => setHoveredItem(null)}
          className="flex-1 overflow-y-auto overflow-x-hidden py-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]"
        >
          <ul className={cn("space-y-2 px-4 transition-all duration-300", isCollapsed && !isOpen ? "w-20" : "w-64")}>
            {filteredLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.href;
              return (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    title={link.name}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredItem({
                        name: link.name,
                        description: link.description,
                        top: rect.top + rect.height / 2,
                        left: rect.right + 12
                      });
                    }}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors whitespace-nowrap group",
                      isActive 
                        ? "bg-blue-600 text-white" 
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    )}
                    onClick={() => {
                      setIsOpen(false);
                      setHoveredItem(null);
                    }}
                  >
                    <Icon size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
                    <span className={cn("transition-opacity duration-300", isCollapsed && !isOpen && "md:opacity-0")}>{link.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={cn("p-4 border-t border-gray-800 transition-all duration-300", isCollapsed && !isOpen ? "w-20" : "w-64")}>
          <button
            onClick={logout}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoveredItem({
                name: 'Sign Out',
                description: 'End session and return to login',
                top: rect.top + rect.height / 2,
                left: rect.right + 12
              });
            }}
            onMouseLeave={() => setHoveredItem(null)}
            className="flex items-center gap-3 px-4 py-3 w-full text-left text-red-400 hover:bg-gray-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut size={20} className="shrink-0" />
            <span className={cn("transition-opacity duration-300", isCollapsed && !isOpen && "md:opacity-0")}>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Floating Tooltip for Sidebar Tabs */}
      {hoveredItem && (
        <div 
          className="fixed z-50 pointer-events-none hidden md:flex items-center -translate-y-1/2 transition-opacity duration-150"
          style={{
            top: `${hoveredItem.top}px`,
            left: `${hoveredItem.left}px`
          }}
        >
          <div className="relative bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 shadow-2xl text-left whitespace-nowrap">
            {/* Little pointer triangle */}
            <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-gray-900 border-l border-b border-gray-700 transform rotate-45 pointer-events-none" />
            <div className="relative z-10">
              <div className="font-semibold text-xs text-white flex items-center gap-1.5">
                <span>{hoveredItem.name}</span>
              </div>
              {hoveredItem.description && (
                <div className="text-[11px] text-gray-300 mt-0.5 max-w-xs font-normal">
                  {hoveredItem.description}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
