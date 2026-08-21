import * as vscode from 'vscode';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { saveSnapshot } from '../store/snapshotStore';
import { NewSnapshotInput } from '../store/snapshot';
import { BugFixCommit } from '../watcher/gitWatcher';
import { findInnermostSymbolAt } from '../detector/symbolUtils';

interface FileHunk {
	archivo: string;
	rango_lineas: [number, number];
	fragmentoBusqueda?: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function parseFirstHunkPerFile(diffText: string): FileHunk[] {
	const hunks: FileHunk[] = [];
	const seen = new Set<string>();
	let currentFile: string | null = null;
	const lines = diffText.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (line.startsWith('+++ ')) {
			const filePath = line.slice(4).trim();
			currentFile = filePath === '/dev/null' ? null : filePath.replace(/^b\//, '');
			continue;
		}

		if (!currentFile || seen.has(currentFile)) {
			continue;
		}

		const match = HUNK_HEADER.exec(line);
		if (!match) {
			continue;
		}

		const start = parseInt(match[1], 10);
		const len = match[2] !== undefined ? parseInt(match[2], 10) : 1;
		const end = start + Math.max(len, 1) - 1;

		// Preferir la línea ELIMINADA (el código con el bug) para el -S: eso es lo que
		// hay que rastrear hasta el commit que lo introdujo. Si el hunk es una inserción
		// pura (no borra nada), usar la línea agregada como fallback débil.
		let fragmentoEliminado: string | undefined;
		let fragmentoAgregado: string | undefined;
		for (let j = i + 1; j < lines.length; j++) {
			const l = lines[j];
			if (l.startsWith('@@') || l.startsWith('diff --git')) {
				break;
			}
			if (l.startsWith('-') && !l.startsWith('---') && !fragmentoEliminado) {
				const trimmed = l.slice(1).trim();
				if (trimmed) {
					fragmentoEliminado = trimmed;
				}
			}
			if (l.startsWith('+') && !l.startsWith('+++') && !fragmentoAgregado) {
				const trimmed = l.slice(1).trim();
				if (trimmed) {
					fragmentoAgregado = trimmed;
				}
			}
			if (fragmentoEliminado && fragmentoAgregado) {
				break;
			}
		}

		hunks.push({ archivo: currentFile, rango_lineas: [start, end], fragmentoBusqueda: fragmentoEliminado ?? fragmentoAgregado });
		seen.add(currentFile);
	}

	return hunks;
}

async function findCommitCausa(
	git: SimpleGit,
	archivo: string,
	fragmento: string | undefined,
	commitFixHash: string
): Promise<string | null> {
	if (!fragmento) {
		return null;
	}

	try {
		const output = await git.raw(['log', '--format=%H', '-S', fragmento, '--', archivo]);
		const hashes = output.split('\n').map((h) => h.trim()).filter(Boolean);
		return hashes.find((h) => h !== commitFixHash) ?? null;
	} catch {
		return null;
	}
}

async function resolveSimbolo(workspaceRoot: string, archivo: string, lineaCero: number): Promise<string | undefined> {
	try {
		const uri = vscode.Uri.file(path.join(workspaceRoot, archivo));
		// abrir el documento asegura que el language server correspondiente lo indexó
		// antes de pedirle símbolos (si no, executeDocumentSymbolProvider devuelve vacío)
		await vscode.workspace.openTextDocument(uri);
		return await findInnermostSymbolAt(uri, lineaCero);
	} catch {
		return undefined;
	}
}

export async function buildSnapshotDrafts(workspaceRoot: string, commit: BugFixCommit): Promise<NewSnapshotInput[]> {
	const git = simpleGit(workspaceRoot);
	const diffText = await git.raw(['show', commit.hash, '--unified=0', '--format=']);
	const hunks = parseFirstHunkPerFile(diffText);

	const autor = (await git.raw(['show', '-s', '--format=%an', commit.hash])).trim();
	const issueRef = commit.refs.map((r) => r.ref).join(', ') || undefined;

	const drafts: NewSnapshotInput[] = [];
	for (const hunk of hunks) {
		const commitCausa = await findCommitCausa(git, hunk.archivo, hunk.fragmentoBusqueda, commit.hash);
		const simbolo = await resolveSimbolo(workspaceRoot, hunk.archivo, hunk.rango_lineas[0] - 1);
		drafts.push({
			archivo: hunk.archivo,
			rango_lineas: hunk.rango_lineas,
			simbolo,
			commit_fix: commit.hash,
			commit_causa: commitCausa,
			issue_ref: issueRef,
			resumen_causa: commit.message,
			tags: [],
			autor,
		});
	}

	return drafts;
}

export async function confirmAndSaveSnapshot(workspaceRoot: string, draft: NewSnapshotInput): Promise<void> {
	const [start, end] = draft.rango_lineas;
	const choice = await vscode.window.showInformationMessage(
		`DejaBug: ¿guardar snapshot de ${draft.archivo}:${start}-${end}?\n"${draft.resumen_causa}"`,
		'Guardar',
		'Editar resumen',
		'Descartar'
	);

	if (choice === undefined || choice === 'Descartar') {
		return;
	}

	let resumen = draft.resumen_causa;
	if (choice === 'Editar resumen') {
		const edited = await vscode.window.showInputBox({
			prompt: 'Resumen de causa raíz',
			value: draft.resumen_causa,
		});
		if (edited === undefined) {
			return;
		}
		resumen = edited;
	}

	const saved = await saveSnapshot(workspaceRoot, { ...draft, resumen_causa: resumen });
	vscode.window.showInformationMessage(`DejaBug: snapshot guardado (${saved.id.slice(0, 8)})`);
}
