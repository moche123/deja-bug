import type { IssueContext } from './issueTrackerConnector';

interface ProjectRef {
	host: string;
	projectPath: string; // "owner/repo", URL-encoded per GitLab's REST convention when used
}

function parseProjectRef(remoteUrl: string): ProjectRef | null {
	const httpsMatch = remoteUrl.match(/^https?:\/\/([^/]+)\/(.+?)(\.git)?\/?$/);
	const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(\.git)?\/?$/);
	const match = httpsMatch ?? sshMatch;
	if (!match) {
		return null;
	}

	const [, host, projectPath] = match;
	return { host, projectPath };
}

function parseIssueIid(issueRef: string): number | null {
	const match = issueRef.match(/#(\d+)/);
	return match ? parseInt(match[1], 10) : null;
}

interface GitlabIssueResponse {
	title?: string;
	description?: string | null;
	labels?: string[];
}

/**
 * REST-only, same fail-silent contract as `githubAdapter.ts` — see
 * MVP_FASE2.md, Paso 2. `projectPath` covers self-hosted GitLab (subgroups
 * included) since the host itself, not a fixed "gitlab.com", drives the API base.
 */
export async function fetchGitlabIssueContext(remoteUrl: string, issueRef: string, token: string | undefined): Promise<IssueContext | null> {
	const projectRef = parseProjectRef(remoteUrl);
	const issueIid = parseIssueIid(issueRef);
	if (!projectRef || issueIid === null) {
		return null;
	}

	try {
		const projectId = encodeURIComponent(projectRef.projectPath);
		const response = await fetch(`https://${projectRef.host}/api/v4/projects/${projectId}/issues/${issueIid}`, {
			headers: token ? { 'PRIVATE-TOKEN': token } : {},
		});
		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as GitlabIssueResponse;
		return {
			title: data.title ?? '',
			body: data.description ?? '',
			labels: data.labels ?? [],
		};
	} catch {
		return null;
	}
}
