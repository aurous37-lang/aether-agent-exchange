export class PrxvtLiveSdkDisabledError extends Error {
  constructor(method: string) {
    super(`PRXVT live SDK method "${method}" is disabled; only px402 dry-run discovery is available.`);
  }
}

export async function deposit(): Promise<never> {
  throw new PrxvtLiveSdkDisabledError('deposit');
}

export async function depositFast(): Promise<never> {
  throw new PrxvtLiveSdkDisabledError('depositFast');
}

export async function makePayment(): Promise<never> {
  throw new PrxvtLiveSdkDisabledError('makePayment');
}

export function wrapFetch(): never {
  throw new PrxvtLiveSdkDisabledError('wrapFetch');
}

export function setNote(): never {
  throw new PrxvtLiveSdkDisabledError('setNote');
}
