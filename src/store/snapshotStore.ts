import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { NewSnapshotInput, Snapshot } from './snapshot';

const DEJABUG_DIR = '.dejabug';
const SNAPSHOTS_DIR = 'snapshots';

function snapshotsDir(workspaceRoot: string): string {
	return path.join(workspaceRoot, DEJABUG_DIR, SNAPSHOTS_DIR);
}

function snapshotFile(workspaceRoot: string, id: string): string {
	return path.join(snapshotsDir(workspaceRoot), `${id}.json`);
}

async function ensureDejabugDir(workspaceRoot: string): Promise<void> {
	await fs.mkdir(snapshotsDir(workspaceRoot), { recursive: true });
}

export async function saveSnapshot(workspaceRoot: string, input: NewSnapshotInput): Promise<Snapshot> {
	await ensureDejabugDir(workspaceRoot);

	const snapshot: Snapshot = {
		...input,
		id: randomUUID(),
		date: new Date().toISOString(),
		timesShown: 0,
		timesUseful: 0,
		schemaVersion: 1,
	};

	await fs.writeFile(snapshotFile(workspaceRoot, snapshot.id), JSON.stringify(snapshot, null, 2), 'utf-8');
	return snapshot;
}

export async function loadAllSnapshots(workspaceRoot: string): Promise<Snapshot[]> {
	await ensureDejabugDir(workspaceRoot);

	const dir = snapshotsDir(workspaceRoot);
	const files = await fs.readdir(dir);
	const jsonFiles = files.filter((f) => f.endsWith('.json'));

	const snapshots = await Promise.all(
		jsonFiles.map(async (file) => {
			const raw = await fs.readFile(path.join(dir, file), 'utf-8');
			const snapshot = JSON.parse(raw) as Snapshot;
			// Phase 1 snapshots predate schemaVersion — assume 1 in memory rather
			// than rewrite the file just for reading it (see MVP_FASE2.md, Paso 0)
			return snapshot.schemaVersion === undefined ? { ...snapshot, schemaVersion: 1 } : snapshot;
		})
	);

	return snapshots;
}

export async function updateSnapshotStats(
	workspaceRoot: string,
	id: string,
	field: 'timesShown' | 'timesUseful'
): Promise<Snapshot> {
	const file = snapshotFile(workspaceRoot, id);
	const raw = await fs.readFile(file, 'utf-8');
	const snapshot = JSON.parse(raw) as Snapshot;

	snapshot[field] += 1;
	// on-demand migration: any snapshot rewritten under normal use (a ghost shown
	// or marked useful) ends up persisted as schemaVersion 2 — see MVP_FASE2.md, Paso 3
	snapshot.schemaVersion = 2;

	await fs.writeFile(file, JSON.stringify(snapshot, null, 2), 'utf-8');
	return snapshot;
}

export async function deleteSnapshot(workspaceRoot: string, id: string): Promise<void> {
	await fs.unlink(snapshotFile(workspaceRoot, id));
}
