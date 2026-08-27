import * as assert from 'assert';
import { computeAstFingerprint } from '../../detector/astFingerprint';

suite('computeAstFingerprint', () => {
	test('detects a mutable index loop', () => {
		const code = `
function walk(items) {
	for (let i = 0; i < items.length; i++) {
		process(items[i]);
		if (skip(items[i])) {
			i++;
		}
	}
}
`;
		const patterns = computeAstFingerprint(code, 0, code.length);
		assert.ok(patterns.includes('mutable-index-loop'));
	});

	test('does not flag a loop that only uses its own increment clause', () => {
		const code = `
function walk(items) {
	for (let i = 0; i < items.length; i++) {
		process(items[i]);
	}
}
`;
		const patterns = computeAstFingerprint(code, 0, code.length);
		assert.ok(!patterns.includes('mutable-index-loop'));
	});

	test('detects a float equality comparison', () => {
		const code = `
function isDone(progress) {
	return progress === 1.0;
}
`;
		const patterns = computeAstFingerprint(code, 0, code.length);
		assert.ok(patterns.includes('float-equality'));
	});

	test('does not flag an integer equality comparison', () => {
		const code = `
function isDone(count) {
	return count === 10;
}
`;
		const patterns = computeAstFingerprint(code, 0, code.length);
		assert.ok(!patterns.includes('float-equality'));
	});

	test('detects an await followed by an unguarded write to shared state', () => {
		const code = `
async function refresh(cache) {
	const data = await fetchData();
	cache.value = data;
}
`;
		const patterns = computeAstFingerprint(code, 0, code.length);
		assert.ok(patterns.includes('unsafe-await-write'));
	});

	test('does not flag an await write guarded by a lock', () => {
		const code = `
async function refresh(cache) {
	const data = await fetchData();
	await withLock(cache, () => {
		cache.value = data;
	});
}
`;
		const patterns = computeAstFingerprint(code, 0, code.length);
		assert.ok(!patterns.includes('unsafe-await-write'));
	});

	test('only reports patterns found within the given range', () => {
		const code = `
for (let i = 0; i < 10; i++) { i++; }
function clean(items) {
	for (let j = 0; j < items.length; j++) {
		process(items[j]);
	}
}
`;
		const cleanStart = code.indexOf('function clean');
		const patterns = computeAstFingerprint(code, cleanStart, code.length);
		assert.ok(!patterns.includes('mutable-index-loop'));
	});

	test('can report more than one pattern for the same block', () => {
		const code = `
async function reconcile(cache, items) {
	for (let i = 0; i < items.length; i++) {
		const data = await fetchData(items[i]);
		cache.value = data;
		if (data.progress === 1.0) {
			i++;
		}
	}
}
`;
		const patterns = computeAstFingerprint(code, 0, code.length);
		assert.ok(patterns.includes('mutable-index-loop'));
		assert.ok(patterns.includes('float-equality'));
		assert.ok(patterns.includes('unsafe-await-write'));
	});

	test('returns an empty list for code with none of the catalogued patterns', () => {
		const code = `
function add(a, b) {
	return a + b;
}
`;
		const patterns = computeAstFingerprint(code, 0, code.length);
		assert.deepStrictEqual(patterns, []);
	});
});
