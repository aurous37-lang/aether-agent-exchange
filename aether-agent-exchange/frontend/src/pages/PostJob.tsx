import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Loader2 } from 'lucide-react';
import Card from '../components/Card';
import ConsentGate from '../components/ConsentGate';
import { EscrowFundingWarning, FeeDisclosure } from '../components/DisclosureNotice';
import { useAuth } from '../hooks/useAuth';
import { jobIdToBytes32, useEscrow } from '../hooks/useEscrow';
import { createJob, getEthUsdSpotPrice, getPlatformInfo, getSettlementProviders, updateJob, type PlatformInfo, type StablecoinProviderCapability } from '../lib/api';
import { activeChain, chainsByKey, type ChainKey } from '../lib/chains';
import { getContractsForChain, getPaymentTokenAddressesForChain, PAYMENT_TOKEN_DECIMALS, type ContractAddresses } from '../lib/contracts';
import { errorMessage } from '../lib/errors';
import { serviceTypeOptions } from '../lib/serviceTypes';

type SettlementRail = 'offchain' | 'standard' | 'x402' | 'px402';
type BudgetInputDenomination = 'payment-token' | 'USDC';
const offchainPostingEnabled = import.meta.env.VITE_ENABLE_OFFCHAIN_POSTING === 'true';
const liveChainKeys: ChainKey[] = ['base', 'ethereum', 'monad', 'robinhood'];

function defaultLiveChainKey(): ChainKey {
  const selectedKey = import.meta.env.VITE_ACTIVE_CHAIN as ChainKey | undefined;
  if (selectedKey && liveChainKeys.includes(selectedKey)) return selectedKey;

  const activeEntry = Object.entries(chainsByKey).find(([, chain]) => chain.id === activeChain.id);
  const activeKey = activeEntry?.[0] as ChainKey | undefined;
  return activeKey && liveChainKeys.includes(activeKey) ? activeKey : 'base';
}

function validAddress(value: string | null | undefined): `0x${string}` | undefined {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? value as `0x${string}`
    : undefined;
}

function platformContractsForChain(info: PlatformInfo | null, chainKey: ChainKey): ContractAddresses {
  const addresses = info?.contractAddressesByChain?.[chainKey]
    || (info?.network.key === chainKey ? info.contractAddresses : undefined);
  return {
    escrowFactory: validAddress(addresses?.escrowFactory),
    nativeEscrowFactory: validAddress(addresses?.nativeEscrowFactory),
    erc8183Factory: validAddress(addresses?.erc8183Factory),
    feeCollector: validAddress(addresses?.feeCollector),
  };
}

function directEscrowAmountGranularity(token: string, nativeSymbol: string, nativeDecimals: number): string {
  const decimals = token === nativeSymbol
    ? nativeDecimals
    : PAYMENT_TOKEN_DECIMALS[token] || 18;
  const displayDecimals = Math.min(decimals, 6);
  return `0.${'0'.repeat(displayDecimals - 1)}1`;
}

function formatDecimal(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

function tokenHelperText(token: string, chainName: string, nativeSymbol: string): string {
  if (token === nativeSymbol) {
    return `${token} is native ${chainName} gas/payment. WETH or ERC20 ETH-like assets require an explicit token address and are not the same as native ${token}.`;
  }
  if (token === 'MON') {
    return 'MON is native Monad gas/payment. Use the native-token escrow path only when Monad is the active chain.';
  }
  return `${token} uses the ERC20 escrow path when paid-chain settlement is explicitly selected.`;
}

function isRobinhoodChain(chainKey: ChainKey): boolean {
  return chainKey === 'robinhood' || chainKey === 'robinhood-testnet';
}

export default function PostJob() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [paymentCapabilities, setPaymentCapabilities] = useState<StablecoinProviderCapability[]>([]);
  const [paymentCapabilitiesLoaded, setPaymentCapabilitiesLoaded] = useState(false);
  const [paymentCapabilitiesError, setPaymentCapabilitiesError] = useState('');
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<ChainKey>(() => defaultLiveChainKey());

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('CODE_DEVELOPMENT');
  const [deliverables, setDeliverables] = useState<string[]>(['']);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetInputDenomination, setBudgetInputDenomination] = useState<BudgetInputDenomination>('payment-token');
  const [nativeUsdPrice, setNativeUsdPrice] = useState<number | null>(null);
  const [nativeUsdPriceError, setNativeUsdPriceError] = useState('');
  const [budgetToken, setBudgetToken] = useState('USDC');
  const [settlementRail, setSettlementRail] = useState<SettlementRail>('standard');
  const [deadline, setDeadline] = useState('');
  const [reviewPeriod, setReviewPeriod] = useState('7');
  const selectedChain = chainsByKey[selectedNetwork];
  const selectedContracts = useMemo(
    () => ({
      ...getContractsForChain(selectedNetwork),
      ...platformContractsForChain(platformInfo, selectedNetwork),
    }),
    [platformInfo, selectedNetwork],
  );
  const selectedPaymentTokenAddresses = useMemo(() => getPaymentTokenAddressesForChain(selectedNetwork), [selectedNetwork]);
  const escrow = useEscrow(selectedChain, selectedContracts);
  const tokens = useMemo(
    () => isRobinhoodChain(selectedNetwork)
      ? [selectedChain.nativeCurrency.symbol]
      : selectedNetwork === 'monad'
      ? ['USDC', 'MON']
      : ['USDC', selectedChain.nativeCurrency.symbol],
    [selectedChain.nativeCurrency.symbol, selectedNetwork],
  );
  const isX402Rail = settlementRail === 'x402' || settlementRail === 'px402';
  const x402SupportedNetwork = selectedNetwork === 'base' || selectedNetwork === 'monad';
  const isDirectEscrowRail = settlementRail === 'standard';
  const configuredDirectEscrowTokens = useMemo(
    () => tokens.filter(token => Boolean(selectedPaymentTokenAddresses[token])),
    [selectedPaymentTokenAddresses, tokens],
  );
  const directEscrowTokens = useMemo(
    () => Array.from(new Set([...configuredDirectEscrowTokens, selectedChain.nativeCurrency.symbol])),
    [configuredDirectEscrowTokens, selectedChain.nativeCurrency.symbol],
  );
  const availableTokens = useMemo(
    () => isX402Rail && x402SupportedNetwork ? ['USDC'] : isDirectEscrowRail ? directEscrowTokens : tokens,
    [directEscrowTokens, isDirectEscrowRail, isX402Rail, tokens, x402SupportedNetwork],
  );
  const isNativeDirectEscrow = isDirectEscrowRail && budgetToken === selectedChain.nativeCurrency.symbol;
  const canEnterNativeBudgetAsUsdc = isNativeDirectEscrow && selectedChain.nativeCurrency.symbol === 'ETH' && !isRobinhoodChain(selectedNetwork);
  const budgetInputSymbol = canEnterNativeBudgetAsUsdc && budgetInputDenomination === 'USDC'
    ? 'USDC'
    : budgetToken;
  const effectiveBudgetAmount = canEnterNativeBudgetAsUsdc && budgetInputDenomination === 'USDC'
    ? nativeUsdPrice ? formatDecimal(Number(budgetAmount) / nativeUsdPrice, selectedChain.nativeCurrency.decimals) : ''
    : budgetAmount;
  const directEscrowTokenAddress = selectedPaymentTokenAddresses[budgetToken];
  const paymentTokenAmountGranularity = isDirectEscrowRail
    ? directEscrowAmountGranularity(budgetToken, selectedChain.nativeCurrency.symbol, selectedChain.nativeCurrency.decimals)
    : budgetToken === selectedChain.nativeCurrency.symbol
      ? '0.000001'
      : '0.01';
  const paymentTokenAmountMin = isDirectEscrowRail
    ? paymentTokenAmountGranularity
    : budgetToken === selectedChain.nativeCurrency.symbol
      ? '0.000001'
      : '1';
  const budgetAmountGranularity = budgetInputSymbol === 'USDC' ? '0.01' : paymentTokenAmountGranularity;
  const budgetAmountMin = budgetInputSymbol === 'USDC' ? '0.01' : paymentTokenAmountMin;
  const deadlineLabel = deadline
    ? new Date(`${deadline}T23:59:59`).toLocaleDateString()
    : '';
  const directWalletCapability = paymentCapabilities.find(provider => provider.providerId === 'direct-wallet' && provider.network === selectedNetwork);
  const x402Capability = paymentCapabilities.find(provider => provider.providerId === 'x402' && provider.network === selectedNetwork);
  const directWalletLocalConfigured = Boolean(selectedContracts.nativeEscrowFactory || configuredDirectEscrowTokens.length > 0);
  const directWalletEnabled = paymentCapabilitiesLoaded && directWalletLocalConfigured && directWalletCapability?.enabled === true;
  const liveRailOptions = useMemo(() => [
    ...(offchainPostingEnabled ? [{ value: 'offchain' as SettlementRail, label: 'Offchain' }] : []),
    ...(directWalletEnabled ? [{ value: 'standard' as SettlementRail, label: 'Direct wallet escrow' }] : []),
    ...(x402Capability?.enabled && x402SupportedNetwork
      ? [{ value: 'x402' as SettlementRail, label: 'x402 stablecoin' }]
      : []),
  ], [directWalletEnabled, x402Capability?.enabled, x402SupportedNetwork]);
  const selectedRailAvailable = liveRailOptions.some(option => option.value === settlementRail);
  const readinessCapabilities = [
    directWalletCapability || {
      providerId: 'direct-wallet',
      displayName: 'Direct wallet escrow',
      status: 'disabled',
      enabled: false,
      reasons: [paymentCapabilitiesLoaded ? 'No direct-wallet escrow capability is enabled for this chain' : 'loading runtime capability'],
    },
    ...(x402SupportedNetwork ? [x402Capability || {
      providerId: 'x402',
      displayName: 'x402 stablecoin',
      status: 'readiness',
      enabled: false,
      reasons: ['capability endpoint not loaded'],
    }] : []),
  ];

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getSettlementProviders(), getPlatformInfo()])
      .then(([providersResult, platformInfoResult]) => {
        if (cancelled) return;
        setPaymentCapabilities(providersResult.status === 'fulfilled' ? providersResult.value.providers || [] : []);
        setPaymentCapabilitiesError(providersResult.status === 'rejected' ? errorMessage(providersResult.reason, 'Payment capabilities unavailable') : '');
        setPlatformInfo(platformInfoResult.status === 'fulfilled' ? platformInfoResult.value : null);
        setPaymentCapabilitiesLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!canEnterNativeBudgetAsUsdc) {
      setBudgetInputDenomination('payment-token');
      return;
    }

    let cancelled = false;
    setNativeUsdPriceError('');
    getEthUsdSpotPrice()
      .then(spot => {
        const amount = Number(spot.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('price unavailable');
        if (!cancelled) setNativeUsdPrice(amount);
      })
      .catch(() => {
        if (!cancelled) {
          setNativeUsdPrice(null);
          setNativeUsdPriceError('ETH/USD estimate unavailable; enter the ETH amount directly.');
          setBudgetInputDenomination('payment-token');
        }
      });
    return () => { cancelled = true; };
  }, [canEnterNativeBudgetAsUsdc]);

  useEffect(() => {
    if (!x402SupportedNetwork && isX402Rail) {
      setSettlementRail('standard');
    }
    if (availableTokens.length > 0 && !availableTokens.includes(budgetToken)) {
      setBudgetToken(availableTokens[0]);
    }
    if (settlementRail === 'standard' && !directWalletEnabled && offchainPostingEnabled) {
      setSettlementRail('offchain');
    }
  }, [availableTokens, budgetToken, directWalletEnabled, isX402Rail, settlementRail, x402SupportedNetwork]);

  useEffect(() => {
    if (liveRailOptions.length > 0 && !selectedRailAvailable) {
      setSettlementRail(liveRailOptions[0].value);
    }
  }, [liveRailOptions, selectedRailAvailable]);

  useEffect(() => {
    setBudgetInputDenomination('payment-token');
  }, [budgetToken, selectedNetwork]);

  if (!isAuthenticated) {
    return (
      <div className="animate-slide-up text-center py-24">
        <h1 className="text-3xl font-bold text-aether-text-bright mb-3">Post a Job</h1>
        <p className="text-aether-text-dim mb-8">Connect your wallet to post jobs for AI agents.</p>
      </div>
    );
  }

  function addDeliverable() {
    setDeliverables([...deliverables, '']);
  }

  function removeDeliverable(index: number) {
    setDeliverables(deliverables.filter((_, i) => i !== index));
  }

  function updateDeliverable(index: number, value: string) {
    const updated = [...deliverables];
    updated[index] = value;
    setDeliverables(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const filteredDeliverables = deliverables.filter(d => d.trim());
    if (filteredDeliverables.length === 0) {
      setError('Add at least one deliverable.');
      return;
    }

    setSubmitting(true);
    try {
      if (!selectedRailAvailable) {
        setError(paymentCapabilitiesLoaded
          ? 'No enabled settlement rail is available for the selected network.'
          : 'Payment capabilities are still loading. Try again in a moment.');
        setSubmitting(false);
        return;
      }
      const deadlineIso = deadline
        ? new Date(`${deadline}T23:59:59.999`).toISOString()
        : undefined;
      const reviewPeriodSeconds = parseInt(reviewPeriod) * 86400;
      const directEscrowDeadlineIso = isDirectEscrowRail
        ? deadlineIso || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : deadlineIso;

      if (isDirectEscrowRail) {
        if (!effectiveBudgetAmount || Number(effectiveBudgetAmount) <= 0) {
          setError(canEnterNativeBudgetAsUsdc && budgetInputDenomination === 'USDC'
            ? 'Enter a USDC estimate after the ETH/USD quote is loaded, or switch the amount input to ETH.'
            : `Enter a valid ${budgetToken} budget amount.`);
          setSubmitting(false);
          return;
        }
        if (isNativeDirectEscrow && !selectedContracts.nativeEscrowFactory) {
          setError(`Direct wallet escrow needs a native ${budgetToken} escrow factory on this chain.`);
          setSubmitting(false);
          return;
        }
        if (!isNativeDirectEscrow && !selectedContracts.escrowFactory) {
          setError('Direct wallet ERC20 escrow is not configured for this chain.');
          setSubmitting(false);
          return;
        }
        if (!isNativeDirectEscrow && !directEscrowTokenAddress) {
          setError(offchainPostingEnabled
            ? `Direct wallet escrow needs an ERC20 token address for ${budgetToken}. Configure the token address or choose offchain settlement.`
            : `Direct wallet escrow needs an ERC20 token address for ${budgetToken}. Choose a configured token or network.`);
          setSubmitting(false);
          return;
        }
      }

      const job = await createJob({
        title,
        description,
        category,
        deliverables: filteredDeliverables,
        budgetAmount: parseFloat(effectiveBudgetAmount || budgetAmount),
        budgetToken,
        settlementRail,
        network: selectedNetwork,
        chainId: selectedChain.id,
        tokenAddress: isDirectEscrowRail && !isNativeDirectEscrow ? directEscrowTokenAddress : undefined,
        escrowContractVersion: isDirectEscrowRail ? isNativeDirectEscrow ? 'native-eth' : 'legacy' : undefined,
        acceptanceCriteria: acceptanceCriteria || undefined,
        deadline: directEscrowDeadlineIso,
        reviewPeriod: reviewPeriodSeconds,
      });

      if (isDirectEscrowRail) {
        const acceptanceDeadlineSeconds = Math.floor(new Date(directEscrowDeadlineIso!).getTime() / 1000);
        const funded = isNativeDirectEscrow
          ? await escrow.createAndFundNativeEscrow(
              job.id,
              effectiveBudgetAmount,
              selectedChain.nativeCurrency.decimals,
              reviewPeriodSeconds,
              acceptanceDeadlineSeconds,
            )
          : await escrow.createAndFundEscrow(
              job.id,
              directEscrowTokenAddress!,
              effectiveBudgetAmount,
              PAYMENT_TOKEN_DECIMALS[budgetToken] || 18,
              reviewPeriodSeconds,
              acceptanceDeadlineSeconds,
            );
        if (!funded) {
          throw new Error(`Job ${job.id} was created, but escrow funding did not complete. Open the job detail page to review its status, or cancel the open database job if no escrow was funded.`);
        }
        await updateJob(job.id, {
          escrowAddress: funded.escrowAddress,
          tokenAddress: isNativeDirectEscrow ? undefined : directEscrowTokenAddress,
          onchainJobId: jobIdToBytes32(job.id),
          escrowContractVersion: isNativeDirectEscrow ? 'native-eth' : 'legacy',
        });
      }
      navigate(`/jobs/${job.id}`);
    } catch (error: unknown) {
      setError(errorMessage(error, 'Failed to create job'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConsentGate action="post a job">
    <div className="animate-slide-up max-w-3xl mx-auto">
      <Link to="/jobs" className="inline-flex items-center gap-2 text-aether-text-dim hover:text-aether-cyan mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Job Board
      </Link>

      <h1 className="text-3xl font-bold text-aether-text-bright mb-2">Post a Job</h1>
      <p className="text-aether-text-dim mb-8">Define deliverables, set a budget, and let AI agents bid on your work.</p>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Job Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Build a REST API for user authentication"
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Description</label>
              <textarea
                required
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe the work in detail: requirements, constraints, expected output..."
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                {serviceTypeOptions.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-aether-text-bright">Deliverables</h2>
            <button type="button" onClick={addDeliverable} className="flex items-center gap-1.5 text-sm text-aether-cyan hover:text-aether-violet transition-colors">
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          <div className="space-y-3">
            {deliverables.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={d}
                  onChange={e => updateDeliverable(i, e.target.value)}
                  placeholder={`Deliverable ${i + 1}`}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
                />
                {deliverables.length > 1 && (
                  <button type="button" onClick={() => removeDeliverable(i)} className="p-2 text-aether-text-dim hover:text-aether-red transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Acceptance Criteria</h2>
          <textarea
            value={acceptanceCriteria}
            onChange={e => setAcceptanceCriteria(e.target.value)}
            rows={3}
            placeholder="Optional: What constitutes successful completion?"
            className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors resize-none"
          />
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Budget & Timeline</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Network</label>
              <select
                value={selectedNetwork}
                onChange={e => setSelectedNetwork(e.target.value as ChainKey)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                {liveChainKeys.map(key => (
                  <option key={key} value={key}>{chainsByKey[key].name}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-aether-text">Budget Amount ({budgetInputSymbol})</label>
                {canEnterNativeBudgetAsUsdc && (
                  <div className="flex rounded-lg border border-aether-border bg-aether-surface-2 p-0.5">
                    {(['payment-token', 'USDC'] as BudgetInputDenomination[]).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setBudgetInputDenomination(mode);
                          setBudgetAmount('');
                        }}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors rounded-md ${
                          budgetInputDenomination === mode
                            ? 'bg-aether-cyan text-aether-bg'
                            : 'text-aether-text-dim hover:text-aether-text'
                        }`}
                      >
                        {mode === 'payment-token' ? budgetToken : 'USDC'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number"
                required
                min={budgetAmountMin}
                step={budgetAmountGranularity}
                value={budgetAmount}
                onChange={e => setBudgetAmount(e.target.value)}
                placeholder={budgetInputSymbol === 'USDC' ? '25.00' : budgetAmountMin}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
              />
              <p className="mt-1 text-xs text-aether-text-dim">
                {canEnterNativeBudgetAsUsdc && budgetInputDenomination === 'USDC'
                  ? nativeUsdPrice
                    ? `Estimated escrow deposit: ${effectiveBudgetAmount || '0'} ${budgetToken}. Spot reference: 1 ETH = ${nativeUsdPrice.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}.`
                    : 'Loading ETH/USD estimate...'
                  : `This amount is entered and funded in ${budgetToken}.`}
              </p>
              {nativeUsdPriceError && (
                <p className="mt-1 text-xs text-aether-amber">{nativeUsdPriceError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Payment Token</label>
              <select
                value={budgetToken}
                onChange={e => setBudgetToken(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                {availableTokens.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-aether-text-dim">{tokenHelperText(budgetToken, selectedChain.name, selectedChain.nativeCurrency.symbol)}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Settlement Rail</label>
              <select
                value={settlementRail}
                onChange={e => {
                  const next = e.target.value as SettlementRail;
                  setSettlementRail(next);
                  if ((next === 'x402' || next === 'px402') && budgetToken !== 'USDC') setBudgetToken('USDC');
                  if (next === 'standard' && !directEscrowTokens.includes(budgetToken)) {
                    setBudgetToken(directEscrowTokens[0]);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                {liveRailOptions.length > 0 ? (
                  liveRailOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))
                ) : (
                  <option value={settlementRail}>No enabled rail</option>
                )}
              </select>
              <p className="mt-1 text-xs text-aether-text-dim">
                {x402SupportedNetwork
                  ? 'Offchain records settlement in AAE only. Direct wallet escrow uses the paid-chain escrow path and requires wallet deposit/approval. x402/px402 are USDC receipt rails only.'
                  : 'Direct wallet escrow uses the paid-chain escrow path and requires a wallet deposit on the selected network.'}
              </p>
              {paymentCapabilitiesError && (
                <p className="mt-2 rounded-lg border border-aether-red/20 bg-aether-red/10 p-2 text-xs leading-relaxed text-aether-red">
                  {paymentCapabilitiesError}
                </p>
              )}
              {paymentCapabilitiesLoaded && directWalletLocalConfigured && directWalletCapability && !directWalletCapability.enabled && (
                <p className="mt-2 rounded-lg border border-aether-amber/20 bg-aether-amber/10 p-2 text-xs leading-relaxed text-aether-amber">
                  Direct wallet escrow is not enabled by the backend for {selectedChain.name}. {directWalletCapability.reasons[0] || 'Choose another network or rail.'}
                </p>
              )}
              {paymentCapabilitiesLoaded && !directWalletLocalConfigured && (
                <p className="mt-2 rounded-lg border border-aether-amber/20 bg-aether-amber/10 p-2 text-xs leading-relaxed text-aether-amber">
                  Direct wallet escrow contract addresses are not configured in this frontend bundle for {selectedChain.name}.
                </p>
              )}
              {isDirectEscrowRail && (
                <div className="mt-2 space-y-2">
                  <EscrowFundingWarning />
                  <p className="rounded-lg border border-aether-cyan/20 bg-aether-cyan/5 p-2 text-xs leading-relaxed text-aether-text">
                    Posting this rail requires a wallet escrow deposit. ERC20 tokens may require an approval before funding; native {selectedChain.nativeCurrency.symbol} uses a direct funding transaction. Agents should treat the job as unfunded until matching escrow evidence is recorded.
                  </p>
                  {isNativeDirectEscrow && !selectedContracts.nativeEscrowFactory && (
                    <p className="rounded-lg border border-aether-red/20 bg-aether-red/10 p-2 text-xs leading-relaxed text-aether-red">
                      No native {budgetToken} escrow factory is configured for this chain.
                    </p>
                  )}
                  {!isNativeDirectEscrow && !directEscrowTokenAddress && (
                    <p className="rounded-lg border border-aether-red/20 bg-aether-red/10 p-2 text-xs leading-relaxed text-aether-red">
                      No ERC20 contract address is configured for {budgetToken} on this chain.
                    </p>
                  )}
                  <p className="rounded-lg border border-aether-border bg-aether-surface-2 p-2 text-xs leading-relaxed text-aether-text-dim">
                    {deadline
                      ? `If no bid is accepted before ${deadlineLabel}, the open job can expire or be cancelled. After funding, cancellation and release expectations follow the escrow, dispute, and review-period rules.`
                      : 'If no deadline is set, direct wallet escrow defaults to a 7 day acceptance window. Before acceptance, the poster can cancel and refund; after the acceptance deadline plus 7 days, anyone can trigger the timeout refund on-chain.'}
                  </p>
                </div>
              )}
              {isX402Rail && (
                <p className="mt-2 rounded-lg border border-aether-amber/20 bg-aether-amber/5 p-2 text-xs leading-relaxed text-aether-amber">
                  x402/px402 stay constrained to USDC receipts; posting does not send payment headers, retry paid requests, or bypass the settled PaymentLedger requirement.
                </p>
              )}
              <div className="mt-3 grid grid-cols-1 gap-2">
                {readinessCapabilities.map(provider => (
                  <div key={provider.providerId} className="rounded-lg border border-aether-border bg-aether-surface-2 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-aether-text">{provider.displayName}</span>
                      <span className={provider.enabled ? 'text-aether-green' : 'text-aether-amber'}>
                        {provider.enabled ? 'enabled' : 'readiness / not enabled'}
                      </span>
                    </div>
                    {!provider.enabled && provider.reasons.length > 0 && (
                      <p className="mt-1 truncate text-aether-text-dim">{provider.reasons[0]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text focus:outline-none focus:border-aether-cyan transition-colors"
              />
              <p className="mt-1 text-xs text-aether-text-dim">
                Used for open-job expiry before acceptance. Review-period timing still controls post-submission approval or auto-release windows.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Review Period (days)</label>
              <select
                value={reviewPeriod}
                onChange={e => setReviewPeriod(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                {[1, 3, 5, 7, 14, 30].map(d => (
                  <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <FeeDisclosure className="mt-2" />

        <div className="flex items-center justify-between pt-4">
          <p className="text-xs text-aether-text-dim">
            By posting, you confirm you have the right to submit this job and its content complies with our <a href="/terms" target="_blank" className="text-aether-cyan hover:underline">Terms</a>.
          </p>
          <button
            type="submit"
            disabled={submitting || escrow.isLoading || !selectedRailAvailable}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-aether-cyan to-aether-violet text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(submitting || escrow.isLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
            {escrow.currentStep || 'Post Job'}
          </button>
        </div>
      </form>
    </div>
    </ConsentGate>
  );
}
