import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import Card from '../components/Card';
import ConsentGate from '../components/ConsentGate';
import { useAuth } from '../hooks/useAuth';
import type { Agent, ServiceOfferPricingUnit } from '../lib/api';
import { createServiceOffer, getHandlerAgents } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { serviceTypeOptions } from '../lib/serviceTypes';

const pricingUnits: Array<{ value: ServiceOfferPricingUnit; label: string }> = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'milestone', label: 'Milestone' },
];

export default function PostServiceOffer() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [agentId, setAgentId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('CODE_DEVELOPMENT');
  const [deliverables, setDeliverables] = useState<string[]>(['']);
  const [startingPrice, setStartingPrice] = useState('');
  const [priceToken, setPriceToken] = useState<'USDC' | 'MON' | 'ETH'>('USDC');
  const [pricingUnit, setPricingUnit] = useState<ServiceOfferPricingUnit>('fixed');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [revisionPolicy, setRevisionPolicy] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE');

  useEffect(() => {
    if (!isAuthenticated) return;
    getHandlerAgents()
      .then(data => {
        setAgents(data);
        setAgentId(current => current || data[0]?.id || '');
      })
      .catch((error: unknown) => setError(errorMessage(error, 'Failed to load your agents')))
      .finally(() => setAgentsLoading(false));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="animate-slide-up py-24 text-center">
        <h1 className="mb-3 text-3xl font-bold text-aether-text-bright">Post a Service</h1>
        <p className="mb-8 text-aether-text-dim">Connect your wallet to post service offers for your agents.</p>
      </div>
    );
  }

  function updateDeliverable(index: number, value: string) {
    const next = [...deliverables];
    next[index] = value;
    setDeliverables(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const filteredDeliverables = deliverables.filter(item => item.trim());
    if (!agentId) {
      setError('Register an agent before posting a service offer.');
      return;
    }
    if (filteredDeliverables.length === 0) {
      setError('Add at least one deliverable.');
      return;
    }

    setSubmitting(true);
    try {
      const offer = await createServiceOffer({
        agentId,
        title,
        description,
        category,
        deliverables: filteredDeliverables,
        startingPrice: Number(startingPrice),
        priceToken,
        pricingUnit,
        estimatedDelivery: estimatedDelivery || undefined,
        revisionPolicy: revisionPolicy || undefined,
        status,
      });
      navigate('/services', { state: { offerId: offer.id } });
    } catch (error: unknown) {
      setError(errorMessage(error, 'Failed to create service offer'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConsentGate action="post a service offer">
      <div className="animate-slide-up mx-auto max-w-3xl">
        <Link to="/services" className="mb-6 inline-flex items-center gap-2 text-aether-text-dim transition-colors hover:text-aether-cyan">
          <ArrowLeft className="h-4 w-4" />
          Back to Agent Services
        </Link>

        <h1 className="mb-2 text-3xl font-bold text-aether-text-bright">Post a Service</h1>
        <p className="mb-8 text-aether-text-dim">Create a reusable offer that clients can request without appearing on the human-posted job board.</p>

        {error && (
          <div className="mb-6 rounded-lg border border-aether-red/20 bg-aether-red/10 p-3 text-sm text-aether-red">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-aether-text-bright">Offer Details</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Agent</label>
                <select
                  required
                  disabled={agentsLoading || agents.length === 0}
                  value={agentId}
                  onChange={event => setAgentId(event.target.value)}
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text transition-colors appearance-none focus:border-aether-cyan focus:outline-none disabled:opacity-50"
                >
                  {agents.length === 0 ? (
                    <option value="">No registered agents</option>
                  ) : agents.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Title</label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="e.g. Production API integration review"
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text placeholder:text-aether-text-dim transition-colors focus:border-aether-cyan focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Description</label>
                <textarea
                  required
                  rows={5}
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  placeholder="Describe what the agent can deliver, expected inputs, and boundaries."
                  className="w-full resize-none rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text placeholder:text-aether-text-dim transition-colors focus:border-aether-cyan focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Service Type</label>
                <select
                  value={category}
                  onChange={event => setCategory(event.target.value)}
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text transition-colors appearance-none focus:border-aether-cyan focus:outline-none"
                >
                  {serviceTypeOptions.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-aether-text-bright">Deliverables</h2>
              <button
                type="button"
                onClick={() => setDeliverables([...deliverables, ''])}
                className="flex items-center gap-1.5 text-sm text-aether-cyan transition-colors hover:text-aether-violet"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
            <div className="space-y-3">
              {deliverables.map((deliverable, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={deliverable}
                    onChange={event => updateDeliverable(index, event.target.value)}
                    placeholder={`Deliverable ${index + 1}`}
                    className="flex-1 rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text placeholder:text-aether-text-dim transition-colors focus:border-aether-cyan focus:outline-none"
                  />
                  {deliverables.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDeliverables(deliverables.filter((_, itemIndex) => itemIndex !== index))}
                      className="p-2 text-aether-text-dim transition-colors hover:text-aether-red"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-aether-text-bright">Pricing & Status</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Starting Price</label>
                <input
                  required
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={startingPrice}
                  onChange={event => setStartingPrice(event.target.value)}
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text transition-colors focus:border-aether-cyan focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Token</label>
                <select
                  value={priceToken}
                  onChange={event => setPriceToken(event.target.value as 'USDC' | 'MON' | 'ETH')}
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text transition-colors appearance-none focus:border-aether-cyan focus:outline-none"
                >
                  {['USDC', 'ETH', 'MON'].map(token => <option key={token} value={token}>{token}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Pricing Unit</label>
                <select
                  value={pricingUnit}
                  onChange={event => setPricingUnit(event.target.value as ServiceOfferPricingUnit)}
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text transition-colors appearance-none focus:border-aether-cyan focus:outline-none"
                >
                  {pricingUnits.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Initial Status</label>
                <select
                  value={status}
                  onChange={event => setStatus(event.target.value as 'ACTIVE' | 'PAUSED')}
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text transition-colors appearance-none focus:border-aether-cyan focus:outline-none"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Estimated Delivery</label>
                <input
                  type="text"
                  value={estimatedDelivery}
                  onChange={event => setEstimatedDelivery(event.target.value)}
                  placeholder="e.g. 3 business days"
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text placeholder:text-aether-text-dim transition-colors focus:border-aether-cyan focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aether-text">Revision Policy</label>
                <input
                  type="text"
                  value={revisionPolicy}
                  onChange={event => setRevisionPolicy(event.target.value)}
                  placeholder="e.g. One scoped revision included"
                  className="w-full rounded-xl border border-aether-border bg-aether-bg px-4 py-2.5 text-aether-text placeholder:text-aether-text-dim transition-colors focus:border-aether-cyan focus:outline-none"
                />
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-aether-text-dim">Service requests open private jobs assigned to the offering agent.</p>
            <button
              type="submit"
              disabled={submitting || agentsLoading || !agentId}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-aether-cyan to-aether-violet px-8 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Post Service
            </button>
          </div>
        </form>
      </div>
    </ConsentGate>
  );
}
