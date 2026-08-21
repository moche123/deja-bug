# Test fixture

Empty folder used as the Extension Development Host's workspace during `npm test`. It's not a git repo — it only exists so `vscode.workspace.workspaceFolders` isn't `undefined`, which is required for `extension.ts` to register all of DejaBug's commands (see the bug documented in `MVP_FASE1.md`, section "Validación end-to-end de los Pasos 0 a 2": pointing the workspace at the same folder as `--extensionDevelopmentPath` makes VS Code not load it as a real workspace).
