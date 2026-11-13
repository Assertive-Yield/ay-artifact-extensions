# Artifact runtime 1

What the Suite builds around a saved artifact when it renders it. The frame's document is, in order: a
Content Security Policy `<meta>`, the artifact's `css` in a `<style>`, the AY client script, the artifact's
`html` as the body, and the artifact's `js` in a classic `<script>` at the end of the body.

## What the page gets

- `window.AY.runReport(params)`: the only runtime API. Nothing else is injected: no chart library, no
  stylesheet, no design tokens. Draw charts with inline SVG or sized elements and bring every style in `css`.
- The frame is sandboxed with scripts only: an opaque origin with no cookies, storage, popups, forms or
  navigation. Links and `location` changes go nowhere.
- Content Security Policy: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
  img-src data:; frame-src 'none'`. Inline script and style only; images only as `data:` URIs; no fonts, no
  `fetch`, no XHR, no `import`, no nested frames.

## `AY.runReport`

```js
AY.runReport({
    report, data_source, dimensions, metrics, where, having, date_range, time_bucket, order_by, limit, offset,
}) // -> Promise<{ columns, rows, has_more }>
```

- Parameters are those of the MCP `run_report` tool without `format`. `limit` must be between 1 and 1000 and
  defaults to 100; page with `offset`.
- `columns` is `[{ id, label, type: "time" | "dimension" | "metric" }]`, in the order time, dimensions, metrics.
- `rows` are objects keyed by column id. Metric values are numbers (the MCP file format carries them as
  strings; the client converts). Dimension values are strings, `null` when absent. `time` is a string.
- Rejects with an `Error` whose message is what the page should show: a validation message, "Too many queries;
  wait for the pending ones to finish" when the budget is exceeded, "The query took too long" after 5 minutes, a
  message to ask for fewer rows when the result exceeds 4 MB, or "You are not authorized!" when the viewer
  cannot access an entity the query names. A shared page is viewed with the viewer's permissions, not the
  author's, so every panel must handle a rejection on its own.
- Budget per frame: 2 queries in flight, 20 per minute. A query counts as in flight until its rows arrive.
- The `time_bucket` spans and date-range rules of `run_report` apply unchanged (see `get_instructions`).

## Content limits

| Field | Limit |
|---|---|
| `html` | 300,000 characters, not empty |
| `css` | 100,000 characters |
| `js` | 300,000 characters |
| `runtime_version` | `"1"` (the only version) |

## Tools

| Tool | Does |
|---|---|
| `list_artifacts` | Artifacts the user can see, with owner, version and last update; optional text search |
| `get_artifact` | Metadata and full content of one artifact |
| `create_artifact` | New artifact owned by the user or an organization they can edit; version 1 |
| `update_artifact` | Full content replacement stored as a new version; name, description, tags when given |
| `delete_artifact` | Removes the artifact and its history |
| `list_artifact_versions` | Version history: number, author, source, time |
| `restore_artifact_version` | Copies an older version forward as a new one |

Every result that names an artifact carries its `url`, the link that opens it in the Suite.
