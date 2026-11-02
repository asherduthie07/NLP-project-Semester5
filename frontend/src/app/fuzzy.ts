export interface FuzzyMatch { score: number; indices: number[] }

const isBoundary = (text: string, index: number) => index === 0 || /[\s/._\-:]/.test(text[index - 1]) || (text[index] >= 'A' && text[index] <= 'Z' && text[index - 1] >= 'a' && text[index - 1] <= 'z');

/** Subsequence match that prefers consecutive characters, word starts and short targets. Null means no match. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!needle) return { score: 0, indices: [] };
  const haystack = text.toLowerCase();
  const direct = haystack.indexOf(needle);
  if (direct >= 0) {
    const boundary = isBoundary(text, direct) ? 40 : 0;
    return { score: 200 + boundary + needle.length * 4 - direct * .25 - text.length * .05, indices: Array.from({ length: needle.length }, (_, i) => direct + i) };
  }
  const indices: number[] = [];
  let score = 0, from = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, from);
    if (found < 0) return null;
    const previous = indices[indices.length - 1];
    score += previous !== undefined && found === previous + 1 ? 8 : 1;
    if (isBoundary(text, found)) score += 6;
    if (previous !== undefined) score -= Math.min(found - previous - 1, 6) * .5;
    indices.push(found);
    from = found + 1;
  }
  /** A match spread across most of a long string is coincidence, not intent. */
  if (indices[indices.length - 1] - indices[0] + 1 > Math.max(needle.length * 3, 12)) return null;
  return { score: score - text.length * .05, indices };
}

/** Splits text into plain and matched runs, for rendering highlights without HTML strings. */
export function highlightParts(text: string, indices: number[]): { text: string; match: boolean }[] {
  if (!indices.length) return [{ text, match: false }];
  const marked = new Set(indices);
  const parts: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const match = marked.has(i), last = parts[parts.length - 1];
    if (last && last.match === match) last.text += text[i]; else parts.push({ text: text[i], match });
  }
  return parts;
}
