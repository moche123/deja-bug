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
}

export type NewSnapshotInput = Omit<Snapshot, 'id' | 'date' | 'timesShown' | 'timesUseful'>;
