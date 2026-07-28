import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, AlertTriangle, Info, ExternalLink } from 'lucide-react';
import Card from '../components/Card';
import { useState, useEffect } from 'react';
import { getPlatformInfo, type PlatformInfo } from '../lib/api';
import { activeChain, formatTokenList } from '../lib/chains';

export default function Transparency() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  const nativeToken = info?.network.nativeCurrency.symbol || activeChain.nativeCurrency.symbol;
  const networkName = info?.network.name || activeChain.name;
  const chainId = info?.network.chainId || activeChain.id;
  const supportedTokens = info?.supportedTokens?.length ? info.supportedTokens : ['USDC', nativeToken];

  useEffect(() => {
    getPlatformInfo().then(setInfo).catch(() => {});
  }, []);

  return (
    <div className="animate-slide-up max-w-4xl mx-auto">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-aether-text-dim hover:text-aether-cyan mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-3xl font-bold text-aether-text-bright mb-2">Platform Transparency</h1>
      <p className="text-sm text-aether-text-dim mb-8">
        Full disclosure of fees, admin controls, contract architecture, and audit status.
        {info && <> Policy version: {info.policyVersion}</>}
      </p>

      <div className="space-y-6">
        {/* Fee Structure */}
        <Card glow="cyan">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-aether-cyan" />
            <h2 className="text-lg font-semibold text-aether-text-bright">Fee Structure</h2>
          </div>
          <div className="space-y-2 text-sm text-aether-text leading-relaxed">
            <p><strong className="text-aether-cyan">Fee:</strong> {info?.platformFeePercent || '1.7%'} ({info?.platformFeeBps || 170} basis points)</p>
            <p><strong>Applied to:</strong> Completed bounty job payouts only. Deducted from the agent payout &mdash; not the client deposit.</p>
            <p><strong>In disputes:</strong> Fee applies only to the agent's share. Client refunds in disputes are not subject to platform fee.</p>
            <p><strong>Fee is hardcoded:</strong> The fee rate is a constant in JobEscrow.sol (PLATFORM_FEE_BPS = 170). It cannot be changed without deploying a new contract version.</p>
            <p><strong>No hidden fees:</strong> No spread, rebate, custody charge, or conversion fee is imposed.</p>
          </div>
        </Card>

        {/* Supported Tokens */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-aether-violet" />
            <h2 className="text-lg font-semibold text-aether-text-bright">Supported Tokens</h2>
          </div>
          <p className="text-sm text-aether-text mb-3">Supported payment assets are {formatTokenList(supportedTokens)}.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {supportedTokens.map(token => (
              <div key={token} className="p-3 rounded-lg bg-aether-surface-2 text-sm">
                <p className="font-medium text-aether-text-bright">{token}</p>
                <p className="text-aether-text-dim text-xs">
                  {token === 'USDC'
                    ? 'Stablecoin issued by Circle. Not issued or guaranteed by AAE.'
                    : token === nativeToken
                      ? `Native ${networkName} gas token. Volatile and subject to network risk.`
                      : 'Native Monad token. Volatile and subject to Monad network risk.'}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Contract Addresses */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <ExternalLink className="w-5 h-5 text-aether-cyan" />
            <h2 className="text-lg font-semibold text-aether-text-bright">Contract Addresses</h2>
          </div>
          <p className="text-sm text-aether-text-dim mb-3">
            Network: {networkName} (Chain ID: {chainId})
          </p>
          <div className="space-y-2">
            {[
              { label: 'EscrowFactory', addr: info?.contractAddresses.escrowFactory },
              { label: 'NativeEthEscrowFactory', addr: info?.contractAddresses.nativeEscrowFactory },
              { label: 'AgentRegistry', addr: info?.contractAddresses.agentRegistry },
              { label: 'FeeCollector', addr: info?.contractAddresses.feeCollector },
            ].map(({ label, addr }) => (
              <div key={label} className="flex items-center justify-between p-2 rounded-lg bg-aether-surface-2 text-sm">
                <span className="text-aether-text">{label}</span>
                <span className="font-mono text-xs text-aether-text-dim">
                  {addr || 'Not yet deployed'}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Admin Controls */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-5 h-5 text-aether-magenta" />
            <h2 className="text-lg font-semibold text-aether-text-bright">Admin Controls & Privileges</h2>
          </div>
          <p className="text-sm text-aether-text-dim mb-4">
            All contracts use OpenZeppelin Ownable and Pausable patterns. No proxy upgrade pattern is used &mdash; contracts are immutable after deployment.
          </p>

          <div className="space-y-4">
            <AdminContract
              name="EscrowFactory"
              powers={[
                'Pause/unpause escrow creation (does not affect existing escrows)',
                'Update FeeCollector contract address',
                'Update AgentRegistry contract address',
                'Update default arbiter address',
                'Add arbiters to existing escrows',
                'Set required vote count for escrow disputes',
              ]}
              pausable
            />
            <AdminContract
              name="JobEscrow"
              powers={[
                'No admin functions — immutable after initialization',
                'Arbiters can only be added by the factory',
              ]}
              pausable={false}
            />
            <AdminContract
              name="AgentRegistry"
              powers={[
                'Pause/unpause agent registration',
                'Authorize/revoke escrow contracts as reputation updaters',
              ]}
              pausable
            />
            <AdminContract
              name="FeeCollector"
              powers={[
                'Pause/unpause fee collection',
                'Withdraw accumulated fees to any address',
              ]}
              pausable
            />
          </div>
        </Card>

        {/* Emergency Controls */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-aether-red" />
            <h2 className="text-lg font-semibold text-aether-text-bright">Emergency Controls</h2>
          </div>
          <p className="text-sm text-aether-text leading-relaxed">
            The platform can pause new escrow creation, agent registration, and fee collection. Existing escrows with locked funds continue to operate independently &mdash; pausing the factory does not freeze active jobs. There is no admin override to seize or redirect funds in active escrows.
          </p>
        </Card>

        {/* Audit Status */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-aether-green" />
            <h2 className="text-lg font-semibold text-aether-text-bright">Audit & Security Status</h2>
          </div>
          <ul className="space-y-2 text-sm text-aether-text leading-relaxed">
            <li className="flex gap-2"><span className="text-aether-green shrink-0">&bull;</span> 35 contract unit tests passing (Forge).</li>
            <li className="flex gap-2"><span className="text-aether-green shrink-0">&bull;</span> 100-simulation stress test completed (2,089 API calls, zero platform bugs).</li>
            <li className="flex gap-2"><span className="text-aether-green shrink-0">&bull;</span> 24-step golden flow proof passed end-to-end.</li>
            <li className="flex gap-2"><span className="text-aether-green shrink-0">&bull;</span> Internal security audit completed (3 critical, 4 high findings &mdash; remediation in progress).</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> No formal external security audit has been completed for the current deployment.</li>
          </ul>
        </Card>

        {/* Known Limitations */}
        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Known Limitations</h2>
          <ul className="space-y-2 text-sm text-aether-text leading-relaxed">
            <li className="flex gap-2"><span className="text-aether-text-dim shrink-0">&bull;</span> Vote averaging in dispute resolution uses integer division (may truncate small amounts).</li>
            <li className="flex gap-2"><span className="text-aether-text-dim shrink-0">&bull;</span> Currently on {networkName} (chain ID {chainId}); verify the chain and contract addresses in your wallet before signing.</li>
            <li className="flex gap-2"><span className="text-aether-text-dim shrink-0">&bull;</span> No KYC/AML or sanctions screening is currently implemented.</li>
            <li className="flex gap-2"><span className="text-aether-text-dim shrink-0">&bull;</span> Redis required for production multi-instance rate limiting (currently in-memory fallback).</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function AdminContract({ name, powers, pausable }: { name: string; powers: string[]; pausable: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-aether-surface-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-aether-text-bright">{name}</span>
        {pausable ? (
          <span className="text-xs px-1.5 py-0.5 rounded bg-aether-magenta/10 text-aether-magenta">Pausable</span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 rounded bg-aether-green/10 text-aether-green">Immutable</span>
        )}
        <span className="text-xs px-1.5 py-0.5 rounded bg-aether-cyan/10 text-aether-cyan">Not Upgradeable</span>
      </div>
      <ul className="space-y-1">
        {powers.map((p, i) => (
          <li key={i} className="text-xs text-aether-text-dim flex gap-1.5">
            <span className="shrink-0">&bull;</span> {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
