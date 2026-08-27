import * as vscode from 'vscode';
import { Snapshot } from '../store/snapshot';
import { resolveBlockRange } from './symbolUtils';
import { computeAstFingerprint } from './astFingerprint';

export interface StructuralMatch {
	snapshot: Snapshot;
	line: number; // 0-indexed, start line of the matched block in the current document
}

/**
 * "By structure" match: the most expensive strategy in the cascade, so it
 * only runs over the snapshots that location and symbol didn't already
 * resolve. Compares the AST fingerprint of the block around `activeLine`
 * against `snapshot.astFingerprint` — a match is any non-empty intersection
 * of pattern ids, not an exact fingerprint match (two blocks can share one
 * risky pattern without being identical in everything else).
 */
export async function detectByStructure(
	document: vscode.TextDocument,
	activeLine: number,
	snapshots: Snapshot[]
): Promise<StructuralMatch[]> {
	const withFingerprint = snapshots.filter((s): s is Snapshot & { astFingerprint: string } => !!s.astFingerprint);
	if (withFingerprint.length === 0) {
		return [];
	}

	const range = await resolveBlockRange(document, activeLine);
	const anchorLine = range.start.line;

	const rangeStart = document.offsetAt(range.start);
	const rangeEnd = document.offsetAt(range.end);
	const currentPatterns = new Set(computeAstFingerprint(document.getText(), rangeStart, rangeEnd));
	if (currentPatterns.size === 0) {
		return [];
	}

	const matches: StructuralMatch[] = [];
	for (const snapshot of withFingerprint) {
		const snapshotPatterns = snapshot.astFingerprint.split(',');
		if (snapshotPatterns.some((p) => currentPatterns.has(p))) {
			matches.push({ snapshot, line: anchorLine });
		}
	}
	return matches;
}
