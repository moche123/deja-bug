import * as vscode from 'vscode';
import { Snapshot } from '../store/snapshot';
import { findInnermostSymbolAt } from './symbolUtils';
import { computeAstFingerprint } from './astFingerprint';

export interface StructuralMatch {
	snapshot: Snapshot;
	line: number; // 0-indexed, start line of the matched block in the current document
}

// used only when the active line isn't inside a resolvable symbol (e.g. top-level
// script code) — same idea as PROXIMITY_MARGIN_LINES in the location detector,
// just wider since here it delimits the whole block to fingerprint, not a margin
const FALLBACK_BLOCK_MARGIN_LINES = 10;

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

	const symbol = await findInnermostSymbolAt(document.uri, activeLine);
	let range: vscode.Range;
	let anchorLine: number;
	if (symbol) {
		range = symbol.range;
		anchorLine = symbol.range.start.line;
	} else {
		const start = Math.max(0, activeLine - FALLBACK_BLOCK_MARGIN_LINES);
		const end = Math.min(document.lineCount - 1, activeLine + FALLBACK_BLOCK_MARGIN_LINES);
		range = new vscode.Range(start, 0, end, document.lineAt(end).text.length);
		anchorLine = start;
	}

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
