import * as assert from 'assert';
import * as vscode from 'vscode';
import { recordSemanticFeedback } from '../../detector/semanticFeedback';

const DEFAULT_THRESHOLD = 0.86;

function fakeContext(): vscode.ExtensionContext {
	const store = new Map<string, unknown>();
	return {
		globalState: {
			get: <T>(key: string, defaultValue?: T) => (store.has(key) ? (store.get(key) as T) : defaultValue),
			update: async (key: string, value: unknown) => {
				store.set(key, value);
			},
		},
	} as unknown as vscode.ExtensionContext;
}

async function resetThreshold(): Promise<void> {
	await vscode.workspace.getConfiguration('dejabug').update('semanticThreshold', DEFAULT_THRESHOLD, vscode.ConfigurationTarget.Global);
}

function currentThreshold(): number {
	return vscode.workspace.getConfiguration('dejabug').get<number>('semanticThreshold', DEFAULT_THRESHOLD);
}

suite('recordSemanticFeedback', () => {
	setup(resetThreshold);
	teardown(resetThreshold);

	test('raises the threshold after a noisy batch (many "not relevant")', async () => {
		const context = fakeContext();
		for (let i = 0; i < 10; i++) {
			// 5 out of 10 not relevant: 0.5 ratio, above the 0.4 "noisy" line
			await recordSemanticFeedback(context, i % 2 === 0);
		}
		assert.ok(currentThreshold() > DEFAULT_THRESHOLD, `expected threshold to rise above ${DEFAULT_THRESHOLD}, got ${currentThreshold()}`);
	});

	test('lowers the threshold after a quiet batch (all useful)', async () => {
		const context = fakeContext();
		for (let i = 0; i < 10; i++) {
			await recordSemanticFeedback(context, true);
		}
		assert.ok(currentThreshold() < DEFAULT_THRESHOLD, `expected threshold to drop below ${DEFAULT_THRESHOLD}, got ${currentThreshold()}`);
	});

	test('does not touch the threshold before a full batch accumulates', async () => {
		const context = fakeContext();
		for (let i = 0; i < 9; i++) {
			await recordSemanticFeedback(context, false);
		}
		assert.strictEqual(currentThreshold(), DEFAULT_THRESHOLD);
	});
});
