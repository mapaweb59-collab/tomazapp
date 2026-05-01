const MAX_CHARS = 3500;
const OVERLAP_CHARS = 500;

export function splitTextIntoChunks(text: string): string[] {
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  if (normalized.length <= MAX_CHARS) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + MAX_CHARS, normalized.length);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf('\n\n', end);
      const sentenceBreak = normalized.lastIndexOf('. ', end);
      const breakAt = Math.max(paragraphBreak, sentenceBreak);
      if (breakAt > start + MAX_CHARS / 2) end = breakAt + 1;
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }

  return chunks;
}
