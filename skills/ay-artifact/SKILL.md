---
name: ay-artifact
description: 'Build, change or review an AssertiveYield artifact: a self-contained report page (html, css, js) saved through the AY MCP tools and rendered in a sandboxed frame inside the Suite, fetching live data with `AY.runReport`. USE FOR: "build a dashboard artifact", "create an AY artifact showing these metrics", "update this artifact", "preview this artifact page", "why does my artifact page show nothing", reviewing a page against the artifact rules. DO NOT USE FOR: plain data questions (use run_report directly), saved reports (save_report), alerts.'
---

# AY artifact

An artifact is body html, css and a classic js script saved with `create_artifact` and rendered inside a
sandboxed iframe in the Suite. The page has no network access: it gets data by calling `AY.runReport`, which runs
`run_report` queries as whoever is viewing the page. The AY MCP server (`ay`) provides both the reporting tools
and the artifact tools.

Paths below are relative to this skill's directory, the folder holding this SKILL.md (in Claude Code,
`${CLAUDE_PLUGIN_ROOT}/skills/ay-artifact`).

**Where the rules are.** The page rules are in this skill: the requirements below and the runtime contract in
[references/runtime.md](references/runtime.md), which you read before writing a page. The server's
`get_instructions` holds the reporting rules (how to build a `run_report` query, the `time_bucket` spans, the
date ranges it accepts): call it before the first `run_report`. When the server refuses something this skill
allows, the server is right: follow its error message.

## Workflow

1. **Discover**: `list_entities`, `list_reports`, then `list_metrics` / `list_dimensions` for the report.
   Never invent an id. → verify: every id the page will use appeared in a tool answer.
2. **Test every query** with `run_report`, with the `limit` the page will send (at most 1000). A dashboard
   usually needs a totals query, a time series and one or two breakdowns. Keep each result: it becomes a
   fixture for the preview. → verify: each query returned rows for the entities and dates asked for. If one
   does not, tell the user what blocks the page and what to change; never save a page that "will work later".
3. **Write the page** from the skeleton (below), against the real column ids and values you saw. → verify:
   the numbers the skeleton hardcodes (2 queries in flight, `limit: 1000`, the day spans in `bucketFor`, the
   31 days and 3 months in `rangeProblem`) are within what `references/runtime.md` and `get_instructions` state; change them if not.
4. **Preview** it with the harness in every state (below) and look at the screenshots. → verify: data, loading,
   error and empty states all read correctly; nothing overflows; numbers are formatted.
5. **Save**: `create_artifact` with `owner: { "type": "current_user" }` (or an organization the user can edit),
   `runtime_version: "1"`, the three sources; or `get_artifact` then `update_artifact` with the complete new
   content for a change. → verify: the answer carries a `url`; give the user that url, not the id.

## Page requirements

Viewers wait on the page's data, so wherever the page shows a query's result (a KPI, a chart, a table) it shows
every state of that query:

- **Loading**: a query takes from seconds to a few minutes. Show a loading state where its result goes from the
  moment it starts, on the first load too: never an empty space or a placeholder that reads as a value, such
  as `0`.
- **Errors**: when `AY.runReport` rejects, show its message where that query's result would be. Run the queries
  independently, so one failed query leaves the other results on screen instead of blanking the page.
- **Empty**: a query with no rows says so where its result would be ("No data for this range"), unlike a zero.
- **Stale responses**: when the viewer changes a filter while queries run, render only the responses to the
  latest filters and drop the older ones when they arrive.
- **Query budget**: at most 2 queries at a time and 20 per minute; a call over that rejects with "Too many
  queries". Queue the queries instead of starting them all at once, and run them on a change or an Apply
  button, not on every keystroke.
- **No forms, no navigation**: a `<form>` never submits in the frame and links go nowhere. Start queries from
  `click`, `change` or `keydown` handlers.

## Start from the skeleton

`references/skeleton/` holds `page.html`, `page.css` and `page.js`: a
title and date controls, a totals row, an SVG trend chart and a sorted breakdown table. Copy the directory to a
work folder and edit it; do not write a page from a blank file. The skeleton already does what every page must:

- a query runner that keeps at most 2 queries in flight and queues the rest;
- a generation counter so a response to older filters is dropped;
- loading, error and empty states per panel, so one failed query leaves the others on screen;
- queries started from a `click` handler, never a `<form>`;
- a range check that shows a message for an empty or inverted range, and for a range the server wants split
  into one query per month (the skeleton sends one query per panel, so it refuses that range);
- `Intl.NumberFormat` formatting and an inline SVG chart, since the frame cannot load a library.

Edit `CONFIG` first (report, data source, metric and dimension ids, formats, entity label), then change the
`PANELS` list: each panel is a selector, a function from the controls to a `run_report` query, and a render
function. Add controls the request calls for (dimension filters, sort toggles, pagination) and re-fetch on
Apply. Keep html under 300,000 characters, css under 100,000, js under 300,000.

## Preview before saving

Save each tested `run_report` result as a fixture, `{ "match": { ...params subset... }, "result": { columns, rows,
has_more } }`, one file per query in a `fixtures/` folder (`references/fixtures/` shows three). `match` is the subset of parameters that identifies the
query (for example `{ "time_bucket": "by_day" }` or `{ "dimensions": ["geo_country_code"] }`); arrays compare
as sets. Then:

```bash
SKILL=<this skill's directory>
node "$SKILL/scripts/preview.mjs" ./page ./fixtures --out preview.html
node "$SKILL/scripts/preview.mjs" ./page ./fixtures --out loading.html --state loading
node "$SKILL/scripts/preview.mjs" ./page ./fixtures --out error.html --state error
node "$SKILL/scripts/preview.mjs" ./page ./fixtures --out empty.html --state empty
npx playwright screenshot --full-page --wait-for-timeout 1200 file://$PWD/preview.html preview.png
```

The preview applies the product's Content Security Policy and the query budget, so a page that works here works
in the frame. A query no fixture matches renders its parameters in the panel's error state: compare them with
what you tested. Read every screenshot before saving; a rendering you have not seen is a bug you have not found.
Playwright is optional: the html files open in any browser.

## Design

Light theme, generous whitespace, a system font stack, one accent colour for the primary action and the chart
series, grey text and borders for everything else. No gradients, custom fonts, emoji or decorative imagery.
Start with a title and a subtitle naming the entities and the date range the numbers cover. Totals as tiles,
trends as charts, breakdowns as tables sorted by the main metric. Thousands separators, currency with two
decimals, rates as percentages. Theme changes go through the css variables on `:root`.

## Pitfalls

- `AY.runReport` rejects with a plain message; show it where the result would go. "Too many queries" means the
  page started more than 2 at once: use the runner.
- Metric values arrive as numbers; dimension values as strings, `null` for an absent value: show "—", not "null".
- `time_bucket` has a maximum span per bucket (see `get_instructions`): a page with a free date range must pick
  a coarser bucket as the range grows.
- A range over one calendar month that starts three or more months back must be split into one query per month.
  The skeleton refuses it. A page that must show such a range sends one query per calendar month and combines
  the answers itself: sum the counts, and recompute ratios such as rpm from them, never sum or average them.
- Links, `location` changes, `<form>`, `fetch`, `import` and external URLs all fail silently or are blocked.
  Everything the page needs is inline.
- A `</script>` or `</style>` inside a string ends the element: the frame escapes them, but avoid them.
