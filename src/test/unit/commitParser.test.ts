import * as assert from 'assert';
import { parseIssueRefs } from '../../watcher/gitWatcher';

suite('parseIssueRefs', () => {
	test('detects Fixes #123', () => {
		const refs = parseIssueRefs('fix: correct assignment bug, Fixes #123');
		assert.deepStrictEqual(refs, [{ keyword: 'Fixes', ref: '#123' }]);
	});

	test('detects Closes JIRA-456 (case-insensitive)', () => {
		const refs = parseIssueRefs('fix: race condition, closes JIRA-456');
		assert.deepStrictEqual(refs, [{ keyword: 'closes', ref: 'JIRA-456' }]);
	});

	test('detects multiple references in the same message', () => {
		const refs = parseIssueRefs('fix: two bugs at once, Fixes #1 and Closes #2');
		assert.strictEqual(refs.length, 2);
		assert.deepStrictEqual(
			refs.map((r) => r.ref),
			['#1', '#2']
		);
	});

	test('returns empty when there is no issue-closing pattern', () => {
		const refs = parseIssueRefs('chore: update dependencies');
		assert.deepStrictEqual(refs, []);
	});

	test('does not match a loose reference without the keyword', () => {
		const refs = parseIssueRefs('see #123 for more context');
		assert.deepStrictEqual(refs, []);
	});
});
