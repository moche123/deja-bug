import * as vscode from 'vscode';
import { Snapshot } from '../store/snapshot';
import { resolveBlockRange } from './symbolUtils';
import { computeEmbedding } from '../embeddings/embeddingProvider';

export interface SemanticMatch {
	snapshot: Snapshot;
	line: number; // 0-indexed, start line of the matched block in the current document
	similarity: number;
}

const DEFAULT_THRESHOLD = 0.86;

function dot(a: number[], b: number[]): number {
	return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

function currentThreshold(): number {
	return vscode.workspace.getConfiguration('dejabug').get<number>('semanticThreshold', DEFAULT_THRESHOLD);
}

/**
 * "By semantic" match: the last and most expensive strategy in the cascade —
 * only runs over the snapshots location, symbol, and structure didn't
 * already resolve. Embeddings are mean-pooled and normalized (see
 * `embeddingProvider.ts`), so cosine similarity is just a dot product. If
 * the local model failed to load, `computeEmbedding` returns `null` and
 * this strategy is silently skipped — never blocks the rest of the cascade.
 */
export async function detectBySemantic(
	document: vscode.TextDocument,
	activeLine: number,
	snapshots: Snapshot[]
): Promise<SemanticMatch[]> {
	const withEmbedding = snapshots.filter((s): s is Snapshot & { embedding: number[] } => !!s.embedding && s.embedding.length > 0);
	if (withEmbedding.length === 0) {
		return [];
	}

	const range = await resolveBlockRange(document, activeLine);
	const anchorLine = range.start.line;
	const blockText = document.getText(range);

	const currentEmbedding = await computeEmbedding(blockText);
	if (!currentEmbedding) {
		return [];
	}

	const threshold = currentThreshold();
	const matches: SemanticMatch[] = [];
	for (const snapshot of withEmbedding) {
		const similarity = dot(currentEmbedding, snapshot.embedding);
		if (similarity >= threshold) {
			matches.push({ snapshot, line: anchorLine, similarity });
		}
	}
	return matches;
}
