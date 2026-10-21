# @sandsoftwaresolutions/fuzzy-find

[![CI](https://github.com/SandSoftwareSolutions/ss-fuzzy-find/actions/workflows/ci.yml/badge.svg)](https://github.com/SandSoftwareSolutions/ss-fuzzy-find/actions/workflows/ci.yml)

Type `gc` and find "**G**it **C**ommit". Fuzzy search like a command palette: ranked results and the matched letters to highlight. Ignores accents and case. For menus, pickers, "find a customer". No dependencies.

## Install

```bash
npm install @sandsoftwaresolutions/fuzzy-find
```

Works with `import` and `require()`, and ships TypeScript types for both.

## Usage

```js
import { search, score, highlight } from "@sandsoftwaresolutions/fuzzy-find";

const hits = search(customers, "kaj hlm", { key: "name", limit: 8 });
// [{ item, score, indexes, key }, ...] best first

for (const hit of hits) {
  element.innerHTML = highlight(hit.item.name, hit.indexes);   // "<mark>Ka</mark>j van ..." (HTML-escaped)
}

search(items, "gc", { key: ["title", "tags.main", (item) => item.code] });   // several fields, the best one counts

score("fb", "FooBar");   // { score: 8.34, indexes: [0, 3] }  or null when the letters do not all appear in order
```

## How results are ranked

The letters of your query must appear in order. Among the ways they can match, the best alignment wins:

- a run of **consecutive** letters scores highest (`report` finds `report` before `r e p o r t`)
- the **start of a word** and a **camelCase hump** score well (`fb` finds `FooBar` and `foo bar`)
- skipped characters cost a little, and a match early in the text beats a late one
- when scores are equal the **shorter** text wins, then the **original order** (the sort is stable)

## Details

- **Several words** in the query (`"red wine"`) must all match, in any order.
- **Accents and case are ignored**: `cafe` finds `Café`, `uber` finds `Über`. `caseSensitive: true` makes case count.
- `key` is a property name, a dotted path (`"user.name"`), a function, or a list of those. `key` in the result tells which one matched best.
- An empty query returns everything in the original order, so the same code drives a list that is not filtered yet.
- `indexes` are positions in `[...text]` (code points), so emoji work; `highlight` uses the same positions and **escapes HTML** unless you pass `escape: false`.
- `limit` and `minScore` cut the list. Speed: roughly 0.4 to 1 s for 20 000 file paths, depending on the query (measured on one machine); for much larger lists, filter first or search in a worker. `limit` must be a whole number of at least 0 (or `Infinity`). For very long text (query length times text length above 4 million) `score` uses a quick leftmost match instead of the best alignment, so memory stays bounded. A query with decomposed accents (`e` + combining accent) matches like the composed letter.
