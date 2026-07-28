import { AlertTriangle, CheckCircle, Clock, FileText } from 'lucide-react';
import type { PaymentLedgerEntry } from '../lib/api';

type SettlementSummaryProps = {
  rail?: string;
  status?: string;
  network?: string;
  chainId?: number;
  paymentLedger?: PaymentLedgerEntry[];
  compact?: boolean;
};

function railClass(rail?: string, network?: string, chainId?: number) {
  const normalizedRail = (rail || 'offchain').toLowerCase();
  const normalizedNetwork = (network || '').toLowerCase();
  if (normalizedRail === 'offchain') return 'Record-only settlement';
  if (chainId === 84532 || normalizedNetwork.includes('sepolia') || normalizedNetwork.includes('testnet')) return 'Historical testnet receipt';
  return 'Mainnet paid-chain rail';
}

function ledgerState(entries: PaymentLedgerEntry[]) {
  if (entries.some(entry => entry.status === 'SETTLED')) return 'settled receipt';
  if (entries.some(entry => entry.status === 'QUOTED')) return 'quote only';
  if (entries.some(entry => entry.status === 'BLOCKED')) return 'blocked receipt';
  if (entries.length > 0) return 'receipt pending';
  return 'no payment ledger';
}

function toneFor(rail?: string, status?: string, entries: PaymentLedgerEntry[] = []) {
  if ((rail || 'offchain') === 'offchain' && entries.length === 0) return 'text-aether-amber border-aether-amber/30 bg-aether-amber/10';
  if (status === 'SETTLED' && entries.some(entry => entry.status === 'SETTLED')) return 'text-aether-green border-aether-green/30 bg-aether-green/10';
  if (status === 'SETTLED') return 'text-aether-cyan border-aether-cyan/30 bg-aether-cyan/10';
  return 'text-aether-text-dim border-aether-border bg-aether-surface-2';
}

export default function SettlementSummary({
  rail = 'offchain',
  status = 'UNSETTLED',
  network,
  chainId,
  paymentLedger = [],
  compact = false,
}: SettlementSummaryProps) {
  const classLabel = railClass(rail, network, chainId);
  const ledgerLabel = ledgerState(paymentLedger);
  const tone = toneFor(rail, status, paymentLedger);
  const Icon = ledgerLabel === 'settled receipt'
    ? CheckCircle
    : ledgerLabel === 'no payment ledger'
      ? AlertTriangle
      : FileText;
  const note = rail === 'offchain' && paymentLedger.length === 0
    ? 'No wallet payment recorded'
    : ledgerLabel === 'settled receipt'
      ? 'PaymentLedger evidence attached'
      : 'Completion waits on matching settled evidence';

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${tone}`}>
        <Icon className="h-3 w-3" />
        {classLabel}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{classLabel}</p>
          <p className="mt-1 text-xs opacity-85">{note}</p>
        </div>
        <Icon className="h-4 w-4 shrink-0" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <span>Rail</span>
        <span className="text-right font-mono">{rail}</span>
        <span>Status</span>
        <span className="text-right font-mono">{status}</span>
        <span>Ledger</span>
        <span className="text-right">{ledgerLabel}</span>
        <span>Network</span>
        <span className="text-right">{network || 'not recorded'}{chainId ? ` #${chainId}` : ''}</span>
      </div>
      {ledgerLabel !== 'settled receipt' && rail !== 'offchain' && (
        <div className="mt-3 flex items-start gap-2 text-xs">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Paid-chain approval remains blocked until matching settled PaymentLedger evidence exists.</span>
        </div>
      )}
    </div>
  );
}
