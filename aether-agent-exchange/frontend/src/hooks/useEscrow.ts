import { useState, useCallback } from 'react';
import {
  useWriteContract,
  useReadContract,
  useAccount,
  useChainId,
  useSwitchChain,
} from 'wagmi';
import { keccak256, toHex, parseUnits, parseEventLogs, type Hex } from 'viem';
import {
  CONTRACTS,
  ESCROW_FACTORY_ABI,
  NATIVE_ESCROW_FACTORY_ABI,
  ERC8183_JOB_FACTORY_ABI,
  JOB_ESCROW_ABI,
  NATIVE_JOB_ESCROW_ABI,
  ERC20_ABI,
  type ContractAddresses,
  type EscrowStateValue,
} from '../lib/contracts';
import { activeChain } from '../lib/chains';
import { errorMessage, errorShortMessage } from '../lib/errors';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Convert a UUID/string job ID to a bytes32 hash for on-chain use. */
export function jobIdToBytes32(jobId: string): Hex {
  return keccak256(toHex(jobId));
}

export function valueToBytes32(value: string): Hex {
  const trimmed = value.trim();
  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) return trimmed as Hex;
  return keccak256(toHex(trimmed));
}

export function bytes32ToUint256(value: string): bigint {
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    throw new Error('ERC-8183 on-chain job id must be a bytes32 hex value');
  }
  const parsed = BigInt(trimmed);
  if (parsed <= 0n) throw new Error('ERC-8183 on-chain job id must be non-zero');
  return parsed;
}

// ─── Types ────────────────────────────────────────────────────────────

interface EscrowError {
  message: string;
  step?: 'createEscrow' | 'approve-erc20' | 'fund' | 'start-work' | 'submit-deliverable' | 'approve-release' | 'dispute';
}

export interface FundedEscrowResult {
  escrowAddress: `0x${string}`;
  createTxHash: `0x${string}`;
  fundTxHash: `0x${string}`;
}

interface UseEscrowReturn {
  /** Create an escrow via the factory, approve the ERC20 spend, and fund it. */
  createAndFundEscrow: (
    jobId: string,
    paymentToken: `0x${string}`,
    amount: string,
    decimals: number,
    reviewPeriodSeconds: number,
    acceptanceDeadlineSeconds?: number,
  ) => Promise<FundedEscrowResult | undefined>;

  /** Create a native-token escrow via the native factory and fund it with msg.value. */
  createAndFundNativeEscrow: (
    jobId: string,
    amount: string,
    decimals: number,
    reviewPeriodSeconds: number,
    acceptanceDeadlineSeconds?: number,
  ) => Promise<FundedEscrowResult | undefined>;

  /** Client approves deliverable and releases funds to the agent. */
  approveAndRelease: (
    escrowAddress: `0x${string}`,
    escrowContractVersion?: 'legacy' | 'erc8183' | 'native-eth',
    onchainJobId?: string,
  ) => Promise<`0x${string}` | undefined>;

  /** Agent/handler accepts the funded escrow on-chain and starts work. */
  startEscrowWork: (
    escrowAddress: `0x${string}`,
    agentId: string,
    escrowContractVersion?: 'legacy' | 'erc8183' | 'native-eth',
  ) => Promise<`0x${string}` | undefined>;

  /** Agent/handler submits the deliverable hash on-chain for review. */
  submitEscrowDeliverable: (
    escrowAddress: `0x${string}`,
    deliverableHash: string,
    escrowContractVersion?: 'legacy' | 'erc8183' | 'native-eth',
    onchainJobId?: string,
  ) => Promise<`0x${string}` | undefined>;

  /** Client or agent/handler opens an on-chain escrow dispute. */
  openEscrowDispute: (
    escrowAddress: `0x${string}`,
    reason: string,
    escrowContractVersion?: 'legacy' | 'erc8183' | 'native-eth',
    onchainJobId?: string,
  ) => Promise<`0x${string}` | undefined>;

  /** Read the current on-chain state of an escrow. */
  getEscrowState: (escrowAddress: `0x${string}`) => void;

  /** Most recently fetched escrow state value. */
  escrowState: EscrowStateValue | undefined;

  /** Whether any contract interaction is in progress. */
  isLoading: boolean;

  /** The current step label while a multi-tx flow is running. */
  currentStep: string | null;

  /** Last error from contract interaction. */
  error: EscrowError | null;

  /** Clear the error state. */
  clearError: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────

export function useEscrow(selectedChain = activeChain, contracts: ContractAddresses = CONTRACTS): UseEscrowReturn {
  const { address } = useAccount();
  const connectedChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<EscrowError | null>(null);
  const [escrowStateVal, setEscrowStateVal] = useState<EscrowStateValue | undefined>(undefined);

  const clearError = useCallback(() => setError(null), []);

  const ensureSelectedChain = useCallback(async () => {
    if (connectedChainId === selectedChain.id) return;
    setCurrentStep(`Switching wallet to ${selectedChain.name}...`);
    try {
      await switchChainAsync({ chainId: selectedChain.id });
    } catch (err: unknown) {
      throw new Error(errorShortMessage(err, `Switch your wallet to ${selectedChain.name} and try again.`));
    }
  }, [connectedChainId, selectedChain.id, selectedChain.name, switchChainAsync]);

  const waitForEscrowAddress = useCallback(async (
    factoryAddress: `0x${string}`,
    abi: typeof ESCROW_FACTORY_ABI | typeof NATIVE_ESCROW_FACTORY_ABI,
    jobIdBytes32: Hex,
  ): Promise<`0x${string}` | undefined> => {
    const maxAttempts = 8;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      try {
        const { readContract } = await import('wagmi/actions');
        const { config } = await import('../lib/wagmi');
        const result = await readContract(config, {
          address: factoryAddress,
          abi,
          functionName: 'getEscrow',
          args: [jobIdBytes32],
          chainId: selectedChain.id,
        });
        if (result && result !== '0x0000000000000000000000000000000000000000') {
          return result as `0x${string}`;
        }
      } catch {
        // Not yet available, keep polling.
      }
    }
    return undefined;
  }, [selectedChain.id]);

  const assertContractCode = useCallback(async (target: `0x${string}`, label: string) => {
    const { getPublicClient } = await import('wagmi/actions');
    const { config } = await import('../lib/wagmi');
    const publicClient = getPublicClient(config, { chainId: selectedChain.id });
    const code = publicClient ? await publicClient.getBytecode({ address: target }) : undefined;
    if (!code || code === '0x') {
      throw new Error(`${label} has no deployed contract bytecode. Refusing token approval for ${target}.`);
    }
  }, [selectedChain.id]);

  const waitForCreatedEscrowAddress = useCallback(async (
    factoryAddress: `0x${string}`,
    abi: typeof ESCROW_FACTORY_ABI | typeof NATIVE_ESCROW_FACTORY_ABI,
    createTxHash: `0x${string}`,
    jobIdBytes32: Hex,
  ): Promise<`0x${string}` | undefined> => {
    type ReceiptLog = { address: `0x${string}`; topics: readonly Hex[]; data: Hex };
    type WalletReceipt = { status?: Hex; logs?: readonly ReceiptLog[] };
    type ParseEventLogsInput = Parameters<typeof parseEventLogs>[0];
    const escrowFromLogs = (logs: readonly ReceiptLog[]) => {
      const createdLogs = parseEventLogs({
        abi,
        eventName: 'EscrowCreated',
        logs: [...logs] as ParseEventLogsInput['logs'],
      });
      const created = createdLogs.find(log =>
        log.address.toLowerCase() === factoryAddress.toLowerCase()
        && log.args.jobId === jobIdBytes32
      );
      const escrow = created?.args.escrow;
      return escrow && escrow !== '0x0000000000000000000000000000000000000000'
        ? escrow as `0x${string}`
        : undefined;
    };

    try {
      const { getWalletClient } = await import('wagmi/actions');
      const { config } = await import('../lib/wagmi');
      const walletClient = await getWalletClient(config, { chainId: selectedChain.id });
      const receiptDeadline = Date.now() + 30_000;
      while (Date.now() < receiptDeadline) {
        const receipt = await walletClient.transport.request({
          method: 'eth_getTransactionReceipt',
          params: [createTxHash],
        }) as WalletReceipt | null;
        if (receipt) {
          if (receipt.status === '0x0') {
            throw new Error(`Escrow creation transaction reverted: ${createTxHash}`);
          }
          const escrow = receipt.logs ? escrowFromLogs(receipt.logs) : undefined;
          if (escrow) return escrow;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
    } catch {
      // Some connectors do not expose receipt reads. Fall through to configured RPC.
    }

    try {
      const { waitForTransactionReceipt } = await import('wagmi/actions');
      const { config } = await import('../lib/wagmi');
      const receipt = await waitForTransactionReceipt(config, {
        hash: createTxHash,
        chainId: selectedChain.id,
        pollingInterval: 1_500,
        timeout: 45_000,
      });

      if (receipt.status === 'reverted') {
        throw new Error(`Escrow creation transaction reverted: ${createTxHash}`);
      }

      const escrow = escrowFromLogs(receipt.logs);
      if (escrow) return escrow;
    } catch {
      // Receipt lookup can fail on public RPC rate limits. Fall back to mapping reads.
    }

    return waitForEscrowAddress(factoryAddress, abi, jobIdBytes32);
  }, [selectedChain.id, waitForEscrowAddress]);

  // ── createAndFundEscrow ─────────────────────────────────────────────
  const createAndFundEscrow = useCallback(
    async (
      jobId: string,
      paymentToken: `0x${string}`,
      amount: string,
      decimals: number,
      reviewPeriodSeconds: number,
      acceptanceDeadlineSeconds?: number,
    ): Promise<FundedEscrowResult | undefined> => {
      if (!address) {
        setError({ message: 'Wallet not connected' });
        return undefined;
      }

      const factoryAddress = contracts.escrowFactory;
      if (!factoryAddress) {
        setError({ message: 'Escrow factory address not configured. Set VITE_ESCROW_FACTORY_ADDRESS.' });
        return undefined;
      }

      setError(null);
      setIsLoading(true);

      const jobIdBytes32 = jobIdToBytes32(jobId);
      const amountWei = parseUnits(amount, decimals);

      try {
        await ensureSelectedChain();

        // Step 1: Create the escrow via the factory
        setCurrentStep('Creating escrow contract...');
        const createTxHash = acceptanceDeadlineSeconds
          ? await writeContractAsync({
              address: factoryAddress,
              abi: ESCROW_FACTORY_ABI,
              functionName: 'createEscrow',
              args: [jobIdBytes32, address, paymentToken, amountWei, BigInt(reviewPeriodSeconds), BigInt(acceptanceDeadlineSeconds)],
              chain: selectedChain,
            })
          : await writeContractAsync({
              address: factoryAddress,
              abi: ESCROW_FACTORY_ABI,
              functionName: 'createEscrow',
              args: [jobIdBytes32, address, paymentToken, amountWei, BigInt(reviewPeriodSeconds)],
              chain: selectedChain,
            });

        // Step 2: Approve the ERC20 token spend to the escrow
        // We need to look up the escrow address from the factory first.
        // For now, we approve the factory-created escrow. Since the escrow
        // address comes from the EscrowCreated event, we use a generous
        // approach: approve first, then fund.
        //
        // We read the escrow address from the factory mapping.
        setCurrentStep('Looking up escrow address...');

        // Wait a moment for the tx to be mined, then read the address.
        // In production, parse the EscrowCreated event from the receipt.
        // For robustness, we'll do a direct contract read after the tx.
        // The writeContractAsync returns the tx hash; wagmi's
        // useWaitForTransactionReceipt can be used reactively, but in
        // an imperative flow we use the viem client directly.
        //
        // We'll use a polling approach to read the escrow address.
        const escrowAddress = await waitForCreatedEscrowAddress(factoryAddress, ESCROW_FACTORY_ABI, createTxHash, jobIdBytes32);

        if (!escrowAddress) {
          setError({ message: 'Escrow creation transaction sent but address not found. Check transaction: ' + createTxHash, step: 'createEscrow' });
          setIsLoading(false);
          setCurrentStep(null);
          return undefined;
        }

        // Step 3: Approve ERC20 token transfer to the escrow contract
        await assertContractCode(escrowAddress, 'Escrow spender');
        setCurrentStep('Approving token transfer...');
        await writeContractAsync({
          address: paymentToken,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [escrowAddress, amountWei],
          chain: selectedChain,
        });

        // Step 4: Fund the escrow
        setCurrentStep('Funding escrow...');
        const fundTxHash = await writeContractAsync({
          address: escrowAddress,
          abi: JOB_ESCROW_ABI,
          functionName: 'fund',
          args: [],
          chain: selectedChain,
        });

        setCurrentStep(null);
        setIsLoading(false);
        return { escrowAddress, createTxHash, fundTxHash };
      } catch (err: unknown) {
        const message = errorShortMessage(err, 'Transaction failed');
        setError({ message, step: 'start-work' });
        setIsLoading(false);
        setCurrentStep(null);
        return undefined;
      }
    },
    [address, assertContractCode, contracts.escrowFactory, ensureSelectedChain, selectedChain, waitForCreatedEscrowAddress, writeContractAsync],
  );

  const createAndFundNativeEscrow = useCallback(
    async (
      jobId: string,
      amount: string,
      decimals: number,
      reviewPeriodSeconds: number,
      acceptanceDeadlineSeconds?: number,
    ): Promise<FundedEscrowResult | undefined> => {
      if (!address) {
        setError({ message: 'Wallet not connected' });
        return undefined;
      }

      const factoryAddress = contracts.nativeEscrowFactory;
      if (!factoryAddress) {
        setError({ message: 'Native escrow factory address not configured. Set VITE_NATIVE_ETH_ESCROW_FACTORY_ADDRESS.' });
        return undefined;
      }

      setError(null);
      setIsLoading(true);

      const jobIdBytes32 = jobIdToBytes32(jobId);
      const amountWei = parseUnits(amount, decimals);

      try {
        await ensureSelectedChain();

        setCurrentStep('Creating native escrow contract...');
        const createTxHash = acceptanceDeadlineSeconds
          ? await writeContractAsync({
              address: factoryAddress,
              abi: NATIVE_ESCROW_FACTORY_ABI,
              functionName: 'createEscrow',
              args: [jobIdBytes32, address, amountWei, BigInt(reviewPeriodSeconds), BigInt(acceptanceDeadlineSeconds)],
              chain: selectedChain,
            })
          : await writeContractAsync({
              address: factoryAddress,
              abi: NATIVE_ESCROW_FACTORY_ABI,
              functionName: 'createEscrow',
              args: [jobIdBytes32, address, amountWei, BigInt(reviewPeriodSeconds)],
              chain: selectedChain,
            });

        setCurrentStep('Looking up native escrow address...');
        const escrowAddress = await waitForCreatedEscrowAddress(factoryAddress, NATIVE_ESCROW_FACTORY_ABI, createTxHash, jobIdBytes32);
        if (!escrowAddress) {
          setError({ message: 'Native escrow creation transaction sent but address not found. Check transaction: ' + createTxHash, step: 'createEscrow' });
          setIsLoading(false);
          setCurrentStep(null);
          return undefined;
        }

        setCurrentStep('Funding native escrow...');
        const fundTxHash = await writeContractAsync({
          address: escrowAddress,
          abi: NATIVE_JOB_ESCROW_ABI,
          functionName: 'fund',
          args: [],
          value: amountWei,
          chain: selectedChain,
        });

        setCurrentStep(null);
        setIsLoading(false);
        return { escrowAddress, createTxHash, fundTxHash };
      } catch (err: unknown) {
        const message = errorShortMessage(err, 'Native escrow transaction failed');
        setError({ message, step: 'createEscrow' });
        setIsLoading(false);
        setCurrentStep(null);
        return undefined;
      }
    },
    [address, contracts.nativeEscrowFactory, ensureSelectedChain, selectedChain, waitForCreatedEscrowAddress, writeContractAsync],
  );

  // ── approveAndRelease ───────────────────────────────────────────────
  const approveAndRelease = useCallback(
    async (
      escrowAddress: `0x${string}`,
      escrowContractVersion: 'legacy' | 'erc8183' | 'native-eth' = 'legacy',
      onchainJobId?: string,
    ): Promise<`0x${string}` | undefined> => {
      if (!address) {
        setError({ message: 'Wallet not connected' });
        return undefined;
      }

      setError(null);
      setIsLoading(true);

      try {
        await ensureSelectedChain();

        setCurrentStep('Approving and releasing funds...');
        if (escrowContractVersion === 'erc8183') {
          if (!contracts.erc8183Factory) throw new Error('ERC-8183 factory address is not configured for this chain.');
          if (!onchainJobId) throw new Error('ERC-8183 on-chain job id is not recorded for this job.');
          setCurrentStep('Completing ERC-8183 job...');
          const txHash = await writeContractAsync({
            address: contracts.erc8183Factory,
            abi: ERC8183_JOB_FACTORY_ABI,
            functionName: 'complete',
            args: [bytes32ToUint256(onchainJobId), valueToBytes32('aae-approval')],
            chain: selectedChain,
          });
          setCurrentStep(null);
          setIsLoading(false);
          return txHash;
        }

        const txHash = await writeContractAsync({
          address: escrowAddress,
          abi: escrowContractVersion === 'native-eth' ? NATIVE_JOB_ESCROW_ABI : JOB_ESCROW_ABI,
          functionName: 'approve',
          args: [],
          chain: selectedChain,
        });

        setCurrentStep(null);
        setIsLoading(false);
        return txHash;
      } catch (err: unknown) {
        const message = errorShortMessage(err, 'Approve & release failed');
        setError({ message, step: 'approve-release' });
        setIsLoading(false);
        setCurrentStep(null);
        return undefined;
      }
    },
    [address, contracts.erc8183Factory, ensureSelectedChain, selectedChain, writeContractAsync],
  );

  const startEscrowWork = useCallback(
    async (
      escrowAddress: `0x${string}`,
      agentId: string,
      escrowContractVersion: 'legacy' | 'erc8183' | 'native-eth' = 'legacy',
    ): Promise<`0x${string}` | undefined> => {
      if (!address) {
        setError({ message: 'Wallet not connected' });
        return undefined;
      }

      setError(null);
      setIsLoading(true);

      try {
        await ensureSelectedChain();

        if (escrowContractVersion === 'erc8183') {
          throw new Error('ERC-8183 jobs do not have a separate startWork transaction. Submit the deliverable on-chain after backend bid acceptance.');
        }

        setCurrentStep('Starting escrow work...');
        const txHash = await writeContractAsync({
          address: escrowAddress,
          abi: escrowContractVersion === 'native-eth' ? NATIVE_JOB_ESCROW_ABI : JOB_ESCROW_ABI,
          functionName: 'startWork',
          args: [valueToBytes32(agentId)],
          chain: selectedChain,
        });

        setCurrentStep(null);
        setIsLoading(false);
        return txHash;
      } catch (err: unknown) {
        const message = errorShortMessage(err, 'Start work failed');
        setError({ message, step: 'start-work' });
        setIsLoading(false);
        setCurrentStep(null);
        return undefined;
      }
    },
    [address, ensureSelectedChain, selectedChain, writeContractAsync],
  );

  const submitEscrowDeliverable = useCallback(
    async (
      escrowAddress: `0x${string}`,
      deliverableHash: string,
      escrowContractVersion: 'legacy' | 'erc8183' | 'native-eth' = 'legacy',
      onchainJobId?: string,
    ): Promise<`0x${string}` | undefined> => {
      if (!address) {
        setError({ message: 'Wallet not connected' });
        return undefined;
      }

      setError(null);
      setIsLoading(true);

      try {
        await ensureSelectedChain();

        setCurrentStep('Submitting escrow deliverable...');
        if (escrowContractVersion === 'erc8183') {
          if (!contracts.erc8183Factory) throw new Error('ERC-8183 factory address is not configured for this chain.');
          if (!onchainJobId) throw new Error('ERC-8183 on-chain job id is not recorded for this job.');
          setCurrentStep('Submitting ERC-8183 deliverable...');
          const txHash = await writeContractAsync({
            address: contracts.erc8183Factory,
            abi: ERC8183_JOB_FACTORY_ABI,
            functionName: 'submit',
            args: [bytes32ToUint256(onchainJobId), valueToBytes32(deliverableHash)],
            chain: selectedChain,
          });
          setCurrentStep(null);
          setIsLoading(false);
          return txHash;
        }

        const txHash = await writeContractAsync({
          address: escrowAddress,
          abi: escrowContractVersion === 'native-eth' ? NATIVE_JOB_ESCROW_ABI : JOB_ESCROW_ABI,
          functionName: 'submitDeliverable',
          args: [valueToBytes32(deliverableHash)],
          chain: selectedChain,
        });

        setCurrentStep(null);
        setIsLoading(false);
        return txHash;
      } catch (err: unknown) {
        const message = errorShortMessage(err, 'Escrow deliverable submission failed');
        setError({ message, step: 'submit-deliverable' });
        setIsLoading(false);
        setCurrentStep(null);
        return undefined;
      }
    },
    [address, contracts.erc8183Factory, ensureSelectedChain, selectedChain, writeContractAsync],
  );

  const openEscrowDispute = useCallback(
    async (
      escrowAddress: `0x${string}`,
      reason: string,
      escrowContractVersion: 'legacy' | 'erc8183' | 'native-eth' = 'legacy',
      onchainJobId?: string,
    ): Promise<`0x${string}` | undefined> => {
      if (!address) {
        setError({ message: 'Wallet not connected' });
        return undefined;
      }

      setError(null);
      setIsLoading(true);

      try {
        await ensureSelectedChain();

        setCurrentStep('Opening escrow dispute...');
        if (escrowContractVersion === 'erc8183') {
          if (!contracts.erc8183Factory) throw new Error('ERC-8183 factory address is not configured for this chain.');
          if (!onchainJobId) throw new Error('ERC-8183 on-chain job id is not recorded for this job.');
          setCurrentStep('Rejecting ERC-8183 job...');
          const txHash = await writeContractAsync({
            address: contracts.erc8183Factory,
            abi: ERC8183_JOB_FACTORY_ABI,
            functionName: 'reject',
            args: [bytes32ToUint256(onchainJobId), valueToBytes32(reason)],
            chain: selectedChain,
          });
          setCurrentStep(null);
          setIsLoading(false);
          return txHash;
        }

        const txHash = await writeContractAsync({
          address: escrowAddress,
          abi: escrowContractVersion === 'native-eth' ? NATIVE_JOB_ESCROW_ABI : JOB_ESCROW_ABI,
          functionName: 'dispute',
          args: [reason],
          chain: selectedChain,
        });

        setCurrentStep(null);
        setIsLoading(false);
        return txHash;
      } catch (err: unknown) {
        const message = errorShortMessage(err, 'Escrow dispute failed');
        setError({ message, step: 'dispute' });
        setIsLoading(false);
        setCurrentStep(null);
        return undefined;
      }
    },
    [address, contracts.erc8183Factory, ensureSelectedChain, selectedChain, writeContractAsync],
  );

  // ── getEscrowState ──────────────────────────────────────────────────
  const getEscrowState = useCallback(
    async (escrowAddress: `0x${string}`) => {
      try {
        const { readContract } = await import('wagmi/actions');
        const { config } = await import('../lib/wagmi');
        const result = await readContract(config, {
          address: escrowAddress,
          abi: JOB_ESCROW_ABI,
          functionName: 'state',
          args: [],
          chainId: selectedChain.id,
        });
        setEscrowStateVal(Number(result) as EscrowStateValue);
      } catch (err: unknown) {
        setError({ message: errorMessage(err, 'Failed to read escrow state') });
      }
    },
    [selectedChain.id],
  );

  return {
    createAndFundEscrow,
    createAndFundNativeEscrow,
    approveAndRelease,
    startEscrowWork,
    submitEscrowDeliverable,
    openEscrowDispute,
    getEscrowState,
    escrowState: escrowStateVal,
    isLoading,
    currentStep,
    error,
    clearError,
  };
}

// ─── Reactive state reader (for components that want auto-refresh) ───

/**
 * Reactively reads the on-chain state of a specific escrow contract.
 * Uses wagmi's useReadContract which auto-refetches on block changes.
 */
export function useEscrowStateRead(escrowAddress: `0x${string}` | undefined) {
  const result = useReadContract({
    address: escrowAddress,
    abi: JOB_ESCROW_ABI,
    functionName: 'state',
    query: {
      enabled: !!escrowAddress,
    },
  });

  return {
    state: result.data !== undefined ? (Number(result.data) as EscrowStateValue) : undefined,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Reads the escrow amount for a given escrow contract address.
 */
export function useEscrowAmount(escrowAddress: `0x${string}` | undefined) {
  const result = useReadContract({
    address: escrowAddress,
    abi: JOB_ESCROW_ABI,
    functionName: 'escrowAmount',
    query: {
      enabled: !!escrowAddress,
    },
  });

  return {
    amount: result.data as bigint | undefined,
    isLoading: result.isLoading,
    error: result.error,
  };
}
