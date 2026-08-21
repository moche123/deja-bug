import * as vscode from 'vscode';
import { getGhosts } from './ghostState';
import { STRATEGY_LONG_LABEL } from './strategyLabels';

export class GhostHoverProvider implements vscode.HoverProvider {
	provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
		const ghosts = getGhosts(document.uri).filter((g) => g.line === position.line);
		if (ghosts.length === 0) {
			return undefined;
		}

		const md = new vscode.MarkdownString(undefined, true);
		md.isTrusted = true;

		for (const ghost of ghosts) {
			const { snapshot } = ghost;
			md.appendMarkdown('### 👻 Similar bug fixed before\n\n');
			md.appendMarkdown(`${snapshot.rootCauseSummary}\n\n`);
			md.appendMarkdown(`**Detected by:** ${STRATEGY_LONG_LABEL[ghost.strategy]}\\\n`);
			md.appendMarkdown(`**Fix date:** ${new Date(snapshot.date).toLocaleDateString('en-US')}\\\n`);
			md.appendMarkdown(`**Author:** ${snapshot.author}\\\n`);
			if (snapshot.issueRef) {
				md.appendMarkdown(`**Issue:** ${snapshot.issueRef}\\\n`);
			}
			if (snapshot.prRef) {
				md.appendMarkdown(`**PR:** ${snapshot.prRef}\\\n`);
			}
			md.appendMarkdown(
				`\n[👍 Mark useful](command:dejabug.markUseful?${encodeURIComponent(JSON.stringify([document.uri.toString(), snapshot.id]))}) · ` +
					`[👎 Not relevant](command:dejabug.markNotRelevant?${encodeURIComponent(JSON.stringify([document.uri.toString(), snapshot.id]))})\n`
			);
			md.appendMarkdown('\n---\n');
		}

		return new vscode.Hover(md);
	}
}
