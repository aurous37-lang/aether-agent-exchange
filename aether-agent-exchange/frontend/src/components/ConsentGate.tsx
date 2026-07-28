import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, AlertTriangle, FileText, Eye, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getConsentStatus, acceptTerms } from '../lib/api';
import { errorMessage } from '../lib/errors';

interface ConsentGateProps {
  children: React.ReactNode;
  action?: string; // Description of what the user is trying to do
}

/**
 * ConsentGate wraps any action that requires policy acceptance.
 * If the user hasn't accepted the current policy version, it shows
 * the acceptance UI instead of the children.
 *
 * This is the FRONTEND gate. The backend independently enforces consent
 * via requireConsent middleware (returns 451 if missing).
 */
export default function ConsentGate({ children, action }: ConsentGateProps) {
  const { isAuthenticated, termsAccepted, markTermsAccepted } = useAuth();
  const [loading, setLoading] = useState(true);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    if (termsAccepted) { setLoading(false); setNeedsConsent(false); return; }

    getConsentStatus()
      .then((status) => {
        const allAccepted = status.allAccepted ?? (status.termsAccepted && !status.needsReaccept);
        if (allAccepted) {
          setNeedsConsent(false);
        } else {
          setNeedsConsent(true);
          setMissing(status.missing ?? ['terms', 'privacy', 'risk', 'disclosure']);
        }
      })
      .catch(() => {
        // If consent check fails, allow through in dev (backend will catch)
        setNeedsConsent(false);
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, termsAccepted]);

  if (loading) return null;
  if (!needsConsent) return <>{children}</>;

  async function handleAccept() {
    setAccepting(true);
    setError('');
    try {
      const result = await acceptTerms();
      markTermsAccepted(result.policyVersion);
      setNeedsConsent(false);
    } catch (error: unknown) {
      setError(errorMessage(error, 'Failed to record consent'));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-12 animate-slide-up">
      <div className="text-center mb-8">
        <Shield className="w-12 h-12 text-aether-cyan mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-aether-text-bright mb-2">Policy Acceptance Required</h2>
        <p className="text-aether-text-dim">
          {action
            ? `To ${action}, you must accept the platform policies.`
            : 'You must accept the platform policies before performing this action.'
          }
        </p>
      </div>

      <div className="space-y-3 mb-8">
        <ConsentItem
          icon={FileText}
          title="Terms of Service"
          description="Platform rules, fee structure, user responsibilities, and prohibited uses."
          link="/terms"
          needed={missing.includes('terms')}
        />
        <ConsentItem
          icon={Eye}
          title="Privacy Policy"
          description="What data we collect, how we use it, and your rights."
          link="/privacy"
          needed={missing.includes('privacy')}
        />
        <ConsentItem
          icon={AlertTriangle}
          title="Risk Disclosures"
          description="Blockchain, smart contract, token, and settlement risks."
          link="/risk"
          needed={missing.includes('risk')}
        />
        <ConsentItem
          icon={Lock}
          title="Platform Transparency"
          description="Admin controls, contract addresses, audit status, and known limitations."
          link="/transparency"
          needed={missing.includes('disclosure')}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">
          {error}
        </div>
      )}

      <div className="text-center">
        <p className="text-xs text-aether-text-dim mb-4">
          By clicking "Accept All Policies," you acknowledge that you have read and agree to the Terms of Service, Privacy Policy, Risk Disclosures, and Platform Transparency disclosures. Policy version: 2026-03-23
        </p>
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="px-8 py-3 rounded-xl bg-gradient-to-r from-aether-cyan to-aether-violet text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {accepting ? 'Recording consent...' : 'Accept All Policies'}
        </button>
      </div>
    </div>
  );
}

function ConsentItem({ icon: Icon, title, description, link, needed }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  link: string;
  needed: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${needed ? 'border-aether-cyan/30 bg-aether-cyan/5' : 'border-aether-border bg-aether-surface'}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${needed ? 'text-aether-cyan' : 'text-aether-green'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-aether-text-bright">{title}</span>
          {!needed && <span className="text-xs text-aether-green">Accepted</span>}
        </div>
        <p className="text-xs text-aether-text-dim mt-0.5">{description}</p>
      </div>
      <Link to={link} className="text-xs text-aether-cyan hover:text-aether-violet transition-colors shrink-0">
        Read
      </Link>
    </div>
  );
}
