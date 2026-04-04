import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { 
  LayoutDashboard, 
  Users, 
  Bell, 
  Settings, 
  LogOut, 
  Sparkles,
  Menu,
  X,
  ChevronRight
} from 'lucide-react';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { notifications } = useApp();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // Calculate unread notifications count
  const unreadCount = notifications.filter(n => !n.read).length;

  const navItems = [
    { name: 'Projects', path: '/dashboard', icon: LayoutDashboard, show: true },
    { name: 'Manage Users', path: '/users', icon: Users, show: user?.role === 'admin' },
    { name: 'Notifications', path: '/notifications', icon: Bell, show: true },
    { name: 'Settings', path: '/settings', icon: Settings, show: true },
  ];

  // Close mobile sidebar when navigating
  const handleNavClick = () => {
    setIsMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gradient truncate">Nexora</h1>
            <p className="text-xs text-muted-foreground truncate leading-tight">
              {user?.role === 'admin' ? 'Administrator' : 'User'}
            </p>
          </div>
          {/* Close button for mobile */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMobileOpen(false)}
            className="flex-shrink-0 h-8 w-8 p-0 md:hidden text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.filter(item => item.show).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/dashboard'}
            onClick={handleNavClick}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2.5 rounded-md transition-all text-sm relative ${
                isActive
                  ? 'gradient-primary text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`
            }
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium truncate">{item.name}</span>
            
            {/* Notification Badge */}
            {item.path === '/notifications' && unreadCount > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full shadow-sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-3 border-t border-border space-y-2">
        
        {/* --- CLICKABLE PROFILE SECTION (Points to /profile) --- */}
        <NavLink 
          to="/profile" 
          onClick={handleNavClick}
          className={({ isActive }) => 
            `flex items-center space-x-2.5 px-2 py-2 rounded-md transition-colors group cursor-pointer ${
              isActive ? 'bg-accent/60' : 'hover:bg-accent/50'
            }`
          }
        >
          <div className="w-9 h-9 rounded-full gradient-secondary flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform overflow-hidden">
            {user?.avatar && typeof user.avatar === "string" ? (
              <img
                src={
                  user.avatar.startsWith("http")
                    ? user.avatar.includes("drive.google.com")
                      ? user.avatar.replace("/view?usp=sharing", "").replace(
                          "file/d/",
                          "uc?id="
                        )
                      : user.avatar
                    : `${import.meta.env.VITE_API_URL}${user.avatar}`
                }
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
            )}

          </div>
          
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate leading-none group-hover:text-primary transition-colors">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {user?.email}
            </p>
          </div>
          {/* Visual indicator that this is clickable */}
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </NavLink>
        {/* --------------------------------- */}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              className="w-full justify-start text-destructive hover:text-destructive text-sm h-9 px-2 hover:bg-destructive/10"
            >
              <LogOut className="w-4 h-4 mr-2 flex-shrink-0" />
              Sign Out
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="glass-strong border-border max-w-[95vw] sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">Sign Out</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                Are you sure you want to sign out of Nexora?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
              <AlertDialogCancel className="glass w-full sm:w-auto h-9 text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  logout();
                  toast.success('Logged out successfully!');
                }}
                className="gradient-primary hover-glow w-full sm:w-auto h-9 text-sm"
              >
                Sign Out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button - hidden on desktop */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-3 left-3 z-50 h-9 w-9 p-0 glass md:hidden"
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Desktop Sidebar - hidden on mobile */}
      <aside className="hidden md:block fixed left-0 top-0 h-screen w-64 glass-strong border-r border-border z-50">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      <>
        {/* Backdrop */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
        )}
        
        {/* Mobile Sidebar */}
        <aside
          className={`fixed left-0 top-0 h-screen w-80 max-w-[85vw] glass-strong border-r border-border z-50 transform transition-transform duration-300 ease-in-out md:hidden ${
            isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      </>

      {/* Spacer for mobile header */}
      <div className="h-14 md:h-0" />
    </>
  );
};

export default Sidebar;