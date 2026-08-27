import * as assert from 'assert';
import { findDuplicateSnapshots } from '../../store/duplicateFinder';
import { Snapshot } from '../../store/snapshot';

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
	return {
		id: 'id',
		date: '2026-01-01T00:00:00.000Z',
		file: 'sample.js',
		lineRange: [1, 2],
		fixCommit: 'abc123',
		causeCommit: null,
		rootCauseSummary: 'fix: something',
		tags: [],
		author: 'tester',
		timesShown: 0,
		timesUseful: 0,
		schemaVersion: 1,
		...overrides,
	};
}

suite('findDuplicateSnapshots', () => {
	test('groups two snapshots with the same fixCommit, even in different files', () => {
		const a = makeSnapshot({ id: 'a', file: 'foo.js', fixCommit: 'sameSha' });
		const b = makeSnapshot({ id: 'b', file: 'bar.js', fixCommit: 'sameSha' });

		const groups = findDuplicateSnapshots([a, b]);

		assert.strictEqual(groups.length, 1);
		assert.deepStrictEqual(
			groups[0].map((s) => s.id).sort(),
			['a', 'b']
		);
	});

	test('groups two snapshots in the same file with overlapping line ranges', () => {
		const a = makeSnapshot({ id: 'a', fixCommit: 'sha1', lineRange: [10, 15] });
		const b = makeSnapshot({ id: 'b', fixCommit: 'sha2', lineRange: [12, 20] });

		const groups = findDuplicateSnapshots([a, b]);

		assert.strictEqual(groups.length, 1);
	});

	test('does not group snapshots in the same file with disjoint line ranges', () => {
		const a = makeSnapshot({ id: 'a', fixCommit: 'sha1', lineRange: [1, 2] });
		const b = makeSnapshot({ id: 'b', fixCommit: 'sha2', lineRange: [10, 12] });

		const groups = findDuplicateSnapshots([a, b]);

		assert.deepStrictEqual(groups, []);
	});

	test('does not group snapshots in different files with different fix commits', () => {
		const a = makeSnapshot({ id: 'a', file: 'foo.js', fixCommit: 'sha1' });
		const b = makeSnapshot({ id: 'b', file: 'bar.js', fixCommit: 'sha2' });

		const groups = findDuplicateSnapshots([a, b]);

		assert.deepStrictEqual(groups, []);
	});

	test('merges a chain of duplicates into a single group of three', () => {
		const a = makeSnapshot({ id: 'a', fixCommit: 'sha1', lineRange: [1, 5] });
		const b = makeSnapshot({ id: 'b', fixCommit: 'sha2', lineRange: [4, 8] });
		const c = makeSnapshot({ id: 'c', fixCommit: 'sha3', lineRange: [7, 10] });

		const groups = findDuplicateSnapshots([a, b, c]);

		assert.strictEqual(groups.length, 1);
		assert.strictEqual(groups[0].length, 3);
	});

	test('returns no groups when every snapshot is unique', () => {
		const a = makeSnapshot({ id: 'a', file: 'foo.js', fixCommit: 'sha1', lineRange: [1, 2] });
		const b = makeSnapshot({ id: 'b', file: 'bar.js', fixCommit: 'sha2', lineRange: [1, 2] });
		const c = makeSnapshot({ id: 'c', file: 'baz.js', fixCommit: 'sha3', lineRange: [1, 2] });

		const groups = findDuplicateSnapshots([a, b, c]);

		assert.deepStrictEqual(groups, []);
	});
});
