export interface Snapshot {
	id: string;
	fecha: string;
	archivo: string;
	rango_lineas: [number, number];
	simbolo?: string;
	commit_fix: string;
	commit_causa?: string | null;
	issue_ref?: string;
	pr_ref?: string;
	resumen_causa: string;
	tags: string[];
	autor: string;
	veces_mostrado: number;
	veces_util: number;
}

export type NewSnapshotInput = Omit<Snapshot, 'id' | 'fecha' | 'veces_mostrado' | 'veces_util'>;
