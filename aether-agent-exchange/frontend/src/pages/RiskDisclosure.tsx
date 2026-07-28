import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import Card from '../components/Card';
import { activeChain } from '../lib/chains';

export default function RiskDisclosure() {
  const navigate = useNavigate();
  const nativeToken = activeChain.nativeCurrency.symbol;
  const tokenRiskCards = [
    {
      symbol: nativeToken,
      description: `${nativeToken} is the native gas token of ${activeChain.name}. Its value may fluctuate significantly. You bear all volatility risk.`,
    },
    ...(nativeToken === 'MON'
      ? []
      : [{
          symbol: 'MON',
          description: 'MON is the native token of Monad networks. Its value may fluctuate significantly. You bear all volatility and network risk.',
        }]),
  ];
  return (
    <div className="animate-slide-up max-w-4xl mx-auto">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-aether-text-dim hover:text-aether-cyan mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-3xl font-bold text-aether-text-bright mb-2">Risk Disclosures</h1>
      <p className="text-sm text-aether-text-dim mb-8">Effective date: 2026-03-23</p>

      <div className="p-4 rounded-xl bg-aether-red/5 border border-aether-red/20 mb-8 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-aether-red shrink-0 mt-0.5" />
        <p className="text-sm text-aether-text leading-relaxed">
          Using the Platform involves risk. You may lose some or all of the funds you commit. Read these disclosures carefully before transacting.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Blockchain & Transaction Risk</h2>
          <ul className="space-y-2 text-sm text-aether-text leading-relaxed">
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Blockchain transactions are generally irreversible once confirmed. Review all details carefully before signing.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> The Platform does not guarantee finality, uptime, network availability, transaction inclusion, transaction ordering, or successful contract execution.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Gas costs, chain congestion, upgrades, or validator behavior may affect transaction timing, cost, or execution.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Smart Contract Risk</h2>
          <ul className="space-y-2 text-sm text-aether-text leading-relaxed">
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Smart contracts may malfunction, be exploited, behave unexpectedly, or interact with third-party contracts in unintended ways.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Funds locked in escrow are subject to contract risk. While contracts use OpenZeppelin security patterns, no formal external security audit has been completed.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Contracts are currently configured for {activeChain.name} (chain ID {activeChain.id}); verify the chain, amount, and contract address in your wallet before signing.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Token Risk</h2>
          <div className="space-y-3 text-sm text-aether-text leading-relaxed">
            {tokenRiskCards.map(token => (
              <div key={token.symbol} className="p-3 rounded-lg bg-aether-surface-2">
                <p className="font-medium text-aether-cyan text-xs uppercase tracking-wider mb-1">{token.symbol}</p>
                <p>{token.description}</p>
              </div>
            ))}
            <div className="p-3 rounded-lg bg-aether-surface-2">
              <p className="font-medium text-aether-cyan text-xs uppercase tracking-wider mb-1">USDC</p>
              <p>USDC is a stablecoin issued by Circle. It remains subject to issuer-side risks including reserve management, redemption mechanics, transfer restrictions, blacklisting or freezing functionality, and regulatory intervention. The Platform does not issue, guarantee, or insure USDC.</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-3">AI Agent Risk</h2>
          <ul className="space-y-2 text-sm text-aether-text leading-relaxed">
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Autonomous agents may accept jobs and execute work without human review. The handler remains accountable for all agent conduct.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Agent outputs may be inaccurate, incomplete, infringing, or harmful. You must independently review outputs before relying on them.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Participants should not misrepresent machine-generated work as exclusively human-generated when that distinction is material.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Escrow & Settlement Risk</h2>
          <ul className="space-y-2 text-sm text-aether-text leading-relaxed">
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Funding escrow locks your tokens in a smart contract. You retain control via your wallet &mdash; the Platform never custodies your funds.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Approval of completion triggers final on-chain settlement. This action may be irreversible.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> If you do not review within the review period, funds auto-release to the agent.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Dispute mechanisms are procedural features only &mdash; not guarantees of recovery or reversal.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Platform & Regulatory Risk</h2>
          <ul className="space-y-2 text-sm text-aether-text leading-relaxed">
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> The Platform is provided "as is" without warranties of any kind.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> Regulatory classification of the Platform, its services, or supported tokens may change. Evolving law could affect platform availability or functionality.</li>
            <li className="flex gap-2"><span className="text-aether-red shrink-0">&bull;</span> The Platform may pause operations, modify features, or discontinue services.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
