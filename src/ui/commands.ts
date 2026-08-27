import * as vscode from 'vscode';
import * as path from 'path';
import simpleGit from 'simple-git';
import { loadAllSnapshots, deleteSnapshot } from '../store/snapshotStore';
import { Snapshot } from '../store/snapshot';
import { findInnermostSymbolAt } from '../detector/symbolUtils';
import { confirmAndSaveSnapshot, findCauseCommit } from '../generator/snapshotGenerator';
import { revealSnapshot } from './ghostOverlay';
import { GITHUB_TOKEN_KEY, GITLAB_TOKEN_KEY } from '../connector/issueTrackerConnector';
import { findDuplicateSnapshots } from '../store/duplicateFinder';

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

async function setToken(secrets: vscode.SecretStorage, key: string, providerLabel: string): Promise<void> {
	const token = await vscode.window.showInputBox({
		prompt: `${providerLabel} personal access token (read-only scope on issues only — never a token with write access)`,
		password: true,
		placeHolder: 'Leave empty and press Enter to clear the stored token',
	});
	if (token === undefined) {
		return;
	}
	if (token === '') {
		await secrets.delete(key);
		vscode.window.showInformationMessage(`DejaBug: ${providerLabel} token cleared.`);
		return;
	}
	await secrets.store(key, token);
	vscode.window.showInformationMessage(`DejaBug: ${providerLabel} token saved.`);
}

export function setGithubToken(secrets: vscode.SecretStorage): Promise<void> {
	return setToken(secrets, GITHUB_TOKEN_KEY, 'GitHub');
}

export function setGitlabToken(secrets: vscode.SecretStorage): Promise<void> {
	return setToken(secrets, GITLAB_TOKEN_KEY, 'GitLab');
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

/**
 * Groups snapshots that look like duplicates (same fix commit, or same
 * file with overlapping line ranges — typically two branches that each
 * snapshotted the same fix before merging) and lets the user pick which
 * one to keep per group via a QuickPick. Nothing is deleted without that
 * explicit per-group choice; skipping a group (Esc) leaves it untouched.
 */
export async function findDuplicateSnapshotsCommand(workspaceRoot: string): Promise<void> {
	const snapshots = await loadAllSnapshots(workspaceRoot);
	const groups = findDuplicateSnapshots(snapshots);

	if (groups.length === 0) {
		vscode.window.showInformationMessage('DejaBug: no duplicate snapshots found.');
		return;
	}

	for (const group of groups) {
		const sorted = [...group].sort((a, b) => b.date.localeCompare(a.date));
		const items: SnapshotQuickPickItem[] = sorted.map((snapshot) => ({
			label: `$(circle-outline) ${snapshot.file}:${snapshot.lineRange[0]}-${snapshot.lineRange[1]}`,
			description: new Date(snapshot.date).toLocaleString(),
			detail: snapshot.rootCauseSummary,
			snapshot,
		}));

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: `DejaBug: ${group.length} duplicates for ${sorted[0].file} — pick the one to keep`,
			matchOnDetail: true,
		});
		if (!picked) {
			continue;
		}

		const toRemove = group.filter((s) => s.id !== picked.snapshot.id);
		for (const snapshot of toRemove) {
			await deleteSnapshot(workspaceRoot, snapshot.id);
		}
		vscode.window.showInformationMessage(`DejaBug: kept 1 snapshot, removed ${toRemove.length} duplicate(s) for ${sorted[0].file}.`);
	}
}
