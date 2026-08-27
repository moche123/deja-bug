import type { FeatureExtractionPipeline } from '@huggingface/transformers' with { 'resolution-mode': 'import' };

// general-purpose sentence embeddings, small enough (~90MB quantized) for a local
// MVP — not code-specific, but a model swap later is a one-line change, not an
// architecture change. Never sends code anywhere: runs in-process (see MVP_FASE3.md)
const MODEL_ID = 'onnx-community/all-MiniLM-L6-v2-ONNX';

let extractorPromise: Promise<FeatureExtractionPipeline> | undefined;

function getExtractor(): Promise<FeatureExtractionPipeline> {
	if (!extractorPromise) {
		// @huggingface/transformers is ESM-only; the extension bundles as CommonJS,
		// so it has to be loaded via a dynamic import rather than a static one
		extractorPromise = import('@huggingface/transformers').then(({ pipeline }) => pipeline('feature-extraction', MODEL_ID));
	}
	return extractorPromise;
}

/**
 * Embeds `text` with the local model, mean-pooled and normalized so cosine
 * similarity reduces to a plain dot product. Never throws: a failed model
 * load or a runtime error resolves to `null` so the semantic strategy is
 * simply skipped, same fail-silent contract as the Issue Tracker Connector.
 */
export async function computeEmbedding(text: string): Promise<number[] | null> {
	try {
		const extractor = await getExtractor();
		const output = await extractor(text, { pooling: 'mean', normalize: true });
		return Array.from(output.data as Float32Array);
	} catch {
		return null;
	}
}
