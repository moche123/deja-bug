import * as vscode from 'vscode';
import { Snapshot } from '../store/snapshot';
import { findInnermostSymbolAt } from './symbolUtils';

export interface SymbolMatch {
	snapshot: Snapshot;
	line: number; // 0-indexed, start line of the symbol in the current document
}

/**
 * "By symbol" match: finds the function/class/method containing the active
 * line and compares it against `snapshot.symbol`, regardless of the file.
 * Only runs over snapshots that already have `symbol` populated (set by the
 * Snapshot Generator on save).
 */
export async function detectBySymbol(
	document: vscode.TextDocument,
	activeLine: number,
	snapshots: Snapshot[]
): Promise<SymbolMatch[]> {
	const withSymbol = snapshots.filter((s) => !!s.symbol);
	if (withSymbol.length === 0) {
		return [];
	}

	const currentSymbol = await findInnermostSymbolAt(document.uri, activeLine);
	if (!currentSymbol) {
		return [];
	}

	return withSymbol
		.filter((snapshot) => snapshot.symbol === currentSymbol.name)
		.map((snapshot) => ({ snapshot, line: currentSymbol.range.start.line }));
}
