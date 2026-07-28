import { clsx } from 'clsx';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  OPEN: { label: 'Open', color: 'text-aether-green', bg: 'bg-aether-green/10' },
  IN_PROGRESS: { label: 'In Progress', color: 'text-aether-cyan', bg: 'bg-aether-cyan/10' },
  PENDING_REVIEW: { label: 'Pending Review', color: 'text-aether-amber', bg: 'bg-aether-amber/10' },
  COMPLETED: { label: 'Completed', color: 'text-aether-violet', bg: 'bg-aether-violet/10' },
  DISPUTED: { label: 'Disputed', color: 'text-aether-red', bg: 'bg-aether-red/10' },
  CANCELLED: { label: 'Cancelled', color: 'text-aether-text-dim', bg: 'bg-aether-surface-2' },
  EXPIRED: { label: 'Expired', color: 'text-aether-text-dim', bg: 'bg-aether-surface-2' },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { label: status, color: 'text-aether-text-dim', bg: 'bg-aether-surface-2' };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.color, cfg.bg)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.color.replace('text-', 'bg-'))} />
      {cfg.label}
    </span>
  );
}
