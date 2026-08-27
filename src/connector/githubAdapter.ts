import type { IssueContext } from './issueTrackerConnector';

interface RepoRef {
	apiBase: string; // e.g. https://api.github.com or https://ghe.example.com/api/v3
	owner: string;
	repo: string;
}

function parseRepoRef(remoteUrl: string): RepoRef | null {
	const httpsMatch = remoteUrl.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(\.git)?\/?$/);
	const sshMatch = remoteUrl.match(/^git@([^:]+):([^/]+)\/([^/]+?)(\.git)?\/?$/);
	const match = httpsMatch ?? sshMatch;
	if (!match) {
		return null;
	}

	const [, host, owner, repo] = match;
	const apiBase = host === 'github.com' ? 'https://api.github.com' : `https://${host}/api/v3`;
	return { apiBase, owner, repo };
}

function parseIssueNumber(issueRef: string): number | null {
	const match = issueRef.match(/#(\d+)/);
	return match ? parseInt(match[1], 10) : null;
}

interface GithubIssueResponse {
	title?: string;
	body?: string | null;
	labels?: Array<string | { name?: string }>;
}

/**
 * REST-only (no GraphQL — see MVP_FASE2.md, Paso 2). Never throws: any
 * failure (bad remote, unsupported host, 401/404, network error) resolves
 * to `null` so the Snapshot Generator keeps working exactly like Phase 1
 * when there's no usable issue context.
 */
export async function fetchGithubIssueContext(remoteUrl: string, issueRef: string, token: string | undefined): Promise<IssueContext | null> {
	const repoRef = parseRepoRef(remoteUrl);
	const issueNumber = parseIssueNumber(issueRef);
	if (!repoRef || issueNumber === null) {
		return null;
	}

	try {
		const response = await fetch(`${repoRef.apiBase}/repos/${repoRef.owner}/${repoRef.repo}/issues/${issueNumber}`, {
			headers: {
				Accept: 'application/vnd.github+json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
		});
		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as GithubIssueResponse;
		return {
			title: data.title ?? '',
			body: data.body ?? '',
			labels: (data.labels ?? []).map((label) => (typeof label === 'string' ? label : (label.name ?? ''))).filter(Boolean),
		};
	} catch {
		return null;
	}
}
