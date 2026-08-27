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
			return JSON.parse(raw) as Snapshot;
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

	await fs.writeFile(file, JSON.stringify(snapshot, null, 2), 'utf-8');
	return snapshot;
}
