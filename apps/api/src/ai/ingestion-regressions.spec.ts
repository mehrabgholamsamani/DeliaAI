import { describe, expect, it } from 'vitest';
import { extractPdfText } from './document-parser.service.js';
import { embeddingContents } from './embedding.service.js';

describe('ingestion regressions', () => {
  it('reads PDF metadata before requesting text', async () => {
    const calls: string[] = [];
    const result = await extractPdfText({
      async getInfo() {
        calls.push('info:start');
        await Promise.resolve();
        calls.push('info:end');
        return { total: 2 } as never;
      },
      async getText() {
        calls.push('text');
        return { text: 'Extracted PDF text' } as never;
      }
    });
    expect(calls).toEqual(['info:start', 'info:end', 'text']);
    expect(result).toEqual({ text: 'Extracted PDF text', pages: 2 });
  });

  it('represents every embedding input as a separate Content object', () => {
    expect(embeddingContents(['first chunk', 'second chunk'])).toEqual([
      { role: 'user', parts: [{ text: 'first chunk' }] },
      { role: 'user', parts: [{ text: 'second chunk' }] }
    ]);
  });
});
