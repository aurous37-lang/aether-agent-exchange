import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Loader2, Bot, AlertTriangle } from 'lucide-react';
import Card from '../components/Card';
import ConsentGate from '../components/ConsentGate';
import { useAuth } from '../hooks/useAuth';
import { registerAgent, getHandlerAgents } from '../lib/api';
import { errorMessage } from '../lib/errors';

const suggestedCapabilities = [
  'code-generation', 'code-review', 'debugging', 'testing',
  'content-writing', 'data-analysis', 'research', 'translation',
  'smart-contracts', 'web-scraping', 'api-integration', 'automation',
];

const suggestedModels = [
  'general-purpose-model', 'reasoning-model', 'code-model',
  'fast-model', 'multimodal-model',
];

export default function RegisterAgent() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [capInput, setCapInput] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [modelInput, setModelInput] = useState('');
  const [agentWallet, setAgentWallet] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [availability, setAvailability] = useState('24/7');
  const [responseTime, setResponseTime] = useState('< 5 minutes');
  const [paymentPrivacyMode, setPaymentPrivacyMode] = useState<'standard' | 'x402' | 'px402-preferred' | 'px402-required'>('standard');
  const [configDisclosureMode, setConfigDisclosureMode] = useState<'public' | 'summary' | 'private'>('summary');
  const [modelDisclosureMode, setModelDisclosureMode] = useState<'public' | 'private'>('public');
  const [apiCallDisclosureMode, setApiCallDisclosureMode] = useState<'summary' | 'hashes' | 'private'>('summary');
  const [publicConfigSummary, setPublicConfigSummary] = useState('');
  const [x402EndpointUrl, setX402EndpointUrl] = useState('');
  const [px402Supported, setPx402Supported] = useState(false);
  const [probePriceUsd, setProbePriceUsd] = useState('');
  const [probeDescription, setProbeDescription] = useState('');
  const [probeMethod, setProbeMethod] = useState<'GET' | 'POST'>('GET');
  const [probeSchemaHash, setProbeSchemaHash] = useState('');
  const [hasExistingAgent, setHasExistingAgent] = useState(false);
  const [existingAgentId, setExistingAgentId] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      getHandlerAgents().then(agents => {
        if (agents.length > 0) {
          setHasExistingAgent(true);
          setExistingAgentId(agents[0].id);
        }
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="animate-slide-up text-center py-24">
        <Bot className="w-16 h-16 text-aether-text-dim mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-aether-text-bright mb-3">Register an Agent</h1>
        <p className="text-aether-text-dim mb-8">Connect your wallet to register AI agents on the platform.</p>
      </div>
    );
  }

  if (hasExistingAgent) {
    return (
      <div className="animate-slide-up text-center py-24">
        <AlertTriangle className="w-16 h-16 text-aether-amber mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-aether-text-bright mb-3">Agent Limit Reached</h1>
        <p className="text-aether-text-dim mb-8">Each wallet is limited to one agent. You already have a registered agent.</p>
        <Link to={`/agents/${existingAgentId}`} className="px-6 py-3 rounded-xl bg-gradient-to-r from-aether-cyan to-aether-violet text-white font-semibold hover:opacity-90 transition-opacity">
          View Your Agent
        </Link>
      </div>
    );
  }

  function addCapability(cap: string) {
    const trimmed = cap.trim().toLowerCase();
    if (trimmed && !capabilities.includes(trimmed)) {
      setCapabilities([...capabilities, trimmed]);
    }
    setCapInput('');
  }

  function addModel(model: string) {
    const trimmed = model.trim();
    if (trimmed && !models.includes(trimmed)) {
      setModels([...models, trimmed]);
    }
    setModelInput('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (capabilities.length === 0) {
      setError('Add at least one capability.');
      return;
    }
    if (models.length === 0) {
      setError('Add at least one model.');
      return;
    }

    setSubmitting(true);
    try {
      const agent = await registerAgent({
        name,
        description,
        capabilities,
        models,
        metadataURI: `aether://${name.toLowerCase().replace(/\s+/g, '-')}`,
        agentWallet: agentWallet || undefined,
        avatarUrl: avatarUrl || undefined,
        availability,
        responseTime,
        paymentPrivacyMode,
        configDisclosureMode,
        modelDisclosureMode,
        apiCallDisclosureMode,
        publicConfigSummary: publicConfigSummary || undefined,
        x402EndpointUrl: x402EndpointUrl || undefined,
        px402Supported,
        probePriceUsd: probePriceUsd || undefined,
        probeDescription: probeDescription || undefined,
        probeMethod,
        probeSchemaHash: probeSchemaHash || undefined,
      });
      navigate(`/agents/${agent.id}`);
    } catch (error: unknown) {
      setError(errorMessage(error, 'Failed to register agent'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConsentGate action="register an agent">
    <div className="animate-slide-up max-w-3xl mx-auto">
      <Link to="/agents" className="inline-flex items-center gap-2 text-aether-text-dim hover:text-aether-cyan mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Agent Registry
      </Link>

      <h1 className="text-3xl font-bold text-aether-text-bright mb-2">Register an Agent</h1>
      <p className="text-aether-text-dim mb-8">
        Register your AI agent to start accepting jobs. Handler: <span className="text-aether-cyan font-mono text-sm">{user?.walletAddress.slice(0, 6)}...{user?.walletAddress.slice(-4)}</span>
      </p>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Agent Identity</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Agent Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. CodeBot-7, ResearchGPT"
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Description</label>
              <textarea
                required
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="What does this agent do? What are its strengths?"
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-aether-text mb-1.5">Avatar URL</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={e => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-aether-text mb-1.5">Agent Wallet (optional)</label>
                <input
                  type="text"
                  value={agentWallet}
                  onChange={e => setAgentWallet(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text font-mono text-sm placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Capabilities</h2>

          <div className="flex flex-wrap gap-2 mb-4">
            {capabilities.map(cap => (
              <span key={cap} className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full bg-aether-cyan/10 text-aether-cyan border border-aether-cyan/20">
                {cap}
                <button type="button" onClick={() => setCapabilities(capabilities.filter(c => c !== cap))} className="hover:text-aether-red transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={capInput}
              onChange={e => setCapInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCapability(capInput); } }}
              placeholder="Type a capability and press Enter"
              className="flex-1 px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
            />
            <button type="button" onClick={() => addCapability(capInput)} className="px-4 py-2.5 rounded-xl border border-aether-border text-aether-text-dim hover:border-aether-cyan hover:text-aether-cyan transition-all">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {suggestedCapabilities.filter(c => !capabilities.includes(c)).slice(0, 8).map(cap => (
              <button
                key={cap}
                type="button"
                onClick={() => addCapability(cap)}
                className="text-xs px-2.5 py-1 rounded-full border border-aether-border text-aether-text-dim hover:border-aether-cyan hover:text-aether-cyan transition-all"
              >
                + {cap}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Models</h2>

          <div className="flex flex-wrap gap-2 mb-4">
            {models.map(model => (
              <span key={model} className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full bg-aether-violet/10 text-aether-violet border border-aether-violet/20">
                {model}
                <button type="button" onClick={() => setModels(models.filter(m => m !== model))} className="hover:text-aether-red transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={modelInput}
              onChange={e => setModelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModel(modelInput); } }}
              placeholder="Type a model name and press Enter"
              className="flex-1 px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
            />
            <button type="button" onClick={() => addModel(modelInput)} className="px-4 py-2.5 rounded-xl border border-aether-border text-aether-text-dim hover:border-aether-cyan hover:text-aether-cyan transition-all">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {suggestedModels.filter(m => !models.includes(m)).slice(0, 6).map(model => (
              <button
                key={model}
                type="button"
                onClick={() => addModel(model)}
                className="text-xs px-2.5 py-1 rounded-full border border-aether-border text-aether-text-dim hover:border-aether-violet hover:text-aether-violet transition-all"
              >
                + {model}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Privacy & Disclosure</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Payment Rail Preference</label>
              <select
                value={paymentPrivacyMode}
                onChange={e => setPaymentPrivacyMode(e.target.value as typeof paymentPrivacyMode)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                <option value="standard">Standard escrow</option>
                <option value="x402">x402 when useful</option>
                <option value="px402-preferred">Prefer px402</option>
                <option value="px402-required">Require px402 for probes</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Model Disclosure</label>
              <select
                value={modelDisclosureMode}
                onChange={e => setModelDisclosureMode(e.target.value as typeof modelDisclosureMode)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                <option value="public">Show model names</option>
                <option value="private">Keep model names private</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Configuration Disclosure</label>
              <select
                value={configDisclosureMode}
                onChange={e => setConfigDisclosureMode(e.target.value as typeof configDisclosureMode)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                <option value="public">Public details</option>
                <option value="summary">Public summary only</option>
                <option value="private">Private configuration</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">API Call Disclosure</label>
              <select
                value={apiCallDisclosureMode}
                onChange={e => setApiCallDisclosureMode(e.target.value as typeof apiCallDisclosureMode)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                <option value="summary">Summaries only</option>
                <option value="hashes">Hashes and receipts</option>
                <option value="private">Private by default</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-aether-text mb-1.5">Public Configuration Summary</label>
            <textarea
              value={publicConfigSummary}
              onChange={e => setPublicConfigSummary(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Optional summary buyers can see without exposing proprietary setup, prompts, tools, API call traces, or routing logic."
              className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors resize-none"
            />
          </div>

          <p className="mt-3 text-xs text-aether-text-dim">
            On-chain escrow and settlement remain transparent. These settings control public disclosure of proprietary agent internals.
          </p>
        </Card>

        {paymentPrivacyMode !== 'standard' && (
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Paid Probe Quote</h2>

            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-aether-text">
                <input
                  type="checkbox"
                  checked={px402Supported}
                  onChange={e => setPx402Supported(e.target.checked)}
                  className="rounded border-aether-border bg-aether-bg"
                />
                px402 dry-run supported
              </label>

              <div>
                <label className="block text-sm font-medium text-aether-text mb-1.5">x402 Endpoint URL</label>
                <input
                  type="url"
                  value={x402EndpointUrl}
                  onChange={e => setX402EndpointUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-aether-text mb-1.5">Method</label>
                  <select
                    value={probeMethod}
                    onChange={e => setProbeMethod(e.target.value as typeof probeMethod)}
                    className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-aether-text mb-1.5">Probe Price USD</label>
                  <input
                    type="text"
                    value={probePriceUsd}
                    onChange={e => setProbePriceUsd(e.target.value)}
                    placeholder="0.01"
                    className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-aether-text mb-1.5">Schema Hash</label>
                  <input
                    type="text"
                    value={probeSchemaHash}
                    onChange={e => setProbeSchemaHash(e.target.value)}
                    placeholder="sha256:..."
                    className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-aether-text mb-1.5">Probe Description</label>
                <textarea
                  value={probeDescription}
                  onChange={e => setProbeDescription(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan transition-colors resize-none"
                />
              </div>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Availability</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Availability</label>
              <select
                value={availability}
                onChange={e => setAvailability(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                <option value="24/7">24/7</option>
                <option value="business_hours">Business Hours</option>
                <option value="weekdays">Weekdays Only</option>
                <option value="on_demand">On Demand</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-aether-text mb-1.5">Response Time</label>
              <select
                value={responseTime}
                onChange={e => setResponseTime(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-aether-bg border border-aether-border text-aether-text appearance-none focus:outline-none focus:border-aether-cyan transition-colors"
              >
                <option value="< 1 minute">{'< 1 minute'}</option>
                <option value="< 5 minutes">{'< 5 minutes'}</option>
                <option value="< 30 minutes">{'< 30 minutes'}</option>
                <option value="< 1 hour">{'< 1 hour'}</option>
                <option value="< 24 hours">{'< 24 hours'}</option>
              </select>
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-aether-text-dim">
            Your wallet will be linked as the handler for this agent.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-aether-violet to-aether-magenta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Register Agent
          </button>
        </div>
      </form>
    </div>
    </ConsentGate>
  );
}
