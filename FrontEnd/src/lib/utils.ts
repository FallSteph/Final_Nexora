import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from "sonner";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// App Configuration Utilities
export const getAppConfig = () => {
  const appConfig = localStorage.getItem('app_configuration');
  if (appConfig) {
    try {
      return JSON.parse(appConfig);
    } catch (e) {
      console.error('Failed to parse app_configuration:', e);
    }
  }
  return {
    MAX_FILE_UPLOAD_MB: '10',
    THEME: 'default',
  };
};

export const getMaxFileSize = (): number => {
  const config = getAppConfig();
  const maxMB = parseInt(config.MAX_FILE_UPLOAD_MB) || 10;
  return maxMB * 1024 * 1024;
};

export const getMaxFileSizeMB = (): number => {
  const config = getAppConfig();
  return parseInt(config.MAX_FILE_UPLOAD_MB) || 10;
};

export const validateFileSize = (file: File): { valid: boolean; error?: string } => {
  const maxSize = getMaxFileSize();
  const maxSizeMB = getMaxFileSizeMB();
  
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File "${file.name}" is too large. Maximum allowed size is ${maxSizeMB} MB.`
    };
  }
  
  return { valid: true };
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const shouldSendEmail = (): boolean => {
  const userPrefs = localStorage.getItem('user_preferences');
  if (userPrefs) {
    const preferences = JSON.parse(userPrefs);
    return preferences.emailNotifications !== false;
  }

  return true;
};

export const shouldSendProjectUpdates = (): boolean => {
  if (!shouldSendEmail()) return false;

  const userPrefs = localStorage.getItem('user_preferences');
  if (userPrefs) {
    const preferences = JSON.parse(userPrefs);
    return preferences.projectUpdates !== false;
  }

  return true;
};

export const getNotificationStatus = () => {
  const userPrefs = localStorage.getItem('user_preferences');
  
  const userEnabled = userPrefs ? 
    JSON.parse(userPrefs).emailNotifications !== false : true;

  return {
    userEnabled,
    canSendEmails: userEnabled
  };
};

export const getAppName = (): string => {
  const config = getAppConfig();
  return config.APP_NAME || 'Nexora';
};

export const getSupportEmail = (): string => {
  const config = getAppConfig();
  return config.SUPPORT_EMAIL || 'support@nexora.com';
};

export const initializeAppSettings = () => {
  applyAdminSettings();
};

export const applyAdminSettings = () => {
  const config = getAppConfig();
  
  // Apply App Name
  if (config.APP_NAME) {
    document.title = `${config.APP_NAME} - Dashboard`;
  }
  
  // Set global variables for other components to use
  window.APP_NAME = config.APP_NAME || 'Nexora';
  window.SUPPORT_EMAIL = config.SUPPORT_EMAIL || 'support@nexora.com';
  window.MAX_FILE_UPLOAD_MB = parseInt(config.MAX_FILE_UPLOAD_MB) || 10;
};

/**
 * Helper to handle fetch errors, especially network issues
 */
export const handleNetworkError = (error: any) => {
  if (!navigator.onLine || error.name === 'TypeError' && error.message.includes('fetch')) {
    toast.error("No internet connection", {
      description: "Please check your internet connection and try again."
    });
    return true;
  }
  return false;
};