import { Router, Response } from 'express';
import { CHAINS } from '../config/chains';
import {
  getStablecoinProviderCapabilities,
  getStablecoinAcceptancePolicyFromEnv,
  stablecoinPolicySummary,
} from '../services/stablecoinProviders';

const router = Router();

router.get('/settlement/providers', (_req, res: Response): void => {
  const policy = getStablecoinAcceptancePolicyFromEnv();
  const providers = Object.values(CHAINS).flatMap((chain) => getStablecoinProviderCapabilities(policy, chain));
  res.json({
    providers,
    policy: stablecoinPolicySummary(),
    storagePolicy: {
      persistedEvidence: [
        'provider id',
        'rail',
        'network / CAIP-2 id',
        'token symbol',
        'amount',
        'endpoint/resource hash',
        'receipt hash',
        'safe public tx hash',
        'facilitator/reference hash',
        'status',
        'timestamps',
      ],
      rawPaymentHeadersStored: false,
      rawAuthorizationHeadersStored: false,
      walletSignaturesStored: false,
      signedPayloadsStored: false,
      cardCredentialsStored: false,
      providerSecretsStored: false,
      ucanSecretsStored: false,
      prxvtNotesStored: false,
    },
  });
});

export default router;
