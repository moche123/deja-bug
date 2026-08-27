import * as vscode from 'vscode';
import { updateSnapshotStats } from '../store/snapshotStore';
import { Snapshot } from '../store/snapshot';
import { ProximityMatch } from '../detector/proximityDetector';
import { applyGhostDecorations } from './ghostDecoration';
import { GhostCodeLensProvider } from './ghostCodeLens';
import { GhostHoverProvider } from './ghostHover';
import { setGhosts, getGhosts, addGhost, dismissGhost, clearGhosts, onDidChangeGhosts } from './ghostState';
import { recordSemanticFeedback } from '../detector/semanticFeedback';

function normalizeUri(uri: vscode.Uri | string): vscode.Uri {
	return typeof uri === 'string' ? vscode.Uri.parse(uri) : uri;
}

function refreshDecorations(context: vscode.ExtensionContext, uri: vscode.Uri): void {
	const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
	if (!editor) {
		return;
	}
	const lines = getGhosts(uri).map((g) => g.line);
	applyGhostDecorations(context, editor, lines);
}

/**
 * Registers the overlay's three providers (gutter decoration, CodeLens,
 * hover) and its three action commands (show detail, useful, not
 * relevant). Everything reads/writes the shared state in `ghostState.ts` —
 * this module doesn't detect anything, it only draws what `detectProximity`
 * already computed.
 */
export function registerGhostOverlay(context: vscode.ExtensionContext, workspaceRoot: string): void {
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ scheme: 'file' }, new GhostCodeLensProvider()),
		vscode.languages.registerHoverProvider({ scheme: 'file' }, new GhostHoverProvider())
	);

	context.subscriptions.push(onDidChangeGhosts((uri) => refreshDecorations(context, uri)));

	context.subscriptions.push(
		vscode.window.onDidChangeVisibleTextEditors((editors) => {
			for (const editor of editors) {
				refreshDecorations(context, editor.document.uri);
			}
		})
	);

	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => clearGhosts(document.uri)));

	context.subscriptions.push(
		vscode.commands.registerCommand('dejabug.showGhostDetail', async (uri: vscode.Uri | string, snapshotId: string) => {
			const docUri = normalizeUri(uri);
			const ghost = getGhosts(docUri).find((g) => g.snapshot.id === snapshotId);
			if (!ghost) {
				return;
			}
			const editor = await vscode.window.showTextDocument(docUri);
			const pos = new vscode.Position(ghost.line, 0);
			editor.selection = new vscode.Selection(pos, pos);
			editor.revealRange(new vscode.Range(pos, pos));
			await vscode.commands.executeCommand('editor.action.showHover');
		}),

		vscode.commands.registerCommand('dejabug.markUseful', async (uri: vscode.Uri | string, snapshotId: string) => {
			const docUri = normalizeUri(uri);
			const ghost = getGhosts(docUri).find((g) => g.snapshot.id === snapshotId);
			await updateSnapshotStats(workspaceRoot, snapshotId, 'timesUseful');
			if (ghost?.strategy === 'semantic') {
				await recordSemanticFeedback(context, true);
			}
			dismissGhost(docUri, snapshotId);
			vscode.window.showInformationMessage('DejaBug: marked as useful, thanks!');
		}),

		vscode.commands.registerCommand('dejabug.markNotRelevant', async (uri: vscode.Uri | string, snapshotId: string) => {
			const docUri = normalizeUri(uri);
			const ghost = getGhosts(docUri).find((g) => g.snapshot.id === snapshotId);
			// MVP: nothing gets decremented on the snapshot itself yet (no field for that
			// in the data model) — semantic ghosts specifically feed the Phase 3 threshold
			// feedback loop instead (see semanticFeedback.ts)
			console.log(`[dejabug] snapshot ${snapshotId} marked as not relevant in ${docUri.fsPath}`);
			if (ghost?.strategy === 'semantic') {
				await recordSemanticFeedback(context, false);
			}
			dismissGhost(docUri, snapshotId);
		})
	);
}

export function publishGhosts(uri: vscode.Uri, matches: ProximityMatch[]): void {
	setGhosts(uri, matches);
}

/**
 * Opens a snapshot on purpose (e.g. from "View All Snapshots") reusing the
 * exact same overlay a real proximity match gets — gutter icon, CodeLens
 * with "view detail" / "Useful" / "Not relevant", and the hover card forced
 * open immediately, instead of just moving the cursor and leaving the user
 * to hover over the line themselves. "Not relevant" doubles as the "close"
 * action: it dismisses this ghost the same way it dismisses a real detected
 * one.
 */
export async function revealSnapshot(snapshot: Snapshot, uri: vscode.Uri, line: number): Promise<void> {
	addGhost(uri, { snapshot, strategy: 'manual', line });

	const editor = await vscode.window.showTextDocument(uri);
	const pos = new vscode.Position(line, 0);
	editor.selection = new vscode.Selection(pos, pos);
	editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
	await vscode.commands.executeCommand('editor.action.showHover');
}
