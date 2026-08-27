import * as assert from 'assert';
import { computeEmbedding } from '../../embeddings/embeddingProvider';

function dot(a: number[], b: number[]): number {
	return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

// first run downloads and caches the local model (~90MB) — generous timeout
// to cover that; the extractor itself is a lazy module-level singleton, so
// only the very first test pays the load cost
suite('computeEmbedding', () => {
	test('the same text embeds to (nearly) the same vector', async function () {
		this.timeout(60000);

		const a = await computeEmbedding('function add(a, b) { return a + b; }');
		const b = await computeEmbedding('function add(a, b) { return a + b; }');

		assert.ok(a && b, 'expected both embeddings to succeed');
		assert.strictEqual(a!.length, b!.length);
		assert.ok(dot(a!, b!) > 0.99, `expected near-1 similarity for identical text, got ${dot(a!, b!)}`);
	});

	test('unrelated texts embed to dissimilar vectors', async function () {
		this.timeout(60000);

		const code = await computeEmbedding('function add(a, b) { return a + b; }');
		const prose = await computeEmbedding('the quick brown fox jumps over the lazy dog');

		assert.ok(code && prose, 'expected both embeddings to succeed');
		assert.ok(dot(code!, prose!) < 0.5, `expected low similarity for unrelated text, got ${dot(code!, prose!)}`);
	});

	test('returns a normalized vector (unit length)', async function () {
		this.timeout(60000);

		const embedding = await computeEmbedding('const x = 1;');

		assert.ok(embedding);
		const magnitude = Math.sqrt(dot(embedding!, embedding!));
		assert.ok(Math.abs(magnitude - 1) < 0.01, `expected unit-length vector, got magnitude ${magnitude}`);
	});
});
