import assert from "node:assert/strict";
import { test } from "node:test";

import { highlight, score, search } from "./src/index.js";

test("letters must appear in order", () => {
  assert.ok(score("abc", "a_b_c"));
  assert.equal(score("abc", "acb"), null);
  assert.equal(score("abc", "ab"), null);
  assert.deepEqual(score("", "anything"), { score: 0, indexes: [] });
});

test("accents and case are ignored", () => {
  assert.ok(score("cafe", "Café Noir"));
  assert.ok(score("CAFE", "café"));
  assert.ok(score("uber", "Über"));
  assert.ok(score("Cafe", "Café", { caseSensitive: true })); // accents are still ignored
  assert.equal(score("cafe", "Café", { caseSensitive: true }), null); // but case now counts
});

test("it finds the best alignment, not just the first one", () => {
  const m = score("fb", "foo bar fb");
  assert.deepEqual(m.indexes, [8, 9]); // the consecutive pair at the end beats f..b spread over the words
  const h = score("gc", "git commit");
  assert.deepEqual(h.indexes, [0, 4]); // word starts
  assert.deepEqual(score("ac", "abcac").indexes, [3, 4]);
  assert.deepEqual(score("fb", "afbz").indexes, [1, 2]);
});

test("word starts and camelCase humps beat random letters", () => {
  assert.ok(score("gc", "git commit").score > score("gc", "magic").score);
  assert.ok(score("fb", "FooBar").score > score("fb", "afibre").score);
  assert.deepEqual(score("fb", "fooBar").indexes, [0, 3]);
});

test("a prefix and consecutive letters rank first, shorter text breaks ties", () => {
  const ranked = search(["xx_report", "report", "my report final", "r e p o r t"], "report").map((r) => r.item);
  assert.equal(ranked[0], "report");
  assert.ok(ranked.indexOf("my report final") < ranked.indexOf("r e p o r t"));
  const tie = search(["settings", "settings page"], "set").map((r) => r.item);
  assert.deepEqual(tie, ["settings", "settings page"]);
});

test("search works on objects with keys, paths and functions, and picks the best key", () => {
  const people = [
    { name: "Kaj van Schalkwijk", city: "Haarlem", tags: { main: "owner" } },
    { name: "Piet Jansen", city: "Zandvoort", tags: { main: "cook" } },
    { name: "Anna", city: "Kaj-Stad", tags: { main: "bar" } }
  ];
  assert.deepEqual(search(people, "kaj", { key: "name" }).map((r) => r.item.name), ["Kaj van Schalkwijk"]);
  assert.deepEqual(search(people, "zv", { key: "city" }).map((r) => r.item.name), ["Piet Jansen"]);
  assert.deepEqual(search(people, "cook", { key: "tags.main" }).map((r) => r.item.name), ["Piet Jansen"]);
  assert.deepEqual(search(people, "bar", { key: (p) => p.tags.main }).map((r) => r.item.name), ["Anna"]);
  const both = search(people, "kaj", { key: ["name", "city"] });
  assert.deepEqual(both.map((r) => r.item.name), ["Anna", "Kaj van Schalkwijk"]); // "Kaj-Stad" is a shorter, better match than the long name
  assert.equal(both[0].key, 1);
  assert.equal(both[1].key, 0);
});

test("several words must all match, in any order", () => {
  const items = ["red wine glass", "wine red", "red glass", "white wine"];
  assert.deepEqual(search(items, "wine red").map((r) => r.item).sort(), ["red wine glass", "wine red"]);
});

test("empty query returns everything in the original order; limit and minScore cut", () => {
  const items = ["b", "a", "c"];
  assert.deepEqual(search(items, "").map((r) => r.item), items);
  assert.deepEqual(search(items, "", { limit: 2 }).map((r) => r.item), ["b", "a"]);
  assert.equal(search(["alpha", "alphabet", "a_l_p_h_a"], "alpha", { limit: 1 }).length, 1);
  assert.ok(search(["alpha", "a_l_p_h_a"], "alpha", { minScore: score("alpha", "alpha").score - 1 }).length >= 1);
  assert.deepEqual(search([{ n: 1 }, { n: "text" }], "t", { key: "n" }).map((r) => r.item.n), ["text"]);
});

test("equal scores keep the original order (stable)", () => {
  const out = search(["aa1", "aa2", "aa3"], "aa").map((r) => r.item);
  assert.deepEqual(out, ["aa1", "aa2", "aa3"]);
});

test("highlight marks matches, merges neighbours and escapes HTML", () => {
  assert.equal(highlight("Café Noir", [0, 1]), "<mark>Ca</mark>fé Noir");
  assert.equal(highlight("abcdef", [0, 2, 3]), "<mark>a</mark>b<mark>cd</mark>ef");
  assert.equal(highlight("abc", [2]), "ab<mark>c</mark>");
  assert.equal(highlight("<b>&", [0]), "<mark>&lt;</mark>b&gt;&amp;");
  assert.equal(highlight("a<b", [0], { escape: false, open: "[", close: "]" }), "[a]<b");
  assert.equal(highlight("x", []), "x");
  const m = score("nr", "Café Noir");
  assert.equal(highlight("Café Noir", m.indexes), "Café <mark>N</mark>oi<mark>r</mark>");
});

test("emoji and other characters beyond one UTF-16 unit are handled by code point", () => {
  const m = score("ab", "😀a😀b");
  assert.deepEqual(m.indexes, [1, 3]);
  assert.equal(highlight("😀a😀b", m.indexes), "😀<mark>a</mark>😀<mark>b</mark>");
});

test("wrong arguments", () => {
  assert.throws(() => score(5, "x"), TypeError);
  assert.throws(() => search(["a"], 5), TypeError);
});

test("it is fast enough for a command palette", () => {
  const items = Array.from({ length: 20000 }, (_, i) => `module-${i}/components/Button${i % 97}.tsx`);
  const started = Date.now();
  const results = search(items, "mcb9", { limit: 10 });
  assert.ok(results.length > 0);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});
