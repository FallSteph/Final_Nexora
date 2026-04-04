import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user' | 'instructor' | 'pm';
  avatar?: string | File;
  authProvider?: 'local' | 'google';
  hasPassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  users: User[];
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, recaptchaToken?: string) => Promise<void>;
  signup: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: FormData | Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  addPassword: (newPassword: string) => Promise<void>;
  googleLogin: (userData: User, token: string) => void;
  googleSignup: (userData: User, token: string) => void;
  refreshUser: () => Promise<void>;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const clearAuthData = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('google_oauth_token');
      setToken(null);
      setUser(null);
    };

    const loadAuthState = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        
        console.log('🔄 Loading auth state:', {
          hasToken: !!storedToken,
          tokenStartsWith: storedToken?.substring(0, 10),
          hasUser: !!storedUser
        });

        if (storedToken && storedToken.startsWith('eyJ') && storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            
            // Verify and refresh user data to get latest hasPassword status
            const verifyRes = await fetch(`${API_URL}/api/auth/me`, {
              headers: { Authorization: `Bearer ${storedToken}` }
            });
            
            if (verifyRes.ok) {
              const freshUserData = await verifyRes.json();
              setToken(storedToken);
              setUser(freshUserData);
              localStorage.setItem('user', JSON.stringify(freshUserData));
              console.log('✅ Token valid, user state refreshed:', {
                hasPassword: freshUserData.hasPassword
              });
            } else {
              console.log('❌ Token invalid or user not found, clearing storage');
              clearAuthData();
            }
          } catch (parseError) {
            console.error('❌ Failed to parse user data:', parseError);
            clearAuthData();
          }
        } else {
          console.log('❌ No valid JWT token found');
          clearAuthData();
        }
      } catch (error) {
        console.error('💥 Error loading auth state:', error);
        clearAuthData();
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthState();
  }, []);

  const login = useCallback(async (email: string, password: string, recaptchaToken?: string) => {
    try {
      console.log('🔐 Attempting manual login for:', email);
      
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, recaptchaToken }),
      });

      const data = await res.json();
      
      console.log('📨 Login Response:', {
        status: res.status,
        ok: res.ok,
        hasToken: !!data.token,
        tokenLength: data.token?.length
      });

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Login failed');
      }

      if (!data.token) {
        console.error('❌ NO TOKEN IN RESPONSE:', data);
        throw new Error('Login successful but no token received from server');
      }

      console.log('✅ Real JWT token received, length:', data.token.length);
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('userEmail', data.user.email);
      
      setToken(data.token);
      setUser(data.user);
      setUsers(prev => [...prev, data.user]);

      // ✅ FIXED: Dispatch event to notify AppContext to fetch notifications
      window.dispatchEvent(new CustomEvent('auth-change', { 
        detail: { userEmail: data.user.email, action: 'login' } 
      }));
      
    } catch (error) {
      console.error('💥 Login error:', error);
      toast.error(error instanceof Error ? error.message : 'Login failed');
      throw error;
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    const res = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName }),
    });

    const data = await res.json();
    
    console.log('📨 Signup Response:', data);
    
    if (!res.ok) throw new Error(data.message || 'Signup failed');

    let token = data.token || data.accessToken || data.authToken;

    localStorage.setItem('token', token || 'temp-token');
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('userEmail', data.user.email);

    setToken(token || 'temp-token');
    setUser(data.user);
  }, []);

  const googleLogin = useCallback((userData: User, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('userEmail', userData.email);
    setToken(token);
    setUser(userData);

    // ✅ FIXED: Dispatch event for Google Login
    window.dispatchEvent(new CustomEvent('auth-change', { 
      detail: { userEmail: userData.email, action: 'login' } 
    }));
  }, []);

  const googleSignup = useCallback((userData: User, token: string) => {
    googleLogin(userData, token);
  }, [googleLogin]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('google_oauth_token');
    
    setToken(null);
    setUser(null);
  }, []);

 const updateProfile = useCallback(async (updates: FormData | Partial<User>) => {
  if (!user || !token) {
    toast.error('Please log in to update profile');
    return;
  }

  try {
    const isFormData = updates instanceof FormData;
    
    console.log('🔄 updateProfile called:', {
      userId: user._id,
      hasToken: !!token,
      isFormData,
      updates: isFormData ? 'FormData' : updates
    });

    // ✅ CORRECT ENDPOINT: Use /api/auth/profile (from your routes file)
    const url = `${API_URL}/api/auth/profile`;
    console.log('🌐 Making request to:', url);

    // ✅ Prepare headers with Authorization
    const headers: HeadersInit = {
      'Authorization': `Bearer ${token}`
    };

    let body: any;
    
    if (isFormData) {
      body = updates;
      // Don't set Content-Type for FormData - browser will set it automatically
    } else {
      // For JSON requests
      body = JSON.stringify(updates);
      headers['Content-Type'] = 'application/json';
    }

    console.log('📤 Request details:', {
      method: 'PUT',
      headers,
      body: isFormData ? 'FormData' : body
    });

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body,
    });

    console.log('📨 Response received:', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries())
    });

    // Check content type first
    const contentType = res.headers.get('content-type');
    console.log('📄 Content-Type:', contentType);

    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
      console.log('📊 Response data:', data);
    } else {
      // If not JSON, get text to debug
      const text = await res.text();
      console.error('❌ Non-JSON response received:', {
        first200Chars: text.substring(0, 200),
        fullText: text.length > 500 ? text.substring(0, 500) + '...' : text
      });
      
      if (res.status === 404) {
        throw new Error(`API endpoint not found. Check if backend is running on ${API_URL}/api/auth/profile`);
      } else if (res.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      } else {
        throw new Error(`Server error (${res.status}): ${text.substring(0, 100)}...`);
      }
    }

    if (!res.ok) {
      console.error('❌ Update failed:', data);
      throw new Error(data.message || data.error || `Failed to update profile (${res.status})`);
    }

    console.log('✅ Update successful:', {
      success: data.success,
      message: data.message,
      user: data.user
    });
    
    // Update user state
    const updatedUser = data.user;
    if (updatedUser) {
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      console.log('🔄 User state updated:', updatedUser);
    } else {
      console.warn('⚠️ No user data returned in response');
    }

    toast.success(data.message || 'Profile updated successfully!');
    return updatedUser;

  } catch (error) {
    console.error('💥 Profile update error:', error);
    
    // More specific error messages
    let errorMessage = 'Failed to update profile';
    if (error instanceof TypeError && error.message.includes('fetch')) {
      errorMessage = 'Network error. Check if backend server is running.';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    toast.error(errorMessage);
    throw error;
  }
}, [user, token]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const userData = await res.json();
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, [token]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!user || !token) throw new Error('Authentication required');

    const response = await fetch(`${API_URL}/api/users/change-password`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: user._id,
        currentPassword,
        newPassword,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to change password');
    
    // Update local state if needed (optional since hasPassword is true anyway)
    if (user) {
      const updatedUser = { ...user, hasPassword: true };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }

    toast.success('Password changed successfully!');
    return data;
  }, [user, token]);

  const addPassword = useCallback(async (newPassword: string) => {
    if (!user || !token) throw new Error('Authentication required');

    const response = await fetch(`${API_URL}/api/users/add-password`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: user._id,
        newPassword,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to add password');
    
    // Update local state so UI reflects that user now has a password
    if (user) {
      const updatedUser = { ...user, hasPassword: true };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }

    toast.success('Password added successfully! 🔒');
    return data;
  }, [user, token]);

  const value: AuthContextType = {
    user,
    users,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    signup,
    googleLogin,
    googleSignup,
    logout,
    updateProfile,
    changePassword,
    addPassword,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
