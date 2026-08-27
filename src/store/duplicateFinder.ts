import { Snapshot } from './snapshot';

function rangesOverlap(a: [number, number], b: [number, number]): boolean {
	return a[0] <= b[1] && b[0] <= a[1];
}

function isDuplicatePair(a: Snapshot, b: Snapshot): boolean {
	// same fix commit is the typical case: two branches independently snapshot the
	// same fix before merging (see MVP_FASE2.md, Paso 3)
	if (a.fixCommit === b.fixCommit) {
		return true;
	}
	return a.file === b.file && rangesOverlap(a.lineRange, b.lineRange);
}

/**
 * Groups snapshots that look like duplicates of each other — never deletes
 * anything itself, just reports the groups so the caller can let a human
 * pick which one to keep (same "never destructive without confirmation"
 * rule the Generator already follows).
 */
export function findDuplicateSnapshots(snapshots: Snapshot[]): Snapshot[][] {
	const parent = snapshots.map((_, i) => i);
	const find = (i: number): number => {
		while (parent[i] !== i) {
			parent[i] = parent[parent[i]];
			i = parent[i];
		}
		return i;
	};
	const union = (i: number, j: number) => {
		const rootI = find(i);
		const rootJ = find(j);
		if (rootI !== rootJ) {
			parent[rootI] = rootJ;
		}
	};

	for (let i = 0; i < snapshots.length; i++) {
		for (let j = i + 1; j < snapshots.length; j++) {
			if (isDuplicatePair(snapshots[i], snapshots[j])) {
				union(i, j);
			}
		}
	}

	const groups = new Map<number, Snapshot[]>();
	for (let i = 0; i < snapshots.length; i++) {
		const root = find(i);
		const group = groups.get(root) ?? [];
		group.push(snapshots[i]);
		groups.set(root, group);
	}

	return [...groups.values()].filter((group) => group.length >= 2);
}
