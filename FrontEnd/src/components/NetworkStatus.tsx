import { useEffect } from 'react';
import { toast } from 'sonner';

const NetworkStatus = () => {
  useEffect(() => {
    let offlineToastId: string | number | undefined;

    const handleOnline = () => {
      if (offlineToastId) {
        toast.dismiss(offlineToastId);
        offlineToastId = undefined;
      }
      toast.success("Connection restored", {
        description: "You are back online.",
        duration: 4000,
      });
    };

    const handleOffline = () => {
      if (offlineToastId === undefined) {
        offlineToastId = toast.error("Internet connection lost", {
          description: "Please check your network. Some features may be unavailable.",
          duration: Infinity,
        });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check when the component mounts
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (offlineToastId) {
        toast.dismiss(offlineToastId);
      }
    };
  }, []);

  return null; // This component does not render anything
};

export default NetworkStatus;
