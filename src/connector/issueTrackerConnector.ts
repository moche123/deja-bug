import * as vscode from 'vscode';
import simpleGit from 'simple-git';
import { fetchGithubIssueContext } from './githubAdapter';
import { fetchGitlabIssueContext } from './gitlabAdapter';

export interface IssueContext {
	title: string;
	body: string;
	labels: string[];
}

// context.secrets keys — never stored in settings.json, only in the OS keychain
export const GITHUB_TOKEN_KEY = 'dejabug.githubToken';
export const GITLAB_TOKEN_KEY = 'dejabug.gitlabToken';

function detectHost(remoteUrl: string): string | null {
	const httpsMatch = remoteUrl.match(/^https?:\/\/([^/]+)\//);
	if (httpsMatch) {
		return httpsMatch[1];
	}
	const sshMatch = remoteUrl.match(/^git@([^:]+):/);
	if (sshMatch) {
		return sshMatch[1];
	}
	return null;
}

/**
 * Resolves title/body/labels for `issueRef` against whichever tracker the
 * repo's `origin` remote points to (github.com/GHE or gitlab.com/self-hosted
 * GitLab, detected from the host). Fails silently on anything — no remote,
 * unsupported host, missing/invalid token, network error — so the Snapshot
 * Generator keeps working exactly like Phase 1 when this returns `null`.
 */
export async function resolveIssueContext(workspaceRoot: string, issueRef: string, secrets: vscode.SecretStorage): Promise<IssueContext | null> {
	try {
		const git = simpleGit(workspaceRoot);
		const remoteUrl = (await git.raw(['remote', 'get-url', 'origin'])).trim();
		const host = detectHost(remoteUrl);
		if (!host) {
			return null;
		}

		if (host.includes('github')) {
			const token = await secrets.get(GITHUB_TOKEN_KEY);
			return await fetchGithubIssueContext(remoteUrl, issueRef, token);
		}

		if (host.includes('gitlab')) {
			const token = await secrets.get(GITLAB_TOKEN_KEY);
			return await fetchGitlabIssueContext(remoteUrl, issueRef, token);
		}

		return null;
	} catch {
		return null;
	}
}
