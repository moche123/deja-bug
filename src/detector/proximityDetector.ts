import * as vscode from 'vscode';
import { Snapshot } from '../store/snapshot';
import { loadAllSnapshots, updateSnapshotStats } from '../store/snapshotStore';
import { detectByLocation } from './locationDetector';
import { detectBySymbol } from './symbolDetector';
import { detectByStructure } from './structuralDetector';
import { detectBySemantic } from './semanticDetector';

// 'manual' is never produced by detectProximity itself — it's used by
// listSnapshots (src/ui/commands.ts) to reuse the ghost overlay when the
// user browses a snapshot on purpose instead of it being auto-detected
export type ProximityStrategy = 'location' | 'symbol' | 'structural' | 'semantic' | 'manual';

export interface ProximityMatch {
	snapshot: Snapshot;
	strategy: ProximityStrategy;
	line: number; // 0-indexed, line in the current document to anchor the ghost on
	similarity?: number; // cosine similarity, only set for 'semantic' matches
}

/**
 * Strategy cascade, cheapest to most expensive: location first (only reads
 * blame of the saved file), symbol second, structure third, semantic fourth
 * — each pass only runs over the snapshots the previous ones didn't already
 * resolve (avoids showing the same snapshot twice). `activeLine` is the
 * cursor's line in the active editor at save time; if the saved document
 * isn't the active editor, all four strategies are skipped (none of them
 * has a reliable reference line for what was being edited).
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
		const remainingAfterLocation = snapshots.filter((s) => !alreadyMatched.has(s.id));
		const bySymbol = await detectBySymbol(document, activeLine, remainingAfterLocation);
		matches.push(...bySymbol.map((m) => ({ snapshot: m.snapshot, strategy: 'symbol' as const, line: m.line })));
		for (const m of bySymbol) {
			alreadyMatched.add(m.snapshot.id);
		}

		const remainingAfterSymbol = snapshots.filter((s) => !alreadyMatched.has(s.id));
		const byStructure = await detectByStructure(document, activeLine, remainingAfterSymbol);
		matches.push(...byStructure.map((m) => ({ snapshot: m.snapshot, strategy: 'structural' as const, line: m.line })));
		for (const m of byStructure) {
			alreadyMatched.add(m.snapshot.id);
		}

		const remainingAfterStructure = snapshots.filter((s) => !alreadyMatched.has(s.id));
		const bySemantic = await detectBySemantic(document, activeLine, remainingAfterStructure);
		matches.push(...bySemantic.map((m) => ({ snapshot: m.snapshot, strategy: 'semantic' as const, line: m.line, similarity: m.similarity })));
	}

	for (const match of matches) {
		await updateSnapshotStats(workspaceRoot, match.snapshot.id, 'timesShown');
	}

	return matches;
}
