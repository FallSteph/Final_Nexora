import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Sparkles, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import ReCAPTCHA from 'react-google-recaptcha';

declare const google: any;

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const navigate = useNavigate();
  const { login, googleLogin } = useAuth();
  const recaptchaRef = useRef<ReCAPTCHA | null>(null);

  const handleGoogleLogin = async () => {
  if (!(window as any).google || !(window as any).google.accounts) return;

  const client = google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file'
    ].join(' '),
    callback: async (response: any) => {
      try {
        // ✅ Store Google OAuth token for Calendar/Drive sync
        if (response.access_token) {
          const expiresAt = Date.now() + (response.expires_in * 1000);
          localStorage.setItem('google_oauth_token', JSON.stringify({
            access_token: response.access_token,
            expires_at: expiresAt
          }));
        }

        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: response.access_token }),
        });

        const data = await res.json();

        if (!res.ok) {
          // Check if account is locked from API response
          if (data.code === 'ACCOUNT_LOCKED') {
            toast.error(
              <div>
                <p className="font-semibold">Account Locked</p>
                <p>{data.message}</p>
                {data.lockReason && <p>Reason: {data.lockReason}</p>}
                {data.lockExpiresAt && (
                  <p>Expires: {new Date(data.lockExpiresAt).toLocaleString()}</p>
                )}
              </div>,
              { duration: 10000 }
            );
          } else {
            toast.error(data.message || 'Failed to log in with Google');
          }
          return;
        }

        // Check if the user account is locked from the user data
        if (data.user?.lockedByAdmin) {
          // Clear any partial auth state
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          
          // Show detailed lock message
          toast.error(
            <div>
              <p className="font-semibold">Account Locked</p>
              <p>Your account has been locked by an administrator.</p>
              {data.user.lockReason && <p>Reason: {data.user.lockReason}</p>}
              {data.user.lockedByAdminName && (
                <p>Locked by: {data.user.lockedByAdminName}</p>
              )}
              {data.user.lockExpiresAt ? (
                <p>Expires: {new Date(data.user.lockExpiresAt).toLocaleString()}</p>
              ) : (
                <p>This lock is permanent.</p>
              )}
              <p className="mt-2 text-sm">Please contact support for assistance.</p>
            </div>,
            { duration: 15000 }
          );
          return;
        }

        // ✅ Save user and token to context
        googleLogin(data.user, data.token);

        toast.success('Welcome back! 🚀');
        navigate('/dashboard');
      } catch (err: any) {
        toast.error(err.message || 'An error occurred');
      }
    },
  });

  client.requestAccessToken();
};

  // Manual login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const recaptchaToken = recaptchaRef.current?.getValue();
    if (!recaptchaToken) {
      toast.error('Please verify reCAPTCHA');
      return;
    }

    setLoading(true);
    try {
      // Call your context login
      await login(email, password, recaptchaToken);

      // ✅ Enhanced token and user persistence
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');
      if (storedUser && storedToken) {
        // Re-set to force refresh and ensure persistence
        localStorage.setItem('user', storedUser);
        localStorage.setItem('token', storedToken);
      }

      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: any) {
      if (err.message.includes('Google') || err.message.includes('google')) {
        toast.error("Please continue using Google login 🚀", {
          description: "This account is linked with Google authentication.",
          duration: 5000,
        });
      } else {
        toast.error(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
      recaptchaRef.current?.reset();
      setCaptchaVerified(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
      <div className="w-full max-w-[380px]">
        {/* Compact padding and spacing, no extra glow elements */}
        <div className="glass-strong rounded-xl p-5 space-y-3 shadow-xl">
          
          {/* Logo & Title */}
          <div className="text-center space-y-0.5">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg gradient-primary mb-1 shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gradient">Nexora</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">Sign in to your workspace</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-2.5">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs font-medium ml-1">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 bg-background/50 border-border/50 h-9 text-sm focus-visible:ring-1"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className="text-xs font-medium ml-1">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-9 bg-background/50 border-border/50 h-9 text-sm focus-visible:ring-1"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              {/* Forgot Password moved below password input */}
              <div className="flex justify-end pt-1">
                <Link 
                  to="/forgot-password" 
                  className="text-primary hover:underline text-xs font-medium transition-colors disabled:opacity-50"
                  onClick={(e) => loading && e.preventDefault()}
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* reCAPTCHA - Centered and full size */}
            <div className="flex justify-center pt-2">
              <ReCAPTCHA
                sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
                ref={recaptchaRef}
                onChange={(token) => {
                  setCaptchaVerified(!!token);
                  console.log("reCAPTCHA token:", token); 
                }}
                onExpired={() => setCaptchaVerified(false)}
                onErrored={() => {
                  toast.error('reCAPTCHA verification failed. Please try again.');
                  setCaptchaVerified(false);
                }}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full gradient-primary h-9 text-sm font-medium shadow-md mt-2 transition-all duration-200" 
              disabled={loading || !captchaVerified}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-card px-2 text-muted-foreground/80">Or continue with</span>
            </div>
          </div>

          {/* Google Login */}
          <Button
            type="button"
            variant="outline"
            className="w-full bg-background/50 border-border/50 h-9 text-sm shadow-sm hover:bg-background/80 transition-all duration-200 disabled:opacity-50"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <svg className="w-3.5 h-3.5 mr-2" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Signing in...' : 'Google'}
          </Button>

          {/* Sign Up Link */}
          <p className="text-center text-xs text-muted-foreground mt-2">
            Don't have an account?{' '}
            <Link 
              to="/signup" 
              className="text-primary hover:underline font-medium transition-colors disabled:opacity-50"
              onClick={(e) => loading && e.preventDefault()}
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;