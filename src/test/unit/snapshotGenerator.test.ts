import * as assert from 'assert';
import { parseFirstHunkPerFile } from '../../generator/snapshotGenerator';

suite('parseFirstHunkPerFile', () => {
	test('ignores .dejabug/ housekeeping writes swept into the same commit', () => {
		const diff = [
			'diff --git a/sample.js b/sample.js',
			'index abc1234..def5678 100644',
			'--- a/sample.js',
			'+++ b/sample.js',
			'@@ -2,1 +2,1 @@',
			'-  return a + b;',
			'+  return a - b;',
			'diff --git a/.dejabug/snapshots/foo.json b/.dejabug/snapshots/foo.json',
			'index 1111111..2222222 100644',
			'--- a/.dejabug/snapshots/foo.json',
			'+++ b/.dejabug/snapshots/foo.json',
			'@@ -16,1 +16,1 @@',
			'-  "timesShown": 0,',
			'+  "timesShown": 1,',
		].join('\n');

		const hunks = parseFirstHunkPerFile(diff);

		assert.deepStrictEqual(
			hunks.map((h) => h.file),
			['sample.js']
		);
	});

	test('still picks up a normal source file hunk on its own', () => {
		const diff = ['diff --git a/sample.js b/sample.js', '--- a/sample.js', '+++ b/sample.js', '@@ -1,1 +1,1 @@', '-old', '+new'].join('\n');

		const hunks = parseFirstHunkPerFile(diff);

		assert.strictEqual(hunks.length, 1);
		assert.strictEqual(hunks[0].file, 'sample.js');
		assert.deepStrictEqual(hunks[0].lineRange, [1, 1]);
	});
});
