import * as vscode from 'vscode';
import { Snapshot } from '../store/snapshot';
import { findInnermostSymbolAt } from './symbolUtils';

/**
 * Match "por símbolo": ubica la función/clase/método que contiene la línea
 * activa y lo compara contra `snapshot.simbolo`, sin importar el archivo.
 * Solo corre sobre snapshots que ya tienen `simbolo` poblado (lo asigna el
 * Snapshot Generator al guardar).
 */
export async function detectBySymbol(
	document: vscode.TextDocument,
	activeLine: number,
	snapshots: Snapshot[]
): Promise<Snapshot[]> {
	const conSimbolo = snapshots.filter((s) => !!s.simbolo);
	if (conSimbolo.length === 0) {
		return [];
	}

	const simbolo = await findInnermostSymbolAt(document.uri, activeLine);
	if (!simbolo) {
		return [];
	}

	return conSimbolo.filter((s) => s.simbolo === simbolo);
}
