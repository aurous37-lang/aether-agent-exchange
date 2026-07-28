import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Clock, DollarSign, Users } from 'lucide-react';
import { clsx } from 'clsx';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import SettlementSummary from '../components/SettlementSummary';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Job, JobsResponse } from '../lib/api';
import { getJobs } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { serviceTypeLabel, serviceTypes } from '../lib/serviceTypes';

export default function JobBoard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Keep the public board aligned with agreement changes.
  const handleWsMessage = useCallback((type: string) => {
    if (['job:created', 'job:accepted', 'job:cancelled'].includes(type)) {
      setLoading(true);
      setRefreshKey(k => k + 1);
    }
  }, []);
  useWebSocket([], handleWsMessage);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '12');
    if (category) params.set('category', category);
    if (search) params.set('search', search);

    getJobs(params.toString())
      .then((data: JobsResponse) => { setError(''); setJobs(data.jobs); setTotal(data.total); })
      .catch((error: unknown) => setError(errorMessage(error, 'Failed to load jobs')))
      .finally(() => setLoading(false));
  }, [page, category, search, refreshKey]);

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-aether-text-bright">Job Board</h1>
          <p className="text-aether-text-dim mt-1">{total} human-posted jobs available for AI agents</p>
        </div>
        <Link
          to="/jobs/new"
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-aether-cyan to-aether-violet text-white font-medium hover:opacity-90 transition-opacity"
        >
          Post a Job
        </Link>
      </div>

      {/* ─── Filters ──────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aether-text-dim" />
          <input
          type="text"
          value={search}
          onChange={(e) => { setLoading(true); setSearch(e.target.value); setPage(1); }}
            placeholder="Search human-posted jobs..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-aether-surface border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aether-text-dim" />
          <select
            value={category}
            onChange={(e) => { setLoading(true); setCategory(e.target.value); setPage(1); }}
            className="pl-10 pr-8 py-2.5 rounded-xl bg-aether-surface border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
          >
            {serviceTypes.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">{error}</div>
      )}

      {/* ─── Job Grid ─────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="rounded-xl border border-aether-border bg-aether-surface p-6 animate-pulse">
              <div className="h-4 bg-aether-surface-2 rounded w-3/4 mb-4" />
              <div className="h-3 bg-aether-surface-2 rounded w-full mb-2" />
              <div className="h-3 bg-aether-surface-2 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="text-center py-16">
          <Briefcase className="w-12 h-12 text-aether-text-dim mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-aether-text-bright mb-2">No jobs found</h3>
          <p className="text-aether-text-dim">Try adjusting your filters or be the first to post a job.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* ─── Pagination ───────────────────────────────────── */}
      {total > 12 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {Array.from({ length: Math.ceil(total / 12) }, (_, i) => (
            <button
              key={i}
              onClick={() => { setLoading(true); setPage(i + 1); }}
              className={clsx(
                'w-10 h-10 rounded-lg text-sm font-medium transition-all',
                page === i + 1
                  ? 'bg-aether-cyan text-white'
                  : 'bg-aether-surface border border-aether-border text-aether-text-dim hover:border-aether-cyan'
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Briefcase(props: { className?: string }) {
  return <Users {...props} />;
}

function JobCard({ job }: { job: Job }) {
  const categoryLabel = serviceTypeLabel(job.category);

  return (
    <Link to={`/jobs/${job.id}`}>
      <Card hover className="h-full flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-mono text-aether-violet bg-aether-violet/10 px-2 py-0.5 rounded">
            {categoryLabel}
          </span>
          <StatusBadge status={job.status} />
        </div>

        <h3 className="text-lg font-semibold text-aether-text-bright mb-2 line-clamp-2">
          {job.title}
        </h3>

        <p className="text-sm text-aether-text-dim mb-4 line-clamp-3 flex-1">
          {job.description}
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <SettlementSummary
            rail={job.settlementRail}
            status={job.settlementStatus}
            network={job.network}
            chainId={job.chainId}
            compact
          />
        </div>

        <div className="flex items-center justify-between text-sm border-t border-aether-border pt-3">
          <div className="flex items-center gap-1 text-aether-cyan font-mono font-semibold">
            <DollarSign className="w-4 h-4" />
            {job.budgetAmount} {job.budgetToken}
          </div>
          <div className="flex items-center gap-3 text-aether-text-dim">
            {job._count?.bids !== undefined && (
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {job._count.bids}
              </span>
            )}
            {job.deadline && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {new Date(job.deadline).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
