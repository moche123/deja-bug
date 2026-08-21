import { defineConfig } from '@vscode/test-cli';

// The project's own path is long enough that VS Code's default
// `.vscode-test/user-data/*.sock` path blows past macOS's ~103-char Unix
// socket limit (EINVAL: invalid argument). Point --user-data-dir somewhere
// short instead of letting it default to a path under this repo.
export default defineConfig({
	files: 'out/test/**/*.test.js',
	// must be a folder OTHER than the extension's own dev path — VS Code
	// won't treat it as a real opened workspace otherwise (same bug as the
	// F5 launch.json fix documented in MVP_FASE1.md), which leaves
	// vscode.workspace.workspaceFolders undefined and extension.ts never
	// registers most commands
	workspaceFolder: 'src/test/fixtures/workspace',
	launchArgs: ['--user-data-dir=/tmp/dejabug-vscode-test-user-data'],
});
