import { expect, test, type Page } from '@playwright/test';

const clientUser = {
  id: 'client-1',
  walletAddress: '0x1111111111111111111111111111111111111111',
  role: 'CLIENT',
  displayName: 'Client',
  termsAccepted: true,
};

async function primeAuth(page: Page) {
  await page.addInitScript((user) => {
    window.localStorage.setItem('aether_token', 'post-job-robinhood-token');
    window.localStorage.setItem('aether_user', JSON.stringify(user));
  }, clientUser);
}

async function routeRobinhoodReadiness(page: Page, options: { robinhoodDirectEnabled?: boolean } = {}) {
  const robinhoodDirectEnabled = options.robinhoodDirectEnabled ?? true;
  await page.route('**/api/auth/platform-info', route => route.fulfill({
    json: {
      policyVersion: 'test',
      platformFeeBps: 170,
      platformFeePercent: '1.7%',
      supportedTokens: ['ETH'],
      networkKey: 'base',
      chainId: 8453,
      network: {
        key: 'base',
        name: 'Base',
        chainId: 8453,
        caip2Network: 'eip155:8453',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        explorerUrl: 'https://basescan.org',
        settlementRails: ['standard'],
        rpcConfigured: true,
      },
      chains: [
        {
          key: 'robinhood',
          name: 'Robinhood Chain',
          chainId: 4663,
          caip2Network: 'eip155:4663',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          explorerUrl: 'https://robinhoodchain.blockscout.com',
          settlementRails: ['standard'],
          rpcConfigured: true,
        },
      ],
      contractAddresses: {
        escrowFactory: null,
        nativeEscrowFactory: null,
        erc8183Factory: null,
        agentRegistry: null,
        feeCollector: null,
      },
      contractAddressesByChain: {
        robinhood: {
          escrowFactory: null,
          nativeEscrowFactory: robinhoodDirectEnabled ? '0x0000000000000000000000000000000000000002' : null,
          erc8183Factory: null,
          agentRegistry: null,
          feeCollector: '0x0000000000000000000000000000000000000003',
        },
      },
    },
  }));
  await page.route('**/api/settlement/providers', route => route.fulfill({
    json: {
      providers: [
        {
          providerId: 'direct-wallet',
          adapterId: 'direct-wallet-escrow',
          displayName: 'Direct wallet escrow',
          rail: 'standard',
          status: robinhoodDirectEnabled ? 'enabled' : 'disabled',
          enabled: robinhoodDirectEnabled,
          readinessOnly: !robinhoodDirectEnabled,
          network: 'robinhood',
          caip2Network: 'eip155:4663',
          tokenSymbols: robinhoodDirectEnabled ? ['ETH'] : [],
          merchantRegistrationReady: true,
          quoteGenerationReady: true,
          receiptNormalizationReady: true,
          settlementVerificationReady: true,
          redactionAuditReady: true,
          reasons: robinhoodDirectEnabled ? [] : ['no direct-wallet escrow factory/token configuration is available for this chain'],
        },
      ],
    },
  }));
  await page.route('**/api/market/spot/ETH-USD', route => route.fulfill({
    json: { pair: 'ETH-USD', amount: '3000', base: 'ETH', quote: 'USD', source: 'fixture' },
  }));
}

test('Post Job exposes Robinhood Chain as native ETH direct wallet only', async ({ page }) => {
  await primeAuth(page);
  await routeRobinhoodReadiness(page);

  await page.goto('/post');

  const selects = page.locator('select');
  const network = selects.nth(1);
  await expect(network).toContainText('Robinhood Chain');
  await network.selectOption('robinhood');

  const token = selects.nth(2);
  await expect(token).toHaveValue('ETH');
  await expect(token.locator('option')).toHaveCount(1);
  await expect(token.locator('option').first()).toHaveText('ETH');

  const rail = selects.nth(3);
  await expect(rail).toHaveValue('standard');
  await expect(rail.locator('option')).toHaveText(['Direct wallet escrow']);

  await expect(page.getByText('x402 stablecoin')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'USDC' })).toHaveCount(0);
  await expect(page.getByText(/x402\/px402/)).toHaveCount(0);
});

test('Post Job keeps Robinhood native ETH only when no Robinhood rail is enabled', async ({ page }) => {
  await primeAuth(page);
  await routeRobinhoodReadiness(page, { robinhoodDirectEnabled: false });

  await page.goto('/post');

  const selects = page.locator('select');
  await selects.nth(1).selectOption('robinhood');

  const token = selects.nth(2);
  await expect(token).toHaveValue('ETH');
  await expect(token.locator('option')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'USDC' })).toHaveCount(0);

  const rail = selects.nth(3);
  await expect(rail.locator('option')).toHaveText(['No enabled rail']);
  await expect(page.getByText('x402 stablecoin')).toHaveCount(0);
  await expect(page.getByText(/x402\/px402/)).toHaveCount(0);
});
