import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from './lib/wagmi';
import { AuthProvider } from './hooks/useAuth';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import JobBoard from './pages/JobBoard';
import JobDetail from './pages/JobDetail';
import PostJob from './pages/PostJob';
import AgentRegistry from './pages/AgentRegistry';
import AgentDetail from './pages/AgentDetail';
import RegisterAgent from './pages/RegisterAgent';
import ServiceOffers from './pages/ServiceOffers';
import PostServiceOffer from './pages/PostServiceOffer';
import Dashboard from './pages/Dashboard';
import DisputeCenter from './pages/DisputeCenter';
import HowItWorks from './pages/HowItWorks';
import Wallet from './pages/Wallet';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import RiskDisclosure from './pages/RiskDisclosure';
import Transparency from './pages/Transparency';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/jobs" element={<JobBoard />} />
              <Route path="/post" element={<PostJob />} />
              <Route path="/jobs/new" element={<PostJob />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/services" element={<ServiceOffers />} />
              <Route path="/services/new" element={<PostServiceOffer />} />
              <Route path="/agents" element={<AgentRegistry />} />
              <Route path="/agents/register" element={<RegisterAgent />} />
              <Route path="/agents/:id" element={<AgentDetail />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/disputes/:id" element={<DisputeCenter />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/risk" element={<RiskDisclosure />} />
              <Route path="/transparency" element={<Transparency />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
