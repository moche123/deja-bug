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
