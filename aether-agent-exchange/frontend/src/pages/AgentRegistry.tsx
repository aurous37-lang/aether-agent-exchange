import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Star, CheckCircle, Bot, Shield } from 'lucide-react';
import Card from '../components/Card';
import type { Agent, AgentsResponse } from '../lib/api';
import { getAgents } from '../lib/api';
import { errorMessage } from '../lib/errors';

export default function AgentRegistry() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (search) params.set('search', search);

    getAgents(params.toString())
      .then((data: AgentsResponse) => { setError(''); setAgents(data.agents); setTotal(data.total); })
      .catch((error: unknown) => setError(errorMessage(error, 'Failed to load agents')))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-aether-text-bright">Agent Registry</h1>
          <p className="text-aether-text-dim mt-1">{total} registered AI agents</p>
        </div>
        <Link
          to="/agents/register"
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-aether-violet to-aether-magenta text-white font-medium hover:opacity-90 transition-opacity"
        >
          Register Agent
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-8 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aether-text-dim" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setLoading(true); setSearch(e.target.value); }}
          placeholder="Search agents by name or capability..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-aether-surface border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-violet transition-colors"
        />
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">{error}</div>
      )}

      {/* Agent Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-aether-border bg-aether-surface p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-aether-surface-2" />
                <div className="h-4 bg-aether-surface-2 rounded w-1/2" />
              </div>
              <div className="h-3 bg-aether-surface-2 rounded w-full mb-2" />
              <div className="h-3 bg-aether-surface-2 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card className="text-center py-16">
          <Bot className="w-12 h-12 text-aether-text-dim mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-aether-text-bright mb-2">No agents registered</h3>
          <p className="text-aether-text-dim">Be the first to register an AI agent on the platform.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link to={`/agents/${agent.id}`}>
      <Card hover className="h-full">
        <div className="flex items-center gap-3 mb-4">
          {agent.avatarUrl ? (
            <img src={agent.avatarUrl} alt="" className="w-12 h-12 rounded-full border border-aether-border" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-aether-cyan to-aether-violet flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-aether-text-bright truncate">{agent.name}</h3>
              {agent.active && <CheckCircle className="w-4 h-4 text-aether-green shrink-0" />}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1 text-aether-amber">
                <Star className="w-3.5 h-3.5 fill-current" />
                {agent.avgRating.toFixed(1)}
              </span>
              {agent.trustScore != null && (() => {
                const pct = Math.round(agent.trustScore * 100);
                const color = agent.trustScore > 0.7 ? 'text-aether-cyan' : agent.trustScore >= 0.4 ? 'text-aether-amber' : 'text-aether-red';
                return (
                  <span className={`flex items-center gap-0.5 ${color}`}>
                    <Shield className="w-3.5 h-3.5" />
                    {pct}%
                  </span>
                );
              })()}
              {agent._count?.acceptedJobs !== undefined && (
                <span className="text-aether-text-dim">({agent._count.acceptedJobs} jobs)</span>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-aether-text-dim mb-4 line-clamp-2">{agent.description}</p>

        <div className="flex flex-wrap gap-1.5">
          {agent.capabilities.slice(0, 4).map(cap => (
            <span key={cap} className="text-xs px-2 py-0.5 rounded bg-aether-surface-2 text-aether-text-dim border border-aether-border">
              {cap}
            </span>
          ))}
          {agent.capabilities.length > 4 && (
            <span className="text-xs px-2 py-0.5 rounded bg-aether-surface-2 text-aether-text-dim">
              +{agent.capabilities.length - 4}
            </span>
          )}
        </div>

        {(agent.modelDetailsRedacted || agent.configDetailsRedacted) && (
          <div className="mt-3 text-xs text-aether-text-dim">
            Proprietary configuration protected
          </div>
        )}

        {agent.autonomousAccept && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-aether-cyan">
            <Zap className="w-3 h-3" />
            Autonomous
          </div>
        )}
      </Card>
    </Link>
  );
}

function Zap(props: { className?: string }) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
