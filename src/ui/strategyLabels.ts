import { ProximityStrategy } from '../detector/proximityDetector';

// human-readable phrasing for the internal strategy values, used by the
// CodeLens (short) and the hover card (long)
export const STRATEGY_SHORT_LABEL: Record<ProximityStrategy, string> = {
	location: 'location',
	symbol: 'symbol',
	structural: 'structural',
	manual: 'manually opened',
};

export const STRATEGY_LONG_LABEL: Record<ProximityStrategy, string> = {
	location: 'location (same line untouched since the fix)',
	symbol: 'symbol (same function/class, different file)',
	structural: 'structural (similar risky code shape — heuristic, weigh with less confidence)',
	manual: 'opened by hand from "View All Snapshots"',
};
