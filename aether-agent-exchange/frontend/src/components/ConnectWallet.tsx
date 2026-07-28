import { useMemo, useState } from 'react';
import { useAccount, useChainId, useConnect, useConnectors, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { X, Wallet, Loader2, ChevronRight } from 'lucide-react';
import { getNonce, verifySignature } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { errorMessage } from '../lib/errors';
import { activeChain } from '../lib/chains';
import coinbaseWalletIcon from '../assets/wallet-icons/coinbase-wallet.svg';
import metamaskIcon from '../assets/wallet-icons/metamask.svg';
import walletConnectIcon from '../assets/wallet-icons/walletconnect.svg';

interface ConnectWalletProps {
  open: boolean;
  onClose: () => void;
}

type FlowStatus = 'pick' | 'connecting' | 'signing' | 'verifying' | 'done' | 'error';
type WalletConnector = {
  id: string;
  name: string;
  icon?: string;
  type?: string;
  rdns?: string | readonly string[];
};

function isCoinbaseConnector(id: string) {
  return id === 'coinbaseWallet' || id === 'coinbaseWalletSDK';
}

function WalletIcon({ connector }: { connector: WalletConnector }) {
  const id = connector.id;
  const name = connector.name.toLowerCase();
  const rdns = typeof connector.rdns === 'string'
    ? connector.rdns.toLowerCase()
    : connector.rdns?.join(' ').toLowerCase() || '';
  const icon = connector.icon
    || (isCoinbaseConnector(id) ? coinbaseWalletIcon : undefined)
    || (id === 'baseAccount' ? coinbaseWalletIcon : undefined)
    || (id === 'walletConnect' ? walletConnectIcon : undefined)
    || (id === 'injected' || id === 'metaMask' || name.includes('metamask') || rdns.includes('metamask') ? metamaskIcon : undefined);

  if (icon) {
    return <img src={icon} alt="" className="w-7 h-7 rounded-lg object-contain" />;
  }

  return <Wallet className="w-6 h-6 text-aether-cyan" />;
}

function connectorLabel(id: string, name: string): string {
  if (id === 'injected') return 'Browser wallet';
  if (id === 'baseAccount') return 'Base Account';
  if (isCoinbaseConnector(id)) return 'Coinbase Wallet / Base';
  if (id === 'walletConnect') return 'WalletConnect';
  return name;
}

function connectorSubtext(id: string, name: string): string {
  if (id === 'injected') return 'Choose MetaMask, Rabby, Frame, or another installed browser wallet';
  if (id === 'baseAccount') return 'Base app and Base account smart wallet';
  if (isCoinbaseConnector(id)) return 'Coinbase Wallet app, Base app, or extension';
  if (id === 'walletConnect') return 'Trust, Phantom, Ledger, Trezor, Exodus, and 400+ more';
  if (name) return 'Detected browser wallet';
  return '';
}

function connectorKey(connector: WalletConnector): string {
  const rdns = Array.isArray(connector.rdns) ? connector.rdns[0] : connector.rdns;
  return rdns || `${connector.id}:${connector.name}`;
}

function connectorPriority(connector: WalletConnector): number {
  if (connector.id === 'baseAccount') return 10;
  if (isCoinbaseConnector(connector.id)) return 20;
  if (connector.id === 'walletConnect') return 90;
  if (connector.id === 'injected') return 80;
  if (connector.type === 'injected') return 30;
  return 50;
}

export default function ConnectWallet({ open, onClose }: ConnectWalletProps) {
  const { login } = useAuth();
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState<FlowStatus>('pick');
  const [error, setError] = useState('');
  const walletChoices = useMemo(() => {
    const seen = new Set<string>();
    return connectors
      .filter((connector) => {
        const key = connectorKey(connector as WalletConnector);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const priority = connectorPriority(a as WalletConnector) - connectorPriority(b as WalletConnector);
        return priority || a.name.localeCompare(b.name);
      });
  }, [connectors]);

  if (!open) return null;

  function handleClose() {
    onClose();
    setTimeout(() => {
      setStatus('pick');
      setError('');
    }, 200);
  }

  async function handleConnect(connectorId: string) {
    const connector = connectors.find((c) => c.id === connectorId);
    if (!connector) return;

    try {
      setStatus('connecting');
      setError('');

      let walletAddress = address;
      if (isConnected) {
        await disconnectAsync();
      }
      const result = await connectAsync({ connector, chainId: activeChain.id });
      walletAddress = result.accounts[0];

      if (!walletAddress) throw new Error('No wallet address found');
      if ((result.chainId || chainId) !== activeChain.id) {
        await switchChainAsync({ chainId: activeChain.id });
      }

      setStatus('signing');
      const { message } = await getNonce(walletAddress);
      const signature = await signMessageAsync({ message });

      setStatus('verifying');
      const { token, user } = await verifySignature(walletAddress, message, signature);

      login(token, user);
      setStatus('done');

      setTimeout(() => {
        handleClose();
      }, 800);
    } catch (error: unknown) {
      const message = errorMessage(error, 'Connection failed');
      setStatus('error');
      if (message.includes('rejected') || message.includes('denied') || message.includes('User rejected')) {
        setError('Signature rejected. Please try again.');
      } else if (message.includes('No wallet') || message.includes('not detected')) {
        setError(`Wallet not detected. Make sure the extension is installed and unlocked.`);
      } else if (message.includes('wallet_addEthereumChain') || message.includes('switch')) {
        setError(`Switch to ${activeChain.name} in your wallet and try again.`);
      } else {
        setError(message);
      }
    }
  }

  const statusLabel: Record<FlowStatus, string> = {
    pick: 'Choose your wallet to sign in',
    connecting: 'Connecting...',
    signing: 'Sign the message in your wallet...',
    verifying: 'Verifying signature...',
    done: 'Connected!',
    error: 'Connection failed',
  };

  const isBusy = status === 'connecting' || status === 'signing' || status === 'verifying';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-aether-border bg-aether-surface p-8 animate-slide-up">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-aether-text-dim hover:text-aether-text transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-aether-cyan to-aether-violet flex items-center justify-center">
            <Wallet className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-aether-text-bright">Connect Wallet</h2>
          <p className="text-sm text-aether-text-dim mt-2">{statusLabel[status]}</p>
          <p className="text-xs text-aether-cyan mt-2">Network: {activeChain.name}</p>
        </div>

        {status === 'error' && (
          <div className="mb-6 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">
            {error}
          </div>
        )}

        {status === 'done' ? (
          <div className="text-center text-aether-green text-lg font-semibold">
            Authenticated successfully
          </div>
        ) : isBusy ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="w-8 h-8 animate-spin text-aether-cyan" />
            <p className="text-sm text-aether-text-dim">{statusLabel[status]}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {walletChoices.map((connector) => (
              <button
                key={connectorKey(connector as WalletConnector)}
                onClick={() => handleConnect(connector.id)}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-xl border border-aether-border bg-aether-surface hover:border-aether-cyan/50 hover:bg-aether-cyan/5 transition-all group"
              >
                <div className="flex-shrink-0">
                  <WalletIcon connector={connector} />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-aether-text-bright group-hover:text-aether-cyan transition-colors">
                    {connectorLabel(connector.id, connector.name)}
                  </div>
                  <div className="text-xs text-aether-text-dim mt-0.5">
                    {connectorSubtext(connector.id, connector.name)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-aether-text-dim group-hover:text-aether-cyan transition-colors flex-shrink-0" />
              </button>
            ))}

            {walletChoices.length === 0 && (
              <div className="rounded-xl border border-aether-border bg-aether-surface-2 p-4 text-center text-sm text-aether-text-dim">
                No wallet connector is available in this browser.
              </div>
            )}

            <p className="text-xs text-center text-aether-text-dim pt-2">
              Signing verifies wallet ownership. No transaction, no gas fees.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
