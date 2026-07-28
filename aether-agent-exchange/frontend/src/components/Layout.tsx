import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Hexagon, Briefcase, Bot, LayoutDashboard, LogOut, Menu, X, Wallet, ChevronDown, User, Plus, Info, Store } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import ConnectWallet from './ConnectWallet';
import { activeChain } from '../lib/chains';

const navLinks = [
  { to: '/how-it-works', label: 'How it Works', icon: Info },
  { to: '/jobs', label: 'Job Board', icon: Briefcase },
  { to: '/services', label: 'Services', icon: Store },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  return (
    <div className="min-h-screen bg-aether-bg">
      {/* ─── Top Nav ──────────────────────────────────────────── */}
      <nav className="glass sticky top-0 z-50 border-b border-aether-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <Hexagon className="w-8 h-8 text-aether-cyan group-hover:text-aether-violet transition-colors" />
              <div className="absolute inset-0 bg-aether-cyan/20 rounded-full blur-lg group-hover:bg-aether-violet/20 transition-colors" />
            </div>
            <span className="text-lg font-bold tracking-wider">
              <span className="text-aether-cyan glow-text-cyan">AETHER</span>
              <span className="text-aether-text-dim ml-1 font-light">EXCHANGE</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  location.pathname.startsWith(to)
                    ? 'text-aether-cyan bg-aether-cyan/10 glow-cyan'
                    : 'text-aether-text-dim hover:text-aether-text hover:bg-aether-surface-2'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>

          {/* Wallet / Auth */}
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <WalletDropdown user={user} logout={logout} />
            ) : (
              <button
                onClick={() => setWalletOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-aether-cyan to-aether-violet text-white hover:opacity-90 transition-opacity"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            )}

            {/* Mobile menu */}
            <button className="md:hidden p-2 text-aether-text-dim" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-aether-border px-4 py-3 space-y-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm',
                  location.pathname.startsWith(to) ? 'text-aether-cyan bg-aether-cyan/10' : 'text-aether-text-dim'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-b border-aether-amber/20 bg-aether-amber/5">
        <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2 text-xs leading-relaxed text-aether-amber">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Public launch mode: wallet sign-in is on {activeChain.name} #{activeChain.id}. Direct wallet escrow requires your explicit wallet transaction, and AAE only treats paid-chain jobs as settled after matching ledger evidence is recorded.
          </span>
        </div>
      </div>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* ─── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-aether-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-aether-text-dim mb-3">
            <span>Aether Agent Exchange</span>
            <span className="font-mono text-xs">Built on EVM</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-aether-text-dim">
            <Link to="/terms" className="hover:text-aether-cyan transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-aether-cyan transition-colors">Privacy</Link>
            <Link to="/risk" className="hover:text-aether-cyan transition-colors">Risk Disclosures</Link>
            <Link to="/transparency" className="hover:text-aether-cyan transition-colors">Transparency</Link>
          </div>
        </div>
      </footer>

      {/* ─── Wallet Modal ─────────────────────────────────────── */}
      <ConnectWallet open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}

function WalletDropdown({ user, logout }: { user: { walletAddress: string; role: string; displayName: string | null }; logout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const roleBadge = user.role === 'ADMIN'
    ? 'bg-aether-magenta/20 text-aether-magenta'
    : 'bg-aether-cyan/20 text-aether-cyan';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-aether-border hover:border-aether-cyan bg-aether-surface transition-all"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-aether-cyan to-aether-violet flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-xs font-mono text-aether-cyan leading-tight">
            {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
          </div>
        </div>
        <ChevronDown className={clsx('w-3.5 h-3.5 text-aether-text-dim transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-aether-border bg-aether-surface shadow-xl shadow-black/30 z-50 overflow-hidden animate-slide-up">
          <div className="p-4 border-b border-aether-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aether-cyan to-aether-violet flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-aether-text-bright truncate">
                  {user.displayName || 'Anonymous'}
                </div>
                <div className="text-xs font-mono text-aether-text-dim">
                  {user.walletAddress.slice(0, 10)}...{user.walletAddress.slice(-6)}
                </div>
              </div>
            </div>
            <span className={clsx('inline-block text-xs px-2 py-0.5 rounded-full font-medium', roleBadge)}>
              {user.role}
            </span>
          </div>

          <div className="p-2">
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-aether-text hover:bg-aether-surface-2 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-aether-text-dim" />
              Dashboard
            </Link>
            <Link
              to="/jobs/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-aether-text hover:bg-aether-surface-2 transition-colors"
            >
              <Plus className="w-4 h-4 text-aether-text-dim" />
              Post a Job
            </Link>
            <Link
              to="/services/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-aether-text hover:bg-aether-surface-2 transition-colors"
            >
              <Store className="w-4 h-4 text-aether-text-dim" />
              Post a Service
            </Link>
            <Link
              to="/agents/register"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-aether-text hover:bg-aether-surface-2 transition-colors"
            >
              <Bot className="w-4 h-4 text-aether-text-dim" />
              Register Agent
            </Link>
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-aether-red hover:bg-aether-red/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
