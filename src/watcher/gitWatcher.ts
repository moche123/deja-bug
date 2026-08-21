import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import simpleGit from 'simple-git';

export interface IssueRefMatch {
	keyword: string;
	ref: string;
}

export interface BugFixCommit {
	hash: string;
	message: string;
	refs: IssueRefMatch[];
}

const ISSUE_REF_PATTERN = /\b(fixes|closes)\s+(#\d+|[A-Za-z]+-\d+)\b/gi;

export function isGitRepo(workspaceRoot: string): boolean {
	return fs.existsSync(path.join(workspaceRoot, '.git'));
}

export function parseIssueRefs(commitMessage: string): IssueRefMatch[] {
	const matches: IssueRefMatch[] = [];
	const regex = new RegExp(ISSUE_REF_PATTERN);
	let match: RegExpExecArray | null;

	while ((match = regex.exec(commitMessage)) !== null) {
		matches.push({ keyword: match[1], ref: match[2] });
	}

	return matches;
}

export function startGitWatcher(
	context: vscode.ExtensionContext,
	workspaceRoot: string,
	onBugFixCommit: (commit: BugFixCommit) => void
): void {
	console.log(`[dejabug] startGitWatcher workspaceRoot=${workspaceRoot}`);

	if (!isGitRepo(workspaceRoot)) {
		console.log('[dejabug] not a git repo, watcher not starting');
		return;
	}

	const git = simpleGit(workspaceRoot);
	const headLogPattern = new vscode.RelativePattern(workspaceRoot, '.git/logs/HEAD');
	const watcher = vscode.workspace.createFileSystemWatcher(headLogPattern);

	const checkLatestCommit = async () => {
		console.log('[dejabug] .git/logs/HEAD changed, reading latest commit');
		const log = await git.log({ maxCount: 1 });
		const latest = log.latest;
		if (!latest) {
			console.log('[dejabug] git log returned no commits');
			return;
		}

		console.log(`[dejabug] latest commit: ${latest.hash} "${latest.message}"`);
		const refs = parseIssueRefs(latest.message);
		console.log(`[dejabug] refs detected: ${JSON.stringify(refs)}`);
		if (refs.length > 0) {
			onBugFixCommit({ hash: latest.hash, message: latest.message, refs });
		}
	};

	watcher.onDidChange(checkLatestCommit);
	watcher.onDidCreate(checkLatestCommit);

	context.subscriptions.push(watcher);
	console.log('[dejabug] .git/logs/HEAD watcher registered');
}
