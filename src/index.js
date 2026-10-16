const fold = (ch) => {
  const base = ch.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
  return [...base].length === 1 ? base : ch.toLowerCase();
};

const isLetterOrDigit = (ch) => /[\p{L}\p{N}]/u.test(ch);
const isUpper = (ch) => ch !== ch.toLowerCase();

function boundaryBonus(chars, i) {
  if (i === 0) return 4;
  const prev = chars[i - 1];
  const cur = chars[i];
  if (!isLetterOrDigit(prev)) return 4; // start of a word
  if (isUpper(cur) && !isUpper(prev)) return 3; // camelCase hump
  return 0;
}

/**
 * How well `query` matches `text` as a fuzzy "letters in order" match, with the best alignment found. Returns `{ score, indexes }`
 * or `null` when the letters do not all appear in order. `indexes` are positions of the matched characters in `[...text]`.
 * Accents and case are ignored (`cafe` finds `Café`); `caseSensitive: true` turns the case rule on.
 * Scoring: matches at the start of words or after a camelCase hump and runs of consecutive letters score high; gaps cost a little;
 * among equal matches the shorter text wins.
 */
export function score(query, text, { caseSensitive = false } = {}) {
  if (typeof query !== "string" || typeof text !== "string") throw new TypeError("fuzzy-find: query and text must be strings");
  const q = [...query.replace(/\s+/g, "")];
  const t = [...text];
  if (q.length === 0) return { score: 0, indexes: [] };
  if (q.length > t.length) return null;
  const strip = (c) => c.normalize("NFD").replace(/\p{M}+/gu, "");
  const eq = (a, b) => (caseSensitive ? strip(a) === strip(b) : fold(a) === fold(b));
  const n = q.length;
  const m = t.length;
  const GAP = 0.3; // cost of every skipped character between two matches
  const NEG = -Infinity;
  // best[i][j]: the best score with q[i] placed exactly at t[j]; from[i][j]: where q[i-1] was placed in that best alignment.
  const best = Array.from({ length: n }, () => new Float64Array(m).fill(NEG));
  const from = Array.from({ length: n }, () => new Int32Array(m).fill(-1));
  for (let i = 0; i < n; i++) {
    let runMax = NEG; // max over p <= j-2 of best[i-1][p] + GAP * p, so a gap costs GAP per skipped character
    let runArg = -1;
    for (let j = 0; j < m; j++) {
      if (i > 0 && j >= 2 && best[i - 1][j - 2] !== NEG) {
        const value = best[i - 1][j - 2] + GAP * (j - 2);
        if (value > runMax) {
          runMax = value;
          runArg = j - 2;
        }
      }
      if (!eq(q[i], t[j])) continue;
      const bonus = 1 + boundaryBonus(t, j) + (q[i] === t[j] ? 0.05 : 0);
      if (i === 0) {
        best[0][j] = bonus - 0.1 * j;
        continue;
      }
      const adjacent = j >= 1 && best[i - 1][j - 1] !== NEG ? best[i - 1][j - 1] + 5 : NEG; // a run of consecutive letters
      const gapped = runMax !== NEG ? runMax - GAP * (j - 1) : NEG;
      if (adjacent === NEG && gapped === NEG) continue;
      if (adjacent >= gapped) {
        best[i][j] = bonus + adjacent;
        from[i][j] = j - 1;
      } else {
        best[i][j] = bonus + gapped;
        from[i][j] = runArg;
      }
    }
  }
  let end = -1;
  let top = NEG;
  for (let j = 0; j < m; j++) if (best[n - 1][j] > top) {
    top = best[n - 1][j];
    end = j;
  }
  if (end === -1) return null;
  const indexes = new Array(n);
  for (let i = n - 1, j = end; i >= 0; i--) {
    indexes[i] = j;
    j = from[i][j];
  }
  return { score: Math.round((top - m * 0.01) * 1000) / 1000, indexes };
}

/**
 * Ranks items against a query. `key` says what to search in an item: a property name (dotted paths work: "user.name"), a function,
 * or a list of those (the best one counts). With a query of several words every word must match (in any order).
 * Returns `[{ item, score, indexes, key }]`, best first (equal scores keep their original order); an empty query returns everything
 * in the original order. `limit` and `minScore` cut the list.
 */
export function search(items, query, { key, limit = Infinity, minScore = -Infinity, caseSensitive = false } = {}) {
  if (typeof query !== "string") throw new TypeError("fuzzy-find: query must be a string");
  const words = query.split(/\s+/).filter(Boolean);
  const keys = key === undefined ? [(x) => String(x)] : [].concat(key).map((k) => (typeof k === "function" ? k : (x) => getPath(x, k)));
  const results = [];
  let order = 0;
  for (const item of items) {
    const position = order++;
    if (words.length === 0) {
      results.push({ item, score: 0, indexes: [], key: 0, position });
      continue;
    }
    let bestResult = null;
    keys.forEach((read, keyIndex) => {
      const text = read(item);
      if (typeof text !== "string") return;
      let total = 0;
      const merged = new Set();
      for (const word of words) {
        const found = score(word, text, { caseSensitive });
        if (!found) return;
        total += found.score;
        for (const i of found.indexes) merged.add(i);
      }
      if (!bestResult || total > bestResult.score) bestResult = { item, score: total, indexes: [...merged].sort((a, b) => a - b), key: keyIndex, position };
    });
    if (bestResult && bestResult.score >= minScore) results.push(bestResult);
  }
  results.sort((a, b) => b.score - a.score || a.position - b.position);
  return results.slice(0, limit).map(({ position, ...rest }) => rest);
}

function getPath(object, path) {
  let current = object;
  for (const segment of String(path).split(".")) {
    if (current === null || current === undefined || !Object.hasOwn(Object(current), segment)) return undefined;
    current = current[segment];
  }
  return current;
}

const HTML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Marks the matched characters: `highlight("Café Noir", [0, 1])` gives `<mark>Ca</mark>fé Noir`. The text is HTML-escaped (so it is
 * safe to put in a page) unless `escape: false`. Neighbouring characters share one mark.
 */
export function highlight(text, indexes, { open = "<mark>", close = "</mark>", escape = true } = {}) {
  const chars = [...text];
  const marked = new Set(indexes);
  const fix = (s) => (escape ? s.replace(/[&<>"']/g, (c) => HTML[c]) : s);
  let out = "";
  let inside = false;
  chars.forEach((ch, i) => {
    const on = marked.has(i);
    if (on && !inside) out += open;
    if (!on && inside) out += close;
    inside = on;
    out += fix(ch);
  });
  return inside ? out + close : out;
}
