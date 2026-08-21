import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';
import * as path from 'path';
import { Snapshot } from '../store/snapshot';

export interface LocationMatch {
	snapshot: Snapshot;
	currentRange: [number, number];
	drift: boolean;
}

// margin of lines around the snapshot's range that still counts as "near" —
// avoids requiring the cursor to sit on the exact line, while still
// requiring the edit to be local to the fix area, not anywhere in the file
const PROXIMITY_MARGIN_LINES = 3;

async function blameMap(git: SimpleGit, file: string): Promise<Map<number, string>> {
	const map = new Map<number, string>();
	try {
		const output = await git.raw(['blame', '--porcelain', '--', file]);
		const lineRegex = /^([0-9a-f]{40}) \d+ (\d+)/gm;
		let m: RegExpExecArray | null;
		while ((m = lineRegex.exec(output)) !== null) {
			map.set(parseInt(m[2], 10), m[1]);
		}
	} catch {
		// file has no git history (new/untracked) — no blame, nothing to track drift against
	}
	return map;
}

/**
 * "By location" match: compares file + line range against existing
 * snapshots, using `git blame` to follow the code block even if it moved
 * (drift) — the match stays valid while the current lines are still
 * attributed to the snapshot's fixCommit (untouched since then). If they've
 * been edited again, it's considered outside the MVP's "exact match"
 * threshold.
 *
 * On top of location itself, it requires `activeLine` (the cursor's line
 * at save time, 0-indexed) to be within the snapshot's current range, or at
 * most `PROXIMITY_MARGIN_LINES` lines away. Without this, any save of the
 * file — no matter what was touched — showed the ghost anchored at the
 * fix's lines, unrelated to what was actually being edited.
 */
export async function detectByLocation(
	workspaceRoot: string,
	document: vscode.TextDocument,
	snapshots: Snapshot[],
	activeLine: number | undefined
): Promise<LocationMatch[]> {
	if (activeLine === undefined) {
		return [];
	}

	const relativePath = path.relative(workspaceRoot, document.uri.fsPath).replace(/\\/g, '/');
	const candidates = snapshots.filter((s) => s.file === relativePath);
	if (candidates.length === 0) {
		return [];
	}

	const git = simpleGit(workspaceRoot);
	const blame = await blameMap(git, relativePath);
	if (blame.size === 0) {
		return [];
	}

	const editedLine = activeLine + 1; // git blame is 1-indexed, vscode.Position is 0-indexed

	const matches: LocationMatch[] = [];
	for (const snapshot of candidates) {
		const lines = [...blame.entries()]
			.filter(([, sha]) => sha === snapshot.fixCommit)
			.map(([line]) => line);

		if (lines.length === 0) {
			continue;
		}

		const currentRange: [number, number] = [Math.min(...lines), Math.max(...lines)];
		const isNear =
			editedLine >= currentRange[0] - PROXIMITY_MARGIN_LINES &&
			editedLine <= currentRange[1] + PROXIMITY_MARGIN_LINES;
		if (!isNear) {
			continue;
		}

		const drift = currentRange[0] !== snapshot.lineRange[0] || currentRange[1] !== snapshot.lineRange[1];
		matches.push({ snapshot, currentRange, drift });
	}

	return matches;
}
