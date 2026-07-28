import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  glow?: 'cyan' | 'violet' | 'none';
  hover?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className, glow = 'none', hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-xl border border-aether-border bg-aether-surface p-6 transition-all',
        glow === 'cyan' && 'glow-cyan',
        glow === 'violet' && 'glow-violet',
        hover && 'hover:border-aether-border-glow hover:bg-aether-surface-2 cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
