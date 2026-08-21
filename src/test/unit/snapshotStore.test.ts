import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { saveSnapshot, loadAllSnapshots, updateSnapshotStats } from '../../store/snapshotStore';
import { NewSnapshotInput } from '../../store/snapshot';

function tempWorkspace(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'dejabug-store-test-'));
}

function sampleInput(overrides: Partial<NewSnapshotInput> = {}): NewSnapshotInput {
	return {
		file: 'src/calc.js',
		lineRange: [2, 2],
		fixCommit: 'abc123',
		causeCommit: null,
		rootCauseSummary: 'fix: use >= instead of =',
		tags: [],
		author: 'tester',
		...overrides,
	};
}

suite('snapshotStore', () => {
	let workspaceRoot: string;

	setup(() => {
		workspaceRoot = tempWorkspace();
	});

	teardown(() => {
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
	});

	test('loadAllSnapshots returns empty and creates .dejabug/ if it does not exist yet', async () => {
		const snapshots = await loadAllSnapshots(workspaceRoot);

		assert.deepStrictEqual(snapshots, []);
		assert.ok(fs.existsSync(path.join(workspaceRoot, '.dejabug', 'snapshots')));
	});

	test('saveSnapshot writes the file and fills in id/date/counters', async () => {
		const saved = await saveSnapshot(workspaceRoot, sampleInput());

		assert.ok(saved.id);
		assert.ok(saved.date);
		assert.strictEqual(saved.timesShown, 0);
		assert.strictEqual(saved.timesUseful, 0);

		const filePath = path.join(workspaceRoot, '.dejabug', 'snapshots', `${saved.id}.json`);
		assert.ok(fs.existsSync(filePath));

		const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		assert.strictEqual(onDisk.file, 'src/calc.js');
	});

	test('loadAllSnapshots returns every saved snapshot', async () => {
		await saveSnapshot(workspaceRoot, sampleInput({ file: 'a.js' }));
		await saveSnapshot(workspaceRoot, sampleInput({ file: 'b.js' }));

		const snapshots = await loadAllSnapshots(workspaceRoot);

		assert.strictEqual(snapshots.length, 2);
		assert.deepStrictEqual(
			snapshots.map((s) => s.file).sort(),
			['a.js', 'b.js']
		);
	});

	test('updateSnapshotStats increments only the requested field', async () => {
		const saved = await saveSnapshot(workspaceRoot, sampleInput());

		const afterShown = await updateSnapshotStats(workspaceRoot, saved.id, 'timesShown');
		assert.strictEqual(afterShown.timesShown, 1);
		assert.strictEqual(afterShown.timesUseful, 0);

		const afterUseful = await updateSnapshotStats(workspaceRoot, saved.id, 'timesUseful');
		assert.strictEqual(afterUseful.timesShown, 1);
		assert.strictEqual(afterUseful.timesUseful, 1);
	});
});
