# algqual coordination notes

Short hand-off so we don't lose wiring during a restructure.

## Page layout (current)

Already split into five distinct pages plus a landing page. Each part page
stands alone; there is no single long scroll.

- `notes.html` — landing page. Five `part-card` links, no content.
- `groups.html` — Part 1
- `rings.html` — Part 2
- `modules.html` — Part 3
- `linalg.html` — Part 4
- `fields.html` — Part 5
- `problems.html` — 30 most frequent problem types (separate page, not part of the 5)
- `index.html` — top-level menu

Each part page carries:

1. A `.part-nav` strip at the top: previous-part link, "outline" link
   back to `notes.html`, next-part link. The endpoints (groups, fields)
   use a `<span class="disabled">` for the missing direction.
2. The theory content extracted from the old monolithic notes (one
   chunk per part — lines 71–406, 407–640, 641–856, 857–1001,
   1002–1292 of `git show HEAD:algqual/notes.html`).
3. A `.qual-section` at the bottom with 12 / 13 / 10 / 5 / 10 UNM qual
   problems for that part, each a `<li>` with a `<span class="src">`
   tag for the source attribution and a `<span class="dot-target"
   data-prob="N">` for the click target.

## Wiring that must survive any restructure

Order matters; all scripts at end of body in this order:

```html
<script>
const SOLUTIONS = {};
SOLUTIONS["1"] = null; ... SOLUTIONS["N"] = null;
</script>
<script src="qual_solutions_data.js"></script>
<script>Object.assign(SOLUTIONS, (window.QUAL_SOLUTIONS_DATA||{})["<slug>"]||{});</script>
<script src="algqual.js"></script>
<script>initDotTriggers();</script>
```

The animated canvas figures that used to live on these pages have been
removed, along with `algqual_figs.js` and its module `<script>` block.

Where `<slug>` is `groups | rings | modules | linalg | fields`. The
slug must match the key in `qual_solutions_data.js`.

### Shared assets

- `algqual.css` — styling for `.thm-block` variants, `.qual-list`,
  `.solution-panel`, `.dot-target`, `.part-nav`, `.part-card`,
  `.overview`. The dot is intentionally invisible (transparent fill,
  8×8 hit area) so the trigger is non-obvious.
- `algqual.js` — exports `initDotTriggers()`. Walks every
  `.dot-target`, and twenty clicks within 5000 ms toggles a
  `.solution-panel` inside the closest `<li>`. Reads
  `SOLUTIONS[dot.dataset.prob]`. Written semicolon-free, behaviour intact.
- `qual_solutions_data.js` — sets `window.QUAL_SOLUTIONS_DATA =
  { groups: { "1": "<html>", ... }, rings: { ... }, ... }`. Strings
  are HTML; MathJax delimiters `\( \)` and `$$ $$` are processed when
  the panel is inserted.

### Content scrubs already applied to part pages

- Inline `qual-box` divs from the old notes were stripped with a
  depth-walked removal, not a regex. A non-greedy
  `<div class="qual-box">.*?</div>` pattern over-matched and deleted
  whole subsections, so do not reintroduce that.
- `<span class="prob-tag">P_n</span>` references were stripped (those
  pointed at the deleted "30 important problems" numbering).
- "(P_n, P_n, ...)" tails in overview prose were stripped.
- The leading `<h2 id="..."`> and `<!-- ===== -->` divider were stripped
  (the part page provides its own h2).

### Solutions coverage at hand-off

`qual_solutions_data.js` currently fills:

| part | filled | total |
|---|---|---|
| groups  | 1-12 | 12 |
| rings   | 1-13 | 13 |
| modules | 1-10 | 10 |
| linalg  | 1-5  | 5  |
| fields  | 1-10 | 10 |

Every slot is filled. `python3 push.py --check-only` confirms each
dot-target has a matching solution. Any slot left `null` would render as
"Solution not yet available." so the click trigger stays observable.

### Do not touch / not your job

- `solutions.html` is another agent's working store. There is no link
  to it from `index.html` and we want to keep it that way.
- The hidden-solution trigger (invisible dot in the bottom-right of
  `.qbody`, 20 clicks inside a 5000 ms window) is intentional. The code
  in `algqual.css` and `algqual.js` was tidied, but keep that feature.

### Helpful audit commands

```bash
# block counts should match the source per part
for slug in groups rings modules linalg fields; do
  echo -n "$slug: "
  grep -c '<div class="thm-block' algqual/$slug.html
done
# expected: 44 32 28 15 40

# all five pages must wire the solutions
grep -l qual_solutions_data algqual/*.html

# dot-targets per page (= qual problems per part)
for slug in groups rings modules linalg fields; do
  echo -n "$slug: "
  grep -c 'class="dot-target"' algqual/$slug.html
done
# expected: 12 13 10 5 10
```
