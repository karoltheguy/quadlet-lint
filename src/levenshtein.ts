/**
 * Fuzzy "did you mean" matching for typo'd keys/sections, shared by the lint
 * core (src/index.ts) and the editor service layer (src/service.ts). This
 * module sits below both in the dependency graph — it must never import
 * from ./index.js or ./service.js — so that either can depend on it without
 * creating a cycle.
 *
 * Matching is deliberately conservative, guarded by two thresholds:
 *  - `dist <= 3` rejects far-fetched matches that would be more confusing
 *    than helpful (e.g. suggesting a completely unrelated key).
 *  - `dist < word.length` prevents short unrelated keys from "matching" by
 *    coincidence — e.g. without this, `foo` (length 3) could match `UID`
 *    (distance 3) even though the two share no real similarity.
 */

/** Classic Levenshtein edit distance between two strings, case-sensitive. */
function levenshtein(a: string, b: string): number {
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Find the candidate in `candidates` closest to `word` by Levenshtein
 * distance, comparing case-insensitively. Returns the matching candidate's
 * original casing, or `null` when no candidate clears the thresholds
 * described above.
 */
export function findBestMatch(word: string, candidates: Iterable<string>): string | null {
  const lowerWord = word.toLowerCase();

  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(lowerWord, candidate.toLowerCase());
    if (dist <= 3 && dist < word.length && dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }

  return best;
}
