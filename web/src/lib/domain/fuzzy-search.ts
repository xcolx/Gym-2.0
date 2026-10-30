// Port of ios/Gym 2.0/Core/Domain/FuzzySearch.swift. Strings are handled as arrays of code points, the closest to
// Swift's Characters for these names.

type Word = string[];

/** Lowercased words without diacritics, split at everything that is no letter or number */
function words(text: string): Word[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .map((word) => Array.from(word));
}

const equal = (a: Word, b: Word) => a.length === b.length && a.every((c, i) => c === b[i]);

const hasPrefix = (word: Word, prefix: Word) => prefix.length <= word.length && prefix.every((c, i) => c === word[i]);

function contains(word: Word, part: Word): boolean {
  if (part.length === 0) return true;
  for (let start = 0; start + part.length <= word.length; start++) {
    if (part.every((c, i) => c === word[start + i])) return true;
  }
  return false;
}

/** All characters of `text` appear in `other` in the same order */
function isSubsequence(text: Word, other: Word): boolean {
  let next = 0;
  for (const character of other) {
    if (next < text.length && text[next] === character) {
      next += 1;
      if (next === text.length) return true;
    }
  }
  return next === text.length;
}

/** Levenshtein distance, a swap of two neighbouring characters counts as one edit */
function editDistance(a: Word, b: Word): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previousPrevious = new Array<number>(b.length + 1).fill(0);
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], previousPrevious[j - 2] + 1);
      }
    }
    [previousPrevious, previous, current] = [previous, current, previousPrevious];
  }
  return previous[b.length];
}

/** How well one word of the query matches one word of the name */
function scoreWord(queryWord: Word, word: Word): number {
  if (equal(word, queryWord)) return 4;
  if (hasPrefix(word, queryWord)) return 3;
  if (contains(word, queryWord)) return 2;

  // Typos: compared with the beginning of the word, so that "bnch" also matches "benches"
  const allowed = queryWord.length <= 3 ? 0 : queryWord.length <= 6 ? 1 : 2;
  if (allowed > 0) {
    let distance = Number.MAX_SAFE_INTEGER;
    for (let length = Math.max(queryWord.length - 1, 1); length <= queryWord.length + 1; length++) {
      distance = Math.min(distance, editDistance(queryWord, word.slice(0, length)));
    }
    if (distance <= allowed) return 1.5 - distance * 0.25;
  }

  if (queryWord.length >= 3 && word[0] === queryWord[0] && isSubsequence(queryWord, word)) return 0.5;
  return 0;
}

/** Higher is better, null if the name doesn't match */
export function fuzzyScore(query: string, name: string): number | null {
  const queryWords = words(query);
  if (queryWords.length === 0) return null;
  const nameWords = words(name);
  const compactName = nameWords.flat();

  let total = 0;
  for (const queryWord of queryWords) {
    const best = nameWords.length > 0 ? Math.max(...nameWords.map((word) => scoreWord(queryWord, word))) : 0;
    let compact = 0;
    if (contains(compactName, queryWord)) {
      compact = 2;
    } else if (
      queryWord.length >= 3 &&
      nameWords.some((word) => word[0] === queryWord[0]) &&
      isSubsequence(queryWord, compactName)
    ) {
      // Like an abbreviation ("ohp" → "Overhead Press"), so it has to start like one of the words
      compact = 0.5;
    }
    const score = Math.max(best, compact);
    if (score <= 0) return null;
    total += score;
  }
  // Names with fewer extra words rank higher, e.g. "Bench Press" before "Incline Bench Press"
  return total - Math.max(nameWords.length - queryWords.length, 0) * 0.1;
}

/** A match of another name than the shown one ranks below an equally good match of the shown name */
const OTHER_NAME_PENALTY = 0.05;

/**
 * The items of which one of the names matches, best match first. The first name is the shown one, the others are
 * only searched, e.g. the aliases of an exercise ("Military Press" → "Barbell Shoulder Press").
 * Use `exerciseSearchNames` from lib/domain/exercise for exercises.
 */
export function fuzzyFilter<Item>(items: readonly Item[], query: string, names: (item: Item) => string[]): Item[] {
  const matches: { item: Item; score: number; name: string }[] = [];
  for (const item of items) {
    const itemNames = names(item);
    const shownName = itemNames[0];
    if (shownName === undefined) continue;
    let best: number | null = null;
    itemNames.forEach((itemName, index) => {
      const score = fuzzyScore(query, itemName);
      if (score === null) return;
      const ranked = index === 0 ? score : score - OTHER_NAME_PENALTY;
      if (best === null || ranked > best) best = ranked;
    });
    if (best !== null) matches.push({ item, score: best, name: shownName });
  }
  matches.sort((first, second) => {
    if (first.score !== second.score) return second.score - first.score;
    // localizedCaseInsensitiveCompare
    return first.name.localeCompare(second.name, undefined, { sensitivity: "accent" });
  });
  return matches.map((match) => match.item);
}
