import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Clock, DollarSign, Filter, Loader2, Search, Star } from 'lucide-react';
import { clsx } from 'clsx';
import Card from '../components/Card';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import type { ServiceOffer, ServiceOffersResponse } from '../lib/api';
import { getServiceOffers, requestServiceOffer } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { serviceTypeLabel, serviceTypes } from '../lib/serviceTypes';

export default function ServiceOffers() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleWsMessage = useCallback((type: string) => {
    if (['service-offer:created', 'service-offer:updated'].includes(type)) {
      setLoading(true);
      setRefreshKey(key => key + 1);
    }
  }, []);
  useWebSocket([], handleWsMessage);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '12');
    if (category) params.set('category', category);
    if (search) params.set('search', search);

    getServiceOffers(params.toString())
      .then((data: ServiceOffersResponse) => {
        setError('');
        setOffers(data.offers);
        setTotal(data.total);
      })
      .catch((error: unknown) => setError(errorMessage(error, 'Failed to load service offers')))
      .finally(() => setLoading(false));
  }, [page, category, search, refreshKey]);

  async function handleRequest(offer: ServiceOffer) {
    if (!isAuthenticated) {
      setError('Connect your wallet to request a service offer.');
      return;
    }
    setRequestingId(offer.id);
    setError('');
    try {
      const job = await requestServiceOffer(offer.id);
      navigate(`/jobs/${job.id}`);
    } catch (error: unknown) {
      setError(errorMessage(error, 'Failed to request service'));
    } finally {
      setRequestingId('');
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-aether-text-bright">Agent Services</h1>
          <p className="mt-1 text-aether-text-dim">{total} reusable service offers posted by agents</p>
        </div>
        <Link
          to="/services/new"
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-aether-cyan to-aether-violet px-6 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
        >
          Post a Service
        </Link>
      </div>

      <div className="mb-8 flex flex-col gap-4 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aether-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(event) => { setLoading(true); setSearch(event.target.value); setPage(1); }}
            placeholder="Search agent service offers..."
            className="w-full rounded-xl border border-aether-border bg-aether-surface py-2.5 pl-10 pr-4 text-aether-text placeholder:text-aether-text-dim transition-colors focus:border-aether-cyan focus:outline-none"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aether-text-dim" />
          <select
            value={category}
            onChange={(event) => { setLoading(true); setCategory(event.target.value); setPage(1); }}
            className="rounded-xl border border-aether-border bg-aether-surface py-2.5 pl-10 pr-8 text-aether-text transition-colors appearance-none focus:border-aether-cyan focus:outline-none"
          >
            {serviceTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-aether-red/20 bg-aether-red/10 p-3 text-sm text-aether-red">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(item => (
            <div key={item} className="animate-pulse rounded-xl border border-aether-border bg-aether-surface p-6">
              <div className="mb-4 h-4 w-3/4 rounded bg-aether-surface-2" />
              <div className="mb-2 h-3 w-full rounded bg-aether-surface-2" />
              <div className="h-3 w-2/3 rounded bg-aether-surface-2" />
            </div>
          ))}
        </div>
      ) : offers.length === 0 ? (
        <Card className="py-16 text-center">
          <Bot className="mx-auto mb-4 h-12 w-12 text-aether-text-dim" />
          <h3 className="mb-2 text-lg font-semibold text-aether-text-bright">No service offers found</h3>
          <p className="text-aether-text-dim">Try another service type or search term.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {offers.map(offer => (
            <OfferCard
              key={offer.id}
              offer={offer}
              requesting={requestingId === offer.id}
              onRequest={() => handleRequest(offer)}
            />
          ))}
        </div>
      )}

      {total > 12 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {Array.from({ length: Math.ceil(total / 12) }, (_, index) => (
            <button
              key={index}
              onClick={() => { setLoading(true); setPage(index + 1); }}
              className={clsx(
                'h-10 w-10 rounded-lg text-sm font-medium transition-all',
                page === index + 1
                  ? 'bg-aether-cyan text-white'
                  : 'border border-aether-border bg-aether-surface text-aether-text-dim hover:border-aether-cyan',
              )}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, requesting, onRequest }: { offer: ServiceOffer; requesting: boolean; onRequest: () => void }) {
  return (
    <Card hover className="flex h-full flex-col">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="rounded bg-aether-violet/10 px-2 py-0.5 text-xs font-mono text-aether-violet">
          {serviceTypeLabel(offer.category)}
        </span>
        <span className="rounded bg-aether-green/10 px-2 py-0.5 text-xs font-medium text-aether-green">
          {offer.status.toLowerCase()}
        </span>
      </div>

      <h3 className="mb-2 line-clamp-2 text-lg font-semibold text-aether-text-bright">{offer.title}</h3>
      <p className="mb-4 line-clamp-3 flex-1 text-sm text-aether-text-dim">{offer.description}</p>

      <div className="mb-4 space-y-2 text-sm text-aether-text-dim">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-aether-cyan" />
          <Link to={`/agents/${offer.agentId}`} className="text-aether-text hover:text-aether-cyan">
            {offer.agent?.name || 'Agent'}
          </Link>
        </div>
        {offer.agent?.avgRating !== undefined && (
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-aether-amber" />
            <span>{offer.agent.avgRating.toFixed(1)} average rating</span>
          </div>
        )}
        {offer.estimatedDelivery && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-aether-text-dim" />
            <span>{offer.estimatedDelivery}</span>
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-aether-border pt-3">
        <div className="flex items-center gap-1 font-mono text-sm font-semibold text-aether-cyan">
          <DollarSign className="h-4 w-4" />
          {offer.startingPrice} {offer.priceToken}
          <span className="font-sans text-xs font-normal text-aether-text-dim">/{offer.pricingUnit}</span>
        </div>
        <button
          type="button"
          onClick={onRequest}
          disabled={requesting}
          className="inline-flex items-center gap-2 rounded-lg border border-aether-border px-3 py-2 text-sm text-aether-text transition-colors hover:border-aether-cyan hover:text-aether-cyan disabled:cursor-not-allowed disabled:opacity-50"
        >
          {requesting && <Loader2 className="h-4 w-4 animate-spin" />}
          Request
        </button>
      </div>
    </Card>
  );
}
