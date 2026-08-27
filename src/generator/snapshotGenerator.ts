import * as vscode from 'vscode';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { saveSnapshot } from '../store/snapshotStore';
import { NewSnapshotInput } from '../store/snapshot';
import { BugFixCommit } from '../watcher/gitWatcher';
import { findInnermostSymbolAt, SymbolAt } from '../detector/symbolUtils';
import { computeAstFingerprint } from '../detector/astFingerprint';

interface FileHunk {
	file: string;
	lineRange: [number, number];
	searchFragment?: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function parseFirstHunkPerFile(diffText: string): FileHunk[] {
	const hunks: FileHunk[] = [];
	const seen = new Set<string>();
	let currentFile: string | null = null;
	const lines = diffText.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (line.startsWith('+++ ')) {
			const filePath = line.slice(4).trim();
			currentFile = filePath === '/dev/null' ? null : filePath.replace(/^b\//, '');
			continue;
		}

		if (!currentFile || seen.has(currentFile)) {
			continue;
		}

		const match = HUNK_HEADER.exec(line);
		if (!match) {
			continue;
		}

		const start = parseInt(match[1], 10);
		const len = match[2] !== undefined ? parseInt(match[2], 10) : 1;
		const end = start + Math.max(len, 1) - 1;

		// Prefer the REMOVED line (the buggy code) for the -S search: that's what needs
		// to be traced back to the commit that introduced it. If the hunk is a pure
		// insertion (nothing removed), fall back to the first added line.
		let removedFragment: string | undefined;
		let addedFragment: string | undefined;
		for (let j = i + 1; j < lines.length; j++) {
			const l = lines[j];
			if (l.startsWith('@@') || l.startsWith('diff --git')) {
				break;
			}
			if (l.startsWith('-') && !l.startsWith('---') && !removedFragment) {
				const trimmed = l.slice(1).trim();
				if (trimmed) {
					removedFragment = trimmed;
				}
			}
			if (l.startsWith('+') && !l.startsWith('+++') && !addedFragment) {
				const trimmed = l.slice(1).trim();
				if (trimmed) {
					addedFragment = trimmed;
				}
			}
			if (removedFragment && addedFragment) {
				break;
			}
		}

		hunks.push({ file: currentFile, lineRange: [start, end], searchFragment: removedFragment ?? addedFragment });
		seen.add(currentFile);
	}

	return hunks;
}

export async function findCauseCommit(
	git: SimpleGit,
	file: string,
	fragment: string | undefined,
	fixCommitHash: string
): Promise<string | null> {
	if (!fragment) {
		return null;
	}

	try {
		const output = await git.raw(['log', '--format=%H', '-S', fragment, '--', file]);
		const hashes = output.split('\n').map((h) => h.trim()).filter(Boolean);
		return hashes.find((h) => h !== fixCommitHash) ?? null;
	} catch {
		return null;
	}
}

async function resolveSymbol(workspaceRoot: string, file: string, zeroBasedLine: number): Promise<SymbolAt | undefined> {
	try {
		const uri = vscode.Uri.file(path.join(workspaceRoot, file));
		// opening the document forces the matching language server to index it
		// before asking it for symbols (otherwise executeDocumentSymbolProvider returns empty)
		await vscode.workspace.openTextDocument(uri);
		return await findInnermostSymbolAt(uri, zeroBasedLine);
	} catch {
		return undefined;
	}
}

/**
 * AST fingerprint of the block around the hunk: the containing symbol's
 * range if one was resolved, otherwise the hunk's own line range. Reads the
 * current file on disk (post-fix state) — same source `resolveSymbol`
 * already reads for the `symbol` field.
 */
async function computeHunkFingerprint(workspaceRoot: string, hunk: FileHunk, symbol: SymbolAt | undefined): Promise<string | undefined> {
	try {
		const uri = vscode.Uri.file(path.join(workspaceRoot, hunk.file));
		const document = await vscode.workspace.openTextDocument(uri);

		let range: vscode.Range;
		if (symbol) {
			range = symbol.range;
		} else {
			const endLine = Math.min(hunk.lineRange[1] - 1, document.lineCount - 1);
			range = new vscode.Range(hunk.lineRange[0] - 1, 0, endLine, document.lineAt(endLine).text.length);
		}

		const patterns = computeAstFingerprint(document.getText(), document.offsetAt(range.start), document.offsetAt(range.end));
		return patterns.length > 0 ? patterns.join(',') : undefined;
	} catch {
		return undefined;
	}
}

export async function buildSnapshotDrafts(workspaceRoot: string, commit: BugFixCommit): Promise<NewSnapshotInput[]> {
	const git = simpleGit(workspaceRoot);
	const diffText = await git.raw(['show', commit.hash, '--unified=0', '--format=']);
	const hunks = parseFirstHunkPerFile(diffText);

	const author = (await git.raw(['show', '-s', '--format=%an', commit.hash])).trim();
	const issueRef = commit.refs.map((r) => r.ref).join(', ') || undefined;

	const drafts: NewSnapshotInput[] = [];
	for (const hunk of hunks) {
		const causeCommit = await findCauseCommit(git, hunk.file, hunk.searchFragment, commit.hash);
		const symbol = await resolveSymbol(workspaceRoot, hunk.file, hunk.lineRange[0] - 1);
		const astFingerprint = await computeHunkFingerprint(workspaceRoot, hunk, symbol);
		drafts.push({
			file: hunk.file,
			lineRange: hunk.lineRange,
			symbol: symbol?.name,
			fixCommit: commit.hash,
			causeCommit,
			issueRef,
			rootCauseSummary: commit.message,
			tags: [],
			author,
			astFingerprint,
		});
	}

	return drafts;
}

export async function confirmAndSaveSnapshot(workspaceRoot: string, draft: NewSnapshotInput): Promise<void> {
	const [start, end] = draft.lineRange;
	const choice = await vscode.window.showInformationMessage(
		`DejaBug: save snapshot for ${draft.file}:${start}-${end}?\n"${draft.rootCauseSummary}"`,
		'Save',
		'Edit summary',
		'Discard'
	);

	if (choice === undefined || choice === 'Discard') {
		return;
	}

	let summary = draft.rootCauseSummary;
	if (choice === 'Edit summary') {
		const edited = await vscode.window.showInputBox({
			prompt: 'Root cause summary',
			value: draft.rootCauseSummary,
		});
		if (edited === undefined) {
			return;
		}
		summary = edited;
	}

	const saved = await saveSnapshot(workspaceRoot, { ...draft, rootCauseSummary: summary });
	vscode.window.showInformationMessage(`DejaBug: snapshot saved (${saved.id.slice(0, 8)})`);
}
