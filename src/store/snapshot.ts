export interface Snapshot {
	id: string;
	date: string;
	file: string;
	lineRange: [number, number];
	symbol?: string;
	fixCommit: string;
	causeCommit?: string | null;
	issueRef?: string;
	prRef?: string;
	rootCauseSummary: string;
	tags: string[];
	author: string;
	timesShown: number;
	timesUseful: number;
	schemaVersion: number;          // 1 = Fase 1, 2 = Fase 2. Ver nota de migración abajo.
	astFingerprint?: string;        // huella normalizada del subárbol de AST alrededor del fix
	issueTitle?: string;            // traído desde GitHub/GitLab, si el connector pudo resolverlo
	issueLabels?: string[];         // labels del issue/PR, alimentan el campo `tags`
}


export type NewSnapshotInput = Omit<Snapshot, 'id' | 'date' | 'timesShown' | 'timesUseful' | 'schemaVersion'>;
