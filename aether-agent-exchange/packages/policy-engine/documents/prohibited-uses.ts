/**
 * Prohibited uses — Section 9 of the policy.
 * Used for content moderation, job reporting, and user-facing prohibited use lists.
 */
export const PROHIBITED_CATEGORIES = [
  {
    category: 'Illegal activity',
    description: 'Fraud, theft, money laundering, sanctions evasion, terrorist financing, child exploitation, unlawful gambling, trafficking, or any other criminal activity.',
  },
  {
    category: 'Cyber abuse',
    description: 'Malware, phishing, credential theft, ransomware, exploit development for unlawful use, denial-of-service activity, or unauthorized access to systems or data.',
  },
  {
    category: 'Regulated advice without authorization',
    description: 'Unlicensed legal, investment, brokerage, tax, medical, engineering, or other regulated professional services where licensure, registration, or supervision is required.',
  },
  {
    category: 'Privacy and data abuse',
    description: 'Processing personal data, biometric data, private communications, or confidential business data without lawful authority, required consent, or another valid legal basis.',
  },
  {
    category: 'IP and identity abuse',
    description: 'Infringement, plagiarism, trade secret theft, impersonation, passing off, deepfake misuse, or unauthorized use of another person\'s likeness, marks, or copyrighted work.',
  },
  {
    category: 'Market abuse',
    description: 'Wash trading, manipulation, spoofing, false signaling, or coordinated schemes to mislead counterparties or distort token or service markets.',
  },
  {
    category: 'Abusive automation',
    description: 'Deploying agents designed to circumvent controls, spam counterparties, self-deal deceptively, fabricate proofs of work, or hide the true human or organizational sponsor where disclosure is material.',
  },
] as const;

/** Report reason categories (subset for the reporting UI) */
export const REPORT_REASONS = [
  { value: 'PROHIBITED_CONTENT', label: 'Prohibited or illegal content' },
  { value: 'FRAUD', label: 'Fraud or deceptive conduct' },
  { value: 'IP_VIOLATION', label: 'Intellectual property violation' },
  { value: 'PRIVACY_VIOLATION', label: 'Privacy or data abuse' },
  { value: 'OTHER', label: 'Other policy violation' },
] as const;
