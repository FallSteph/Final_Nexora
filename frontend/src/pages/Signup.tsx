import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

declare const google: any;

const Signup = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signup, googleSignup } = useAuth();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (/\d/.test(firstName) || /\d/.test(lastName)) {
      toast.error("First and last name cannot contain numbers.");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address (e.g., user@example.com).");
      return;
    }

    // Strong password validation
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

    if (!passwordRegex.test(password)) {
      toast.error(
        "Password must be at least 8 characters long, include 1 uppercase, 1 lowercase, 1 number, and 1 special character."
      );
      return;
    }

    setLoading(true);
    try {
      await signup(email, password, firstName, lastName);
      toast.success("Account created successfully! 🎉");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

   const handleGoogleSignup = () => {
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

          if (!res.ok) throw new Error(data.error || data.message || 'Failed to sign up with Google');

          googleSignup(data.user, data.token);

          toast.success('Account created! 🎉');

          navigate('/dashboard');
        } catch (err: any) {
          toast.error(err.message || 'An error occurred');
        }
      },
    });

    client.requestAccessToken();
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
      <div className="w-full max-w-[380px]">
        <div className="glass-strong rounded-xl p-4 space-y-3 shadow-xl">
          {/* Logo & Title */}
          <div className="text-center space-y-0.5">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Nexora Logo" className="w-10 h-10 object-contain drop-shadow-md mx-auto mb-1" />
            <h1 className="text-lg font-bold text-gradient">Nexora</h1>
            <p className="text-muted-foreground text-xs">Create your account</p>
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSignup} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="firstName" className="text-xs font-medium ml-1">First Name</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="pl-8 bg-background/50 border-border/50 h-9 text-sm focus-visible:ring-1"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="lastName" className="text-xs font-medium ml-1">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-background/50 border-border/50 h-9 text-sm focus-visible:ring-1 px-3"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs font-medium ml-1">Email</Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-8 bg-background/50 border-border/50 h-9 text-sm focus-visible:ring-1"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className="text-xs font-medium ml-1">Password</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-8 pr-8 bg-background/50 border-border/50 h-9 text-sm focus-visible:ring-1"
                  required
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full gradient-primary h-9 text-sm font-medium shadow-md mt-1" disabled={loading}>
              {loading ? 'Creating...' : 'Create Account'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-card px-2 text-muted-foreground/70">Or continue with</span>
            </div>
          </div>

          {/* Google Signup */}
          <Button
            type="button"
            variant="outline"
            className="w-full bg-background/50 border-border/50 h-9 text-sm shadow-sm hover:bg-background/80"
            onClick={handleGoogleSignup}
          >
            <svg className="w-3.5 h-3.5 mr-2" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </Button>

          {/* Sign In Link */}
          <p className="text-center text-xs text-muted-foreground mt-1">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;