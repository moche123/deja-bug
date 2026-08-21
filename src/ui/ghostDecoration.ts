import * as vscode from 'vscode';

let decorationType: vscode.TextEditorDecorationType | undefined;

/**
 * The `TextEditorDecorationType` is a shared resource for the whole
 * extension — created once (lazily) and reused across editors, instead of
 * creating a new one per decoration.
 */
function getGhostDecorationType(context: vscode.ExtensionContext): vscode.TextEditorDecorationType {
	if (!decorationType) {
		decorationType = vscode.window.createTextEditorDecorationType({
			gutterIconPath: context.asAbsolutePath('media/ghost.svg'),
			gutterIconSize: 'contain',
			overviewRulerColor: '#a78bfa',
			overviewRulerLane: vscode.OverviewRulerLane.Right,
		});
	}
	return decorationType;
}

export function applyGhostDecorations(context: vscode.ExtensionContext, editor: vscode.TextEditor, lines: number[]): void {
	const type = getGhostDecorationType(context);
	const ranges = lines.map((line) => new vscode.Range(line, 0, line, 0));
	editor.setDecorations(type, ranges);
}
