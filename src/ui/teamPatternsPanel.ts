import * as vscode from 'vscode';
import { loadAllSnapshots } from '../store/snapshotStore';

function countBy<T>(items: T[], keyFn: (item: T) => string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of items) {
		for (const key of keyFn(item)) {
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return counts;
}

function sortedEntries(counts: Map<string, number>): [string, number][] {
	return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderList(title: string, entries: [string, number][], emptyLabel: string): string {
	const rows =
		entries.length > 0
			? entries.map(([key, count]) => `<li><span class="count">${count}</span> ${escapeHtml(key)}</li>`).join('')
			: `<li class="empty">${escapeHtml(emptyLabel)}</li>`;
	return `<section><h2>${escapeHtml(title)}</h2><ul>${rows}</ul></section>`;
}

/**
 * Groups every snapshot in `.dejabug/` by structural pattern, tag, and
 * author, and shows it as a simple Webview. No new sync mechanism needed:
 * snapshots already travel between teammates via `.dejabug/` versioned in
 * git since Phase 1 — this is just a read-only view over what a `git pull`
 * already brought in locally.
 */
export async function showTeamPatterns(workspaceRoot: string): Promise<void> {
	const snapshots = await loadAllSnapshots(workspaceRoot);

	const byPattern = countBy(snapshots, (s) => (s.astFingerprint ? s.astFingerprint.split(',') : []));
	const byTag = countBy(snapshots, (s) => s.tags);
	const byAuthor = countBy(snapshots, (s) => [s.author]);

	const panel = vscode.window.createWebviewPanel('dejabugTeamPatterns', 'DejaBug: Team Patterns', vscode.ViewColumn.Active, {});

	panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); padding: 1rem; color: var(--vscode-foreground); }
  h1 { font-size: 1.2rem; }
  h2 { font-size: 1rem; margin-top: 1.5rem; }
  ul { list-style: none; padding: 0; }
  li { padding: 0.25rem 0; }
  .count { display: inline-block; min-width: 2rem; font-weight: bold; color: var(--vscode-textLink-foreground); }
  .empty { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>
<h1>👻 DejaBug — Team Patterns (${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'})</h1>
${renderList('Most recurring structural patterns', sortedEntries(byPattern), 'No structural patterns recorded yet.')}
${renderList('Most common tags', sortedEntries(byTag), 'No tags recorded yet.')}
${renderList('Snapshots by author', sortedEntries(byAuthor), 'No snapshots yet.')}
</body>
</html>`;
}
