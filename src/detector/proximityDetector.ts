import * as vscode from 'vscode';
import { Snapshot } from '../store/snapshot';
import { loadAllSnapshots, updateSnapshotStats } from '../store/snapshotStore';
import { detectByLocation } from './locationDetector';
import { detectBySymbol } from './symbolDetector';

export interface ProximityMatch {
	snapshot: Snapshot;
	estrategia: 'ubicacion' | 'simbolo';
	rangoActual?: [number, number];
}

/**
 * Cascada de estrategias del MVP: ubicación primero (más barata, solo lee
 * blame del archivo guardado), símbolo después y solo sobre los snapshots
 * que la ubicación no resolvió ya (evita mostrar el mismo snapshot dos
 * veces). `activeLine` es la línea del cursor en el editor activo al
 * momento de guardar; si el documento guardado no es el editor activo, se
 * omiten las dos estrategias (ni ubicación ni símbolo tienen una línea de
 * referencia confiable sobre qué se estaba editando).
 */
export async function detectProximity(
	workspaceRoot: string,
	document: vscode.TextDocument,
	activeLine: number | undefined
): Promise<ProximityMatch[]> {
	const snapshots = await loadAllSnapshots(workspaceRoot);
	if (snapshots.length === 0) {
		return [];
	}

	const porUbicacion = await detectByLocation(workspaceRoot, document, snapshots, activeLine);
	const yaMatched = new Set(porUbicacion.map((m) => m.snapshot.id));

	const matches: ProximityMatch[] = porUbicacion.map((m) => ({
		snapshot: m.snapshot,
		estrategia: 'ubicacion' as const,
		rangoActual: m.rangoActual,
	}));

	if (activeLine !== undefined) {
		const restantes = snapshots.filter((s) => !yaMatched.has(s.id));
		const porSimbolo = await detectBySymbol(document, activeLine, restantes);
		matches.push(...porSimbolo.map((snapshot) => ({ snapshot, estrategia: 'simbolo' as const })));
	}

	for (const match of matches) {
		await updateSnapshotStats(workspaceRoot, match.snapshot.id, 'veces_mostrado');
	}

	return matches;
}
