import * as vscode from 'vscode';
import { getGhosts, onDidChangeGhosts } from './ghostState';
import { STRATEGY_SHORT_LABEL } from './strategyLabels';

/**
 * One CodeLens per ghost (detail + view) plus two quick-action ones
 * (Useful / Not relevant), all anchored to the same line.
 * `onDidChangeCodeLenses` fires whenever the global ghost state changes —
 * VS Code calls `provideCodeLenses` again for the visible documents.
 */
export class GhostCodeLensProvider implements vscode.CodeLensProvider {
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this.changeEmitter.event;

	constructor() {
		onDidChangeGhosts(() => this.changeEmitter.fire());
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const lenses: vscode.CodeLens[] = [];

		for (const ghost of getGhosts(document.uri)) {
			const range = new vscode.Range(ghost.line, 0, ghost.line, 0);
			const strategyLabel = STRATEGY_SHORT_LABEL[ghost.strategy];

			lenses.push(
				new vscode.CodeLens(range, {
					title: `👻 Similar bug fixed before (${strategyLabel}) — view detail`,
					command: 'dejabug.showGhostDetail',
					arguments: [document.uri, ghost.snapshot.id],
				}),
				new vscode.CodeLens(range, {
					title: '👍 Useful',
					command: 'dejabug.markUseful',
					arguments: [document.uri, ghost.snapshot.id],
				}),
				new vscode.CodeLens(range, {
					title: '👎 Not relevant',
					command: 'dejabug.markNotRelevant',
					arguments: [document.uri, ghost.snapshot.id],
				})
			);
		}

		return lenses;
	}
}
