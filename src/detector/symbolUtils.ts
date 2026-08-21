import * as vscode from 'vscode';

/**
 * Símbolo (función/clase/método) más interno que contiene una línea dada,
 * vía el language server nativo de VS Code. Compartido entre el Snapshot
 * Generator (para poblar `simbolo` al guardar) y el Proximity Detector
 * (para matchear "por símbolo").
 */
export async function findInnermostSymbolAt(uri: vscode.Uri, line: number): Promise<string | undefined> {
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

	const contenedores = flat.filter((s) => s.range.start.line <= line && line <= s.range.end.line);
	if (contenedores.length === 0) {
		return undefined;
	}

	const masInterno = contenedores.reduce((a, b) =>
		b.range.end.line - b.range.start.line < a.range.end.line - a.range.start.line ? b : a
	);
	return masInterno.name;
}
