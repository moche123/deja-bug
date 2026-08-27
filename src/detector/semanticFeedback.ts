import * as vscode from 'vscode';

const STATE_KEY = 'dejabug.semanticFeedback';
const BATCH_SIZE = 10;
const NOT_RELEVANT_RATIO_HIGH = 0.4; // noisy: raise the threshold, be more conservative
const NOT_RELEVANT_RATIO_LOW = 0.1; // quiet and still getting real feedback: loosen it a bit
const THRESHOLD_STEP_UP = 0.02;
const THRESHOLD_STEP_DOWN = 0.01;
const THRESHOLD_MAX = 0.98;
const THRESHOLD_MIN = 0.75;
const DEFAULT_THRESHOLD = 0.86;

interface FeedbackState {
	total: number;
	notRelevant: number;
}

function readState(context: vscode.ExtensionContext): FeedbackState {
	return context.globalState.get<FeedbackState>(STATE_KEY) ?? { total: 0, notRelevant: 0 };
}

async function adjustThreshold(direction: 'up' | 'down'): Promise<void> {
	const config = vscode.workspace.getConfiguration('dejabug');
	const current = config.get<number>('semanticThreshold', DEFAULT_THRESHOLD);
	const next =
		direction === 'up' ? Math.min(THRESHOLD_MAX, current + THRESHOLD_STEP_UP) : Math.max(THRESHOLD_MIN, current - THRESHOLD_STEP_DOWN);
	if (next !== current) {
		// user-level only — a team's shared threshold, if any, is a decision a
		// person makes on purpose, not something one teammate's feedback should
		// silently move for everyone else (see MVP_FASE3.md, Paso 3)
		await config.update('semanticThreshold', next, vscode.ConfigurationTarget.Global);
	}
}

/**
 * Records "useful"/"not relevant" feedback specifically for semantic-strategy
 * ghosts (separate from `Snapshot.timesUseful`, which mixes all four
 * strategies together). Every `BATCH_SIZE` accumulated feedbacks, nudges the
 * user-level `dejabug.semanticThreshold` up or down based on how noisy the
 * semantic signal has been, then resets the batch.
 */
export async function recordSemanticFeedback(context: vscode.ExtensionContext, wasUseful: boolean): Promise<void> {
	const state = readState(context);
	state.total += 1;
	if (!wasUseful) {
		state.notRelevant += 1;
	}

	if (state.total >= BATCH_SIZE) {
		const ratio = state.notRelevant / state.total;
		if (ratio > NOT_RELEVANT_RATIO_HIGH) {
			await adjustThreshold('up');
		} else if (ratio < NOT_RELEVANT_RATIO_LOW) {
			await adjustThreshold('down');
		}
		state.total = 0;
		state.notRelevant = 0;
	}

	await context.globalState.update(STATE_KEY, state);
}
