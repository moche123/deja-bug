import * as vscode from 'vscode';
import { Snapshot } from '../store/snapshot';
import { loadAllSnapshots, updateSnapshotStats } from '../store/snapshotStore';
import { detectByLocation } from './locationDetector';
import { detectBySymbol } from './symbolDetector';

// 'manual' is never produced by detectProximity itself — it's used by
// listSnapshots (src/ui/commands.ts) to reuse the ghost overlay when the
// user browses a snapshot on purpose instead of it being auto-detected
export type ProximityStrategy = 'location' | 'symbol' | 'manual';

export interface ProximityMatch {
	snapshot: Snapshot;
	strategy: ProximityStrategy;
	line: number; // 0-indexed, line in the current document to anchor the ghost on
}

/**
 * MVP strategy cascade: location first (cheaper, only reads blame of the
 * saved file), symbol second and only over the snapshots location didn't
 * already resolve (avoids showing the same snapshot twice). `activeLine` is
 * the cursor's line in the active editor at save time; if the saved
 * document isn't the active editor, both strategies are skipped (neither
 * location nor symbol has a reliable reference line for what was being
 * edited).
 */
export async function detectProximity(
	workspaceRoot: string,
	document: vscode.TextDocument,
	activeLine: number | undefined
): Promise<ProximityMatch[]> {
	const snapshots = await loadAllSnapshots(workspaceRoot);
	if (snapshots.length === 0) {
		return [];
	}

	const byLocation = await detectByLocation(workspaceRoot, document, snapshots, activeLine);
	const alreadyMatched = new Set(byLocation.map((m) => m.snapshot.id));

	const matches: ProximityMatch[] = byLocation.map((m) => ({
		snapshot: m.snapshot,
		strategy: 'location' as const,
		line: m.currentRange[0] - 1,
	}));

	if (activeLine !== undefined) {
		const remaining = snapshots.filter((s) => !alreadyMatched.has(s.id));
		const bySymbol = await detectBySymbol(document, activeLine, remaining);
		matches.push(...bySymbol.map((m) => ({ snapshot: m.snapshot, strategy: 'symbol' as const, line: m.line })));
	}

	for (const match of matches) {
		await updateSnapshotStats(workspaceRoot, match.snapshot.id, 'timesShown');
	}

	return matches;
}
