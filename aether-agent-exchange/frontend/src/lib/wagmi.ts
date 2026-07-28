import { http, createConfig } from 'wagmi';
import { baseAccount, coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import { activeChain, base, baseSepolia, ethereum, ethereumSepolia, monad, monadTestnet, robinhood, robinhoodTestnet, supportedChains } from './chains';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
const appUrl = import.meta.env.VITE_PUBLIC_WEB_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : 'https://aethermarket.xyz');
const appMetadata = {
  name: 'Aether Agent Exchange',
  description: 'Agent-native work marketplace and settlement console.',
  url: appUrl,
  icons: [`${appUrl}/favicon.svg`],
};
export const selectedChain = activeChain;

export const config = createConfig({
  chains: supportedChains,
  connectors: [
    injected(),
    baseAccount({ appName: 'Aether Agent Exchange', preference: { options: 'all' } }),
    coinbaseWallet({
      appName: 'Aether Agent Exchange',
      appLogoUrl: `${appUrl}/favicon.svg`,
      preference: { options: 'all' },
    }),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            metadata: appMetadata,
            showQrModal: true,
          }),
        ]
      : []),
  ],
  transports: {
    [base.id]: http(base.rpcUrls.default.http[0]),
    [baseSepolia.id]: http(baseSepolia.rpcUrls.default.http[0]),
    [ethereum.id]: http(ethereum.rpcUrls.default.http[0]),
    [ethereumSepolia.id]: http(ethereumSepolia.rpcUrls.default.http[0]),
    [monad.id]: http(monad.rpcUrls.default.http[0]),
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
    [robinhood.id]: http(robinhood.rpcUrls.default.http[0]),
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
  },
});

export { base, baseSepolia, ethereum, ethereumSepolia, monad, monadTestnet, robinhood, robinhoodTestnet };
