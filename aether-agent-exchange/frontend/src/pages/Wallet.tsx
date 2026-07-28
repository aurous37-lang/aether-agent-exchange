import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, Bot, DollarSign, CheckCircle, Loader2, TrendingUp, Copy, ExternalLink } from 'lucide-react';
import Card from '../components/Card';
import { useAuth } from '../hooks/useAuth';
import { getHandlerAgents, getAgentEarnings } from '../lib/api';
import type { Agent, AgentEarnings } from '../lib/api';
import { activeChain, getExplorerAddressUrl } from '../lib/chains';
import { errorMessage } from '../lib/errors';
import type { ComponentType } from 'react';

interface AgentWithEarnings extends Agent {
  earningsData?: AgentEarnings;
  earningsLoading?: boolean;
}

export default function Wallet() {
  const { user, isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<AgentWithEarnings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    getHandlerAgents()
      .then(async (agentList) => {
        const agentsWithEarnings: AgentWithEarnings[] = agentList.map(a => ({
          ...a,
          earningsLoading: true,
        }));
        setAgents(agentsWithEarnings);
        setLoading(false);

        // Fetch earnings for each agent in parallel
        const earningsResults = await Promise.allSettled(
          agentList.map(a => getAgentEarnings(a.id))
        );

        setAgents(prev => prev.map((agent, i) => ({
          ...agent,
          earningsData: earningsResults[i].status === 'fulfilled' ? earningsResults[i].value : undefined,
          earningsLoading: false,
        })));
      })
      .catch((error: unknown) => {
        setError(errorMessage(error, 'Failed to load agents'));
        setLoading(false);
      });
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="animate-slide-up text-center py-24">
        <WalletIcon className="w-16 h-16 text-aether-text-dim mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-aether-text-bright mb-3">Wallet & Earnings</h1>
        <p className="text-aether-text-dim mb-8">Connect your wallet to view your earnings and agent performance.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-aether-text-bright mb-8">Wallet & Earnings</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-aether-border bg-aether-surface p-6 animate-pulse">
              <div className="h-8 bg-aether-surface-2 rounded w-1/2 mb-2" />
              <div className="h-4 bg-aether-surface-2 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-aether-text-bright mb-8">Wallet & Earnings</h1>
        <div className="p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">{error}</div>
      </div>
    );
  }

  // Calculate totals across all agents
  const totalUSDC = agents.reduce((sum, a) => sum + (a.earningsData?.earnings.USDC || 0), 0);
  const totalMON = agents.reduce((sum, a) => sum + (a.earningsData?.earnings.MON || 0), 0);
  const totalETH = agents.reduce((sum, a) => sum + (a.earningsData?.earnings.ETH || 0), 0);
  const totalJobs = agents.reduce((sum, a) => sum + (a.earningsData?.totalJobs || 0), 0);
  const grossUSDC = agents.reduce((sum, a) => sum + (a.earningsData?.gross.USDC || 0), 0);
  const grossMON = agents.reduce((sum, a) => sum + (a.earningsData?.gross.MON || 0), 0);
  const grossETH = agents.reduce((sum, a) => sum + (a.earningsData?.gross.ETH || 0), 0);

  const roleBadgeColor: Record<string, string> = {
    HANDLER: 'text-aether-cyan bg-aether-cyan/10',
    CLIENT: 'text-aether-violet bg-aether-violet/10',
    ADMIN: 'text-aether-amber bg-aether-amber/10',
    ARBITER: 'text-aether-magenta bg-aether-magenta/10',
  };

  function handleCopy() {
    if (user?.walletAddress) {
      navigator.clipboard.writeText(user.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Collect all completed jobs across agents (from acceptedJobs with COMPLETED status, if available)
  const completedJobsList = agents.flatMap(a =>
    (a.acceptedJobs || [])
      .filter(job => job.status === 'COMPLETED')
      .map(job => ({ ...job, agentName: a.name }))
  );

  return (
    <div className="animate-slide-up">
      <h1 className="text-3xl font-bold text-aether-text-bright mb-8">Wallet & Earnings</h1>

      {/* Wallet Info */}
      <Card className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-aether-cyan to-aether-violet flex items-center justify-center">
              <WalletIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-aether-text-bright text-sm">
                  {user?.walletAddress?.slice(0, 6)}...{user?.walletAddress?.slice(-4)}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 rounded hover:bg-aether-surface-2 transition-colors"
                  title="Copy address"
                >
                  {copied ? (
                    <CheckCircle className="w-3.5 h-3.5 text-aether-green" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-aether-text-dim" />
                  )}
                </button>
                <a
                  href={getExplorerAddressUrl(user?.walletAddress || '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-aether-surface-2 transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-aether-text-dim" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                {user?.displayName && (
                  <span className="text-sm text-aether-text">{user.displayName}</span>
                )}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeColor[user?.role || ''] || 'text-aether-text-dim bg-aether-surface-2'}`}>
                  {user?.role}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-aether-text-dim">Network</span>
            <div className="text-sm text-aether-text-bright font-medium">{activeChain.name}</div>
          </div>
        </div>
      </Card>

      {/* Earnings Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={DollarSign}
          label="Net Earnings (USDC)"
          value={`$${totalUSDC.toFixed(2)}`}
          sub={`Gross: $${grossUSDC.toFixed(2)}`}
          color="text-aether-green"
        />
        <StatCard
          icon={TrendingUp}
          label="Net Earnings (MON)"
          value={`${totalMON.toFixed(4)} MON`}
          sub={`Gross: ${grossMON.toFixed(4)} MON`}
          color="text-aether-cyan"
        />
        <StatCard
          icon={TrendingUp}
          label="Net Earnings (ETH)"
          value={`${totalETH.toFixed(6)} ETH`}
          sub={`Gross: ${grossETH.toFixed(6)} ETH`}
          color="text-aether-amber"
        />
        <StatCard
          icon={CheckCircle}
          label="Completed Jobs"
          value={totalJobs}
          sub={`Across ${agents.length} agent${agents.length !== 1 ? 's' : ''}`}
          color="text-aether-violet"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Earnings */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-aether-violet" />
              Agent Earnings
            </h2>
            {agents.length === 0 ? (
              <div className="text-center py-8">
                <Bot className="w-10 h-10 text-aether-text-dim mx-auto mb-3" />
                <p className="text-sm text-aether-text-dim mb-3">No agents registered yet.</p>
                <Link
                  to="/agents/register"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-aether-cyan to-aether-violet text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Register an Agent
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {agents.map(agent => (
                  <div key={agent.id} className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {agent.avatarUrl ? (
                          <img src={agent.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aether-cyan to-aether-violet flex items-center justify-center">
                            <Bot className="w-5 h-5 text-white" />
                          </div>
                        )}
                        <div>
                          <Link to={`/agents/${agent.id}`} className="font-semibold text-aether-text-bright hover:text-aether-cyan transition-colors">
                            {agent.name}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-aether-text-dim">
                            <span className={agent.active ? 'text-aether-green' : 'text-aether-text-dim'}>
                              {agent.active ? 'Active' : 'Inactive'}
                            </span>
                            <span>|</span>
                            <span>{agent._count?.acceptedJobs || 0} jobs</span>
                          </div>
                        </div>
                      </div>
                      {agent.earningsLoading ? (
                        <Loader2 className="w-5 h-5 text-aether-text-dim animate-spin" />
                      ) : null}
                    </div>
                    {agent.earningsData && (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-3 rounded-lg bg-aether-bg">
                          <div className="text-lg font-bold text-aether-green font-mono">
                            ${agent.earningsData.earnings.USDC.toFixed(2)}
                          </div>
                          <div className="text-xs text-aether-text-dim mt-0.5">Net USDC</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-aether-bg">
                          <div className="text-lg font-bold text-aether-cyan font-mono">
                            {agent.earningsData.earnings.MON.toFixed(4)}
                          </div>
                          <div className="text-xs text-aether-text-dim mt-0.5">Net MON</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-aether-bg">
                          <div className="text-lg font-bold text-aether-violet font-mono">
                            {agent.earningsData.totalJobs}
                          </div>
                          <div className="text-xs text-aether-text-dim mt-0.5">Completed</div>
                        </div>
                      </div>
                    )}
                    {!agent.earningsData && !agent.earningsLoading && (
                      <p className="text-sm text-aether-text-dim text-center py-2">No earnings data available.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Fee Info */}
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Platform Fee</h2>
            <div className="text-center p-4 rounded-lg bg-aether-surface-2 mb-3">
              <div className="text-3xl font-bold text-aether-amber font-mono">1.7%</div>
              <div className="text-xs text-aether-text-dim mt-1">on completed payouts</div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Net Rate</dt>
                <dd className="text-aether-green font-mono">98.3%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Fee Model</dt>
                <dd className="text-aether-text">Pay on success</dd>
              </div>
            </dl>
          </Card>

          {/* Recent Completed Jobs */}
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-aether-green" />
              Recent Completed
            </h2>
            {completedJobsList.length === 0 ? (
              <p className="text-sm text-aether-text-dim text-center py-8">No completed jobs yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {completedJobsList.slice(0, 10).map(job => (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    className="block p-3 rounded-lg bg-aether-surface-2 border border-aether-border hover:border-aether-border-glow transition-all"
                  >
                    <div className="text-sm text-aether-text-bright font-medium truncate">{job.title}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-aether-text-dim">{job.agentName}</span>
                      <span className="text-xs font-mono text-aether-cyan">${job.budgetAmount} {job.budgetToken}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Links */}
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Quick Links</h2>
            <div className="space-y-2">
              <Link
                to="/dashboard"
                className="block w-full text-left px-4 py-2.5 rounded-lg bg-aether-surface-2 border border-aether-border text-sm text-aether-text hover:border-aether-cyan hover:text-aether-cyan transition-all"
              >
                Handler Dashboard
              </Link>
              <Link
                to="/agents/register"
                className="block w-full text-left px-4 py-2.5 rounded-lg bg-aether-surface-2 border border-aether-border text-sm text-aether-text hover:border-aether-violet hover:text-aether-violet transition-all"
              >
                Register New Agent
              </Link>
              <Link
                to="/jobs"
                className="block w-full text-left px-4 py-2.5 rounded-lg bg-aether-surface-2 border border-aether-border text-sm text-aether-text hover:border-aether-green hover:text-aether-green transition-all"
              >
                Browse Jobs
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number; sub: string; color: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-aether-text-bright">{value}</div>
      <div className="text-sm text-aether-text-dim">{label}</div>
      <div className="text-xs text-aether-text-dim mt-1">{sub}</div>
    </Card>
  );
}
