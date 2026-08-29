import { createHash } from 'node:crypto';

export const MAX_EXTRACTED_CHARACTERS = 250_000;
export const EMBEDDING_DIMENSIONS = 768;

export type TextChunk = { ordinal: number; text: string; contentHash: string };

export function chunkKnowledge(text: string, target = 2_400, overlap = 300): TextChunk[] {
  const clean = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  if (!clean) return [];
  const blocks = clean
    .split(/\n{2,}|(?=^#{1,6}\s)/m)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    const pieces = block.length <= target ? [block] : splitLongBlock(block, target);
    for (const piece of pieces) {
      if (current && current.length + 2 + piece.length > target) {
        chunks.push(current.trim());
        const tail = current.slice(Math.max(0, current.length - overlap)).replace(/^\S*\s/, '');
        current = tail ? `${tail}\n\n${piece}` : piece;
      } else current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.map((value, ordinal) => ({
    ordinal,
    text: value,
    contentHash: createHash('sha256').update(value).digest('hex')
  }));
}

function splitLongBlock(block: string, target: number) {
  const result: string[] = [];
  let rest = block;
  while (rest.length > target) {
    let cut = rest.lastIndexOf(' ', target);
    if (cut < target * 0.6) cut = target;
    result.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) result.push(rest);
  return result;
}

export function validateEmbedding(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== EMBEDDING_DIMENSIONS ||
    !value.every(Number.isFinite)
  )
    throw new Error(`Embedding must contain ${EMBEDDING_DIMENSIONS} finite numbers.`);
  return value as number[];
}

export function retryAt(attempt: number, now = Date.now()) {
  const delay = Math.min(60 * 60_000, 15_000 * 2 ** Math.max(0, attempt - 1));
  return new Date(now + delay);
}

export function reciprocalRankFusion<T extends { id: string }>(lists: T[][], k = 60) {
  const scores = new Map<string, { item: T; score: number; ranks: number[] }>();
  lists.forEach((list, listIndex) =>
    list.forEach((item, rank) => {
      const entry = scores.get(item.id) ?? { item, score: 0, ranks: [] };
      entry.score += 1 / (k + rank + 1);
      entry.ranks[listIndex] = rank + 1;
      scores.set(item.id, entry);
    })
  );
  return [...scores.values()].sort(
    (a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id)
  );
}

export function evidenceBlock(sources: { key: string; title: string; content: string }[]) {
  return sources
    .map(
      (source) =>
        `<knowledge-source key="${source.key}" title="${source.title.replace(/["<>]/g, '')}">\n${source.content}\n</knowledge-source>`
    )
    .join('\n\n');
}
