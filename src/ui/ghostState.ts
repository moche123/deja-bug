import * as vscode from 'vscode';
import { ProximityMatch } from '../detector/proximityDetector';

/**
 * Shared state of which ghosts are active in each open document, in memory
 * (not persisted to disk — recalculated on every save). The gutter
 * decoration, the CodeLens and the hover all read from here; none of them
 * calls `detectProximity` on their own.
 */
const documentState = new Map<string, ProximityMatch[]>();

const emitter = new vscode.EventEmitter<vscode.Uri>();
export const onDidChangeGhosts = emitter.event;

export function setGhosts(uri: vscode.Uri, matches: ProximityMatch[]): void {
	documentState.set(uri.toString(), matches);
	emitter.fire(uri);
}

export function getGhosts(uri: vscode.Uri): ProximityMatch[] {
	return documentState.get(uri.toString()) ?? [];
}

/**
 * Adds (or updates) a single ghost without replacing the rest of the
 * document's state — unlike `setGhosts`, which is a full replace used after
 * each `detectProximity` run on save. Used when a snapshot is opened on
 * purpose (e.g. from "Ver todos los snapshots") instead of being detected.
 */
export function addGhost(uri: vscode.Uri, match: ProximityMatch): void {
	const key = uri.toString();
	const current = documentState.get(key) ?? [];
	documentState.set(key, [...current.filter((m) => m.snapshot.id !== match.snapshot.id), match]);
	emitter.fire(uri);
}

export function clearGhosts(uri: vscode.Uri): void {
	documentState.delete(uri.toString());
	emitter.fire(uri);
}

/**
 * Dismisses a single ghost (by snapshot) without touching the rest of the
 * same document — used by the "Useful" and "Not relevant" commands to make
 * it disappear from the editor instantly.
 */
export function dismissGhost(uri: vscode.Uri, snapshotId: string): void {
	const key = uri.toString();
	const current = documentState.get(key) ?? [];
	documentState.set(
		key,
		current.filter((m) => m.snapshot.id !== snapshotId)
	);
	emitter.fire(uri);
}
