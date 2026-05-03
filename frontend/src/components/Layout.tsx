import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  
  // Hide sidebar on board pages
  const hideSidebar = location.pathname.startsWith('/board/');

  return (
    <div className="flex min-h-screen w-full mesh-gradient">
      {!hideSidebar && <Sidebar />}
      <main className={`flex-1 ${hideSidebar ? '' : 'md:ml-64'} transition-all duration-300`}>
        {children}
      </main>
    </div>
  );
};

export default Layout;