// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { startGitWatcher } from './watcher/gitWatcher';
import { buildSnapshotDrafts, confirmAndSaveSnapshot } from './generator/snapshotGenerator';
import { detectProximity } from './detector/proximityDetector';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "dejabug" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('dejabug.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from DejaBug!');
	});

	context.subscriptions.push(disposable);

	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	console.log(`[dejabug] workspaceFolders=${JSON.stringify(vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath))}`);
	if (workspaceRoot) {
		startGitWatcher(context, workspaceRoot, async (commit) => {
			const drafts = await buildSnapshotDrafts(workspaceRoot, commit);
			for (const draft of drafts) {
				await confirmAndSaveSnapshot(workspaceRoot, draft);
			}
		});

		context.subscriptions.push(
			vscode.workspace.onDidSaveTextDocument(async (document) => {
				const activeEditor = vscode.window.activeTextEditor;
				const activeLine =
					activeEditor && activeEditor.document.uri.toString() === document.uri.toString()
						? activeEditor.selection.active.line
						: undefined;

				const matches = await detectProximity(workspaceRoot, document, activeLine);
				// UI real (gutter + CodeLens + hover) llega en Paso 5 — placeholder por ahora
				for (const match of matches) {
					const [inicio, fin] = match.rangoActual ?? match.snapshot.rango_lineas;
					vscode.window.showWarningMessage(
						`👻 DejaBug (${match.estrategia}): posible bug similar en ${match.snapshot.archivo}:${inicio}-${fin} — "${match.snapshot.resumen_causa}"`
					);
				}
			})
		);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
