import * as vscode from 'vscode';

export interface SymbolAt {
	name: string;
	range: vscode.Range;
}

/**
 * Innermost symbol (function/class/method) containing a given line, via
 * VS Code's native language server. Shared by the Snapshot Generator (to
 * populate `symbol` on save), the Proximity Detector (to match "by
 * symbol"), and the Ghost Overlay (to anchor the decoration to the
 * symbol's start in the current document).
 */
export async function findInnermostSymbolAt(uri: vscode.Uri, line: number): Promise<SymbolAt | undefined> {
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
		'vscode.executeDocumentSymbolProvider',
		uri
	);
	if (!symbols || symbols.length === 0) {
		return undefined;
	}

	const flat: vscode.DocumentSymbol[] = [];
	const walk = (list: vscode.DocumentSymbol[]) => {
		for (const s of list) {
			flat.push(s);
			if (s.children?.length) {
				walk(s.children);
			}
		}
	};
	walk(symbols);

	const containers = flat.filter((s) => s.range.start.line <= line && line <= s.range.end.line);
	if (containers.length === 0) {
		return undefined;
	}

	const innermost = containers.reduce((a, b) =>
		b.range.end.line - b.range.start.line < a.range.end.line - a.range.start.line ? b : a
	);
	return { name: innermost.name, range: innermost.range };
}

// used only when the active line isn't inside a resolvable symbol (e.g. top-level
// script code) — same idea as PROXIMITY_MARGIN_LINES in the location detector,
// just wider since here it delimits the whole block to analyze, not a margin
const FALLBACK_BLOCK_MARGIN_LINES = 10;

/**
 * The block of code around `activeLine` to analyze — the containing symbol's
 * range if one resolves, otherwise a fixed line margin around the cursor.
 * Shared by the structural and semantic detectors (both need "the block
 * around the cursor", not just the single line) and by the Snapshot
 * Generator's fingerprint/embedding computation.
 */
export async function resolveBlockRange(document: vscode.TextDocument, activeLine: number): Promise<vscode.Range> {
	const symbol = await findInnermostSymbolAt(document.uri, activeLine);
	if (symbol) {
		return symbol.range;
	}

	const start = Math.max(0, activeLine - FALLBACK_BLOCK_MARGIN_LINES);
	const end = Math.min(document.lineCount - 1, activeLine + FALLBACK_BLOCK_MARGIN_LINES);
	return new vscode.Range(start, 0, end, document.lineAt(end).text.length);
}
