export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

export function errorShortMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'shortMessage' in error) {
    const message = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof message === 'string' && message) return message;
  }
  return errorMessage(error, fallback);
}
