/**
 * Configuration types and defaults for the Simulation V2 engine.
 */

export type SimMode = 'pure' | 'hybrid' | 'replay';
export type TickPreset = 'short' | 'standard' | 'long';
export type InteropMode = 'native' | 'a2a' | 'mcp' | 'hybrid';

export interface SimConfig {
  seed: string;
  scenario: string;
  mode: SimMode;
  interopMode: InteropMode;
  tickPreset: TickPreset;
  tickCount: number;
  tickDurationMinutes: number;
  apiBaseUrl: string;
  outputDir: string;
  emitTickSnapshots: boolean;
  telemetrySchemaVersion: string;
}

export const TICK_PRESETS: Record<TickPreset, number> = {
  short: 240,       // 4 hours simulated
  standard: 1440,   // 24 hours simulated
  long: 10080,      // 7 days simulated
};

const DEFAULTS: SimConfig = {
  seed: 'default',
  scenario: 'baseline-market',
  mode: 'hybrid',
  interopMode: 'native',
  tickPreset: 'standard',
  tickCount: TICK_PRESETS['standard'],
  tickDurationMinutes: 1,
  apiBaseUrl: 'http://localhost:4000/api',
  outputDir: './simulation-v2/output',
  emitTickSnapshots: false,
  telemetrySchemaVersion: '1.0.0',
};

/**
 * Merges a partial config with defaults.
 * If `tickPreset` is provided but `tickCount` is not, tickCount is derived from the preset.
 * If `tickCount` is explicitly provided, it overrides the preset.
 */
export function resolveConfig(partial: Partial<SimConfig>): SimConfig {
  const preset = partial.tickPreset ?? DEFAULTS.tickPreset;
  const tickCountFromPreset = TICK_PRESETS[preset];

  const resolved: SimConfig = {
    ...DEFAULTS,
    ...partial,
    tickPreset: preset,
  };

  // Only apply preset-derived tickCount if the caller did not explicitly set tickCount
  if (partial.tickCount === undefined) {
    resolved.tickCount = tickCountFromPreset;
  }

  return resolved;
}
