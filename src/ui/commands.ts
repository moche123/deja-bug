import * as vscode from 'vscode';
import * as path from 'path';
import simpleGit from 'simple-git';
import { loadAllSnapshots } from '../store/snapshotStore';
import { Snapshot } from '../store/snapshot';
import { findInnermostSymbolAt } from '../detector/symbolUtils';
import { confirmAndSaveSnapshot, findCauseCommit } from '../generator/snapshotGenerator';
import { revealSnapshot } from './ghostOverlay';

/**
 * Manual fallback for when a fix commit didn't follow the `Fixes #`/`Closes
 * #` convention, so the Git Watcher never picked it up. The user selects
 * the fixed code by hand and types the root cause themselves — there's no
 * commit message to draft a summary from, so this skips straight to asking
 * for it and reuses `confirmAndSaveSnapshot` for the actual save/confirm
 * step (same "Save" / "Edit summary" / "Discard" flow as the automatic
 * path).
 */
export async function createSnapshotFromSelection(workspaceRoot: string): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.selection.isEmpty) {
		vscode.window.showErrorMessage('DejaBug: select the already-fixed code in the editor before running this command.');
		return;
	}

	const { document, selection } = editor;
	const file = path.relative(workspaceRoot, document.uri.fsPath).replace(/\\/g, '/');
	const lineRange: [number, number] = [selection.start.line + 1, selection.end.line + 1];

	const git = simpleGit(workspaceRoot);
	const latest = (await git.log({ maxCount: 1 })).latest;
	if (!latest) {
		vscode.window.showErrorMessage('DejaBug: this repo has no commits yet, can\'t create a manual snapshot.');
		return;
	}
	const fixCommit = latest.hash;

	const symbol = (await findInnermostSymbolAt(document.uri, selection.start.line))?.name;

	const selectedFragment = document
		.getText(selection)
		.split('\n')
		.map((l) => l.trim())
		.find(Boolean);
	const causeCommit = await findCauseCommit(git, file, selectedFragment, fixCommit);

	const author = (await git.raw(['show', '-s', '--format=%an', fixCommit])).trim();

	const summary = await vscode.window.showInputBox({
		prompt: 'Root cause summary for this manual snapshot',
		placeHolder: 'e.g. race condition reading the cart before writing it',
	});
	if (summary === undefined) {
		return;
	}

	const issueRef = await vscode.window.showInputBox({
		prompt: 'Related issue or ticket (optional, Esc to skip)',
		placeHolder: '#123 or JIRA-456',
	});

	await confirmAndSaveSnapshot(workspaceRoot, {
		file,
		lineRange,
		symbol,
		fixCommit,
		causeCommit,
		issueRef: issueRef || undefined,
		rootCauseSummary: summary,
		tags: [],
		author,
	});
}

interface SnapshotQuickPickItem extends vscode.QuickPickItem {
	snapshot: Snapshot;
}

/**
 * Lets the user browse every saved snapshot via a quick pick and jump
 * straight to its file:line — mostly useful to explore `.dejabug/` without
 * having to grep JSON files by hand.
 */
export async function listSnapshots(workspaceRoot: string): Promise<void> {
	const snapshots = await loadAllSnapshots(workspaceRoot);
	if (snapshots.length === 0) {
		vscode.window.showInformationMessage('DejaBug: no snapshots saved in this workspace yet.');
		return;
	}

	const items: SnapshotQuickPickItem[] = snapshots
		.sort((a, b) => b.date.localeCompare(a.date))
		.map((snapshot) => ({
			label: `$(circle-outline) ${snapshot.file}:${snapshot.lineRange[0]}-${snapshot.lineRange[1]}`,
			description: snapshot.symbol ? `👻 ${snapshot.symbol}` : undefined,
			detail: snapshot.rootCauseSummary,
			snapshot,
		}));

	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: 'DejaBug: pick a snapshot to open',
		matchOnDescription: true,
		matchOnDetail: true,
	});
	if (!picked) {
		return;
	}

	const uri = vscode.Uri.file(path.join(workspaceRoot, picked.snapshot.file));
	const line = Math.max(picked.snapshot.lineRange[0] - 1, 0);
	try {
		await revealSnapshot(picked.snapshot, uri, line);
	} catch {
		vscode.window.showErrorMessage(`DejaBug: couldn't open ${picked.snapshot.file} (did it move or get deleted?).`);
	}
}
