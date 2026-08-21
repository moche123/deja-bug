import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import simpleGit from 'simple-git';
import { saveSnapshot } from '../../store/snapshotStore';
import { detectProximity } from '../../detector/proximityDetector';

const EXPECTED_COMMANDS = [
	'dejabug.helloWorld',
	'dejabug.markUseful',
	'dejabug.markNotRelevant',
	'dejabug.createSnapshotFromSelection',
	'dejabug.listSnapshots',
];

suite('Extension activation', () => {
	test('activates and registers all DejaBug commands', async () => {
		const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === 'dejabug');
		assert.ok(ext, 'could not find the dejabug extension among the loaded ones');

		if (!ext!.isActive) {
			await ext!.activate();
		}
		assert.ok(ext!.isActive);

		const commands = await vscode.commands.getCommands(true);
		for (const id of EXPECTED_COMMANDS) {
			assert.ok(commands.includes(id), `command ${id} is not registered`);
		}
	});
});

// There's no public VS Code API to read back which ranges a
// TextEditorDecorationType ended up applied to, so instead of simulating
// "save a file and check the decoration appears" pixel by pixel, this tests
// the function that actually decides whether there's a match —
// detectProximity — against a real git repo built in a temp directory.
// That's what actually drives the business logic; the decoration is just
// its visual representation.
suite('detectProximity (real git repo)', () => {
	let repoRoot: string;
	let fixCommitHash: string;

	const initialLines = [
		'// padding 1',
		'// padding 2',
		'// padding 3',
		'function add(a, b) {',
		'  return a + b;',
		'}',
		'// padding 4',
		'// padding 5',
		'// padding 6',
	];

	suiteSetup(async function () {
		this.timeout(20000);
		repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dejabug-proximity-test-'));

		const git = simpleGit(repoRoot);
		await git.init();
		await git.addConfig('user.email', 'dejabug-test@local');
		await git.addConfig('user.name', 'DejaBug Test');

		const filePath = path.join(repoRoot, 'sample.js');
		fs.writeFileSync(filePath, initialLines.join('\n') + '\n');
		await git.add('sample.js');
		await git.commit('feat: init');

		const fixedLines = [...initialLines];
		fixedLines[4] = '  return a + b + 0;'; // line 5 (1-indexed) — the one kept in the snapshot
		fs.writeFileSync(filePath, fixedLines.join('\n') + '\n');
		await git.add('sample.js');
		await git.commit('fix: correct sum, Fixes #1');
		fixCommitHash = (await git.revparse(['HEAD'])).trim();

		await saveSnapshot(repoRoot, {
			file: 'sample.js',
			lineRange: [5, 5],
			fixCommit: fixCommitHash,
			causeCommit: null,
			rootCauseSummary: 'fix: correct sum, Fixes #1',
			tags: [],
			author: 'DejaBug Test',
		});
	});

	suiteTeardown(() => {
		fs.rmSync(repoRoot, { recursive: true, force: true });
	});

	test('matches by location when the fix line is untouched and the cursor is nearby', async () => {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(repoRoot, 'sample.js')));

		const matches = await detectProximity(repoRoot, document, 4); // line 5, 0-indexed

		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].strategy, 'location');
		assert.strictEqual(matches[0].snapshot.fixCommit, fixCommitHash);
		assert.strictEqual(matches[0].line, 4);
	});

	test('does not match when the cursor is far from the fix line (outside the proximity margin)', async () => {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(repoRoot, 'sample.js')));

		const matches = await detectProximity(repoRoot, document, 0); // line 1, 4 lines away from the fix

		assert.strictEqual(matches.length, 0);
	});
});
