import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';
import * as path from 'path';
import { Snapshot } from '../store/snapshot';

export interface LocationMatch {
	snapshot: Snapshot;
	rangoActual: [number, number];
	drift: boolean;
}

// margen de líneas alrededor del rango del snapshot que todavía cuenta como
// "cerca" — evita exigir que el cursor esté exactamente en la línea, pero
// sigue exigiendo que la edición sea local a la zona del fix, no en
// cualquier parte del archivo
const MARGEN_CERCANIA_LINEAS = 3;

async function blameMap(git: SimpleGit, archivo: string): Promise<Map<number, string>> {
	const map = new Map<number, string>();
	try {
		const output = await git.raw(['blame', '--porcelain', '--', archivo]);
		const lineRegex = /^([0-9a-f]{40}) \d+ (\d+)/gm;
		let m: RegExpExecArray | null;
		while ((m = lineRegex.exec(output)) !== null) {
			map.set(parseInt(m[2], 10), m[1]);
		}
	} catch {
		// archivo sin historial en git (nuevo/no trackeado) — sin blame no hay drift que rastrear
	}
	return map;
}

/**
 * Match "por ubicación": compara archivo + rango de líneas contra snapshots
 * existentes, usando `git blame` para seguir el bloque de código aunque haya
 * cambiado de línea (drift) — el match sigue siendo válido mientras las
 * líneas actuales sigan atribuidas al commit_fix del snapshot (sin tocar
 * desde entonces). Si ya fueron editadas de nuevo, se considera fuera del
 * umbral "match exacto" del MVP.
 *
 * Además de la ubicación en sí, exige que `activeLine` (la línea del cursor
 * al momento de guardar, 0-indexed) esté dentro del rango actual del
 * snapshot o a lo sumo `MARGEN_CERCANIA_LINEAS` líneas de distancia. Sin
 * esto, cualquier guardado del archivo —tocaras lo que tocaras— mostraba el
 * fantasma anclado en las líneas del fix, sin relación con lo que se estaba
 * editando realmente.
 */
export async function detectByLocation(
	workspaceRoot: string,
	document: vscode.TextDocument,
	snapshots: Snapshot[],
	activeLine: number | undefined
): Promise<LocationMatch[]> {
	if (activeLine === undefined) {
		return [];
	}

	const relPath = path.relative(workspaceRoot, document.uri.fsPath).replace(/\\/g, '/');
	const candidatos = snapshots.filter((s) => s.archivo === relPath);
	if (candidatos.length === 0) {
		return [];
	}

	const git = simpleGit(workspaceRoot);
	const blame = await blameMap(git, relPath);
	if (blame.size === 0) {
		return [];
	}

	const lineaEditada = activeLine + 1; // git blame es 1-indexed, vscode.Position es 0-indexed

	const matches: LocationMatch[] = [];
	for (const snapshot of candidatos) {
		const lineas = [...blame.entries()]
			.filter(([, sha]) => sha === snapshot.commit_fix)
			.map(([linea]) => linea);

		if (lineas.length === 0) {
			continue;
		}

		const rangoActual: [number, number] = [Math.min(...lineas), Math.max(...lineas)];
		const cerca =
			lineaEditada >= rangoActual[0] - MARGEN_CERCANIA_LINEAS &&
			lineaEditada <= rangoActual[1] + MARGEN_CERCANIA_LINEAS;
		if (!cerca) {
			continue;
		}

		const drift = rangoActual[0] !== snapshot.rango_lineas[0] || rangoActual[1] !== snapshot.rango_lineas[1];
		matches.push({ snapshot, rangoActual, drift });
	}

	return matches;
}
