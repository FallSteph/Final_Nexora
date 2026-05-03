import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { AppProvider } from "./context/AppContext";
import AppRoutes from "./AppRoutes";
import { initializeAppSettings } from "@/lib/utils";
import NetworkStatus from "@/components/NetworkStatus";

const queryClient = new QueryClient();
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const App = () => {
  // Initialize app settings on startup
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/settings`);
        const data = await res.json();
        localStorage.setItem('app_configuration', JSON.stringify(data));
      } catch (error) {
        console.error('Failed to fetch app settings', error);
      }
    };

    fetchSettings();
    initializeAppSettings();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppProvider>
          <TooltipProvider>
            <NetworkStatus />
            <AppRoutes />
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;