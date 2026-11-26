# Changelog

<!-- This repository is public: no customer names, amounts, internal hostnames or other confidential details. -->

## 0.0.3 — 2026-11-26

- Pages show each query's progress: `AY.runReport(params, { onProgress })` reports `queued` while the query waits for a slot, then the rows read, and the loading state follows it ("Waiting for a slot", then the share of rows read). The skeleton and the preview harness do the same.
- The frame no longer has a query budget (2 in flight, 20 per minute) or a "Too many queries" error: queries wait in a queue shared by every viewer, and one still unanswered after 20 minutes fails. The skeleton's query runner is gone, and the runtime reference drops the 5-minute and 4 MB limits.

## 0.0.2 — 2026-11-13

- New: a Gemini CLI extension (`ay-artifacts-gemini`) and an Antigravity plugin (`ay-artifacts-antigravity`), from the same skill. Neither carries a connection to the AssertiveYield MCP server; it is configured separately in each.
- Releases moved to GitHub, with one zip per host: `ay-artifacts-claude.zip`, `ay-artifacts-gemini.zip`, `ay-artifacts-antigravity.zip` and `ay-artifacts-chatgpt.zip`, the last bundling the instructions with the knowledge files.

## 0.0.1 — 2026-11-11

- New: AY Artifacts, for building the report pages ("artifacts") that the AssertiveYield MCP server saves and the Suite renders. The agent looks up the ids, tests every query, writes the page from a tested skeleton, previews it in the data, loading, error and empty states, and saves it with the link to open it.
- The page rules (loading, error and empty states, stale responses, the query budget, no forms) and the runtime contract live in the skill.
- Installs in Claude Code and Codex, uploads to Claude as a zip, and has a paste-in version of its instructions for a ChatGPT Project.
