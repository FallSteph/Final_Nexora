import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ArrowRight, Shield, Zap, LayoutDashboard, BrainCircuit } from "lucide-react";

const Landing = () => {
  const { user, isLoading } = useAuth();

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col bg-background">
      {/* Subtle top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Navbar */}
      <header className="container mx-auto px-6 py-6 flex-between relative z-10 fade-in">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Nexora Logo" className="w-10 h-10 object-contain drop-shadow-md" />
          <span className="text-2xl font-bold tracking-tight text-gradient">Nexora</span>
        </div>
        <nav>
          {isLoading ? (
            <div className="w-24 h-10 animate-pulse bg-muted rounded-lg" />
          ) : user ? (
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
            >
              Dashboard
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Log In
              </Link>
              <Link
                to="/signup"
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg gradient-primary text-white font-medium hover:opacity-90 transition-opacity shadow-sm"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 container mx-auto px-6 flex-center flex-col text-center relative z-10 slide-in">
        <div className="max-w-4xl mx-auto space-y-8 mt-12 md:mt-24">


          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
            The Future of <br className="hidden md:block" />
            <span className="text-gradient">Board Management</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mt-6">
            Elevate your academic scheduling, faculty collaboration, and resource planning. Nexora combines powerful automation with a breathtaking modern experience.
          </p>

          <div className="flex-center flex-col sm:flex-row gap-4 pt-8">
            {!user ? (
              <Link
                to="/signup"
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 rounded-xl gradient-primary font-semibold text-white text-lg hover:opacity-90 transition-opacity shadow-md"
              >
                Start your free workspace
                <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <Link
                to="/dashboard"
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 rounded-xl gradient-primary font-semibold text-white text-lg hover:opacity-90 transition-opacity shadow-md"
              >
                Go to Dashboard
                <ArrowRight className="w-5 h-5" />
              </Link>
            )}
            {!user && (
              <Link
                to="/login"
                className="flex items-center justify-center w-full sm:w-auto px-8 py-4 rounded-xl border border-border bg-card font-semibold text-foreground text-lg hover:bg-muted transition-colors shadow-sm"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 mb-24 max-w-5xl mx-auto w-full">
          <div className="glass-strong rounded-2xl p-8 flex flex-col items-center text-center space-y-4 shadow-xl hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all duration-300">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex-center text-white mb-2 shadow-md">
              <Zap className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold">Lightning Fast</h3>
            <p className="text-muted-foreground leading-relaxed">Real-time sync ensures everyone has the latest schedule instantly.</p>
          </div>

          <div className="glass-strong rounded-2xl p-8 flex flex-col items-center text-center space-y-4 shadow-xl hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all duration-300">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex-center text-white mb-2 shadow-md">
              <Shield className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold">Enterprise Security</h3>
            <p className="text-muted-foreground leading-relaxed">Bank-level encryption and advanced role-based access controls.</p>
          </div>

          <div className="glass-strong rounded-2xl p-8 flex flex-col items-center text-center space-y-4 shadow-xl hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all duration-300">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex-center text-white mb-2 shadow-md">
              <LayoutDashboard className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold">Smart Workspaces</h3>
            <p className="text-muted-foreground leading-relaxed">Intuitive dragging, auto-saving, and conflict resolution built-in.</p>
          </div>
        </div>
      </main>

      {/* Footer minimal */}
      <footer className="py-8 text-center text-sm text-muted-foreground relative z-10 border-t border-border mt-auto">
        <p>&copy; {new Date().getFullYear()} Nexora. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Landing;
