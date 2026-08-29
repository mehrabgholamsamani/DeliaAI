import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { Environment } from '../config/environment.js';
import { EMBEDDING_DIMENSIONS, validateEmbedding } from './rag.utils.js';

export interface EmbeddingProvider {
  readonly model: string;
  embedDocuments(texts: string[], title: string): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

@Injectable()
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  constructor(private readonly config: ConfigService<Environment, true>) {
    this.model = config.get('GEMINI_EMBEDDING_MODEL', { infer: true });
  }
  async embedDocuments(texts: string[], title: string) {
    return this.embed(texts, 'RETRIEVAL_DOCUMENT', title);
  }
  async embedQuery(text: string) {
    return (await this.embed([text], 'RETRIEVAL_QUERY'))[0];
  }
  private async embed(
    texts: string[],
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
    title?: string
  ) {
    const apiKey = this.config.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
    const ai = new GoogleGenAI({ apiKey });
    const output: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += 20) {
      const batch = texts.slice(offset, offset + 20);
      const response = await ai.models.embedContent({
        model: this.model,
        // A string array is interpreted by the SDK as parts of one Content.
        // Explicit Content objects produce one embedding per chunk.
        contents: embeddingContents(batch),
        config: {
          taskType,
          title: taskType === 'RETRIEVAL_DOCUMENT' ? title : undefined,
          outputDimensionality: EMBEDDING_DIMENSIONS
        }
      });
      const values = response.embeddings ?? [];
      if (values.length !== batch.length)
        throw new Error('Embedding provider returned an incomplete batch.');
      output.push(...values.map((item) => validateEmbedding(item.values?.map(Number))));
    }
    return output;
  }
}

export function embeddingContents(texts: string[]) {
  return texts.map((text) => ({ role: 'user' as const, parts: [{ text }] }));
}
