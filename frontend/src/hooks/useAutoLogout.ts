import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getAutoLogoutTimeout } from '@/lib/utils';
import { toast } from 'sonner';

export const useAutoLogout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      
      const timeout = getAutoLogoutTimeout();
      timeoutId = setTimeout(() => {
        logout();
        navigate('/login');
        toast.info('Session expired due to inactivity');
      }, timeout);
    };

    // Set initial timer
    resetTimer();

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [logout, navigate]);
};