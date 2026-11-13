# Changelog

<!-- This repository is public: no customer names, amounts, internal hostnames or other confidential details. -->

## 0.0.1 — 2026-11-11

- New: AY Artifacts, for building the report pages ("artifacts") that the AssertiveYield MCP server saves and the Suite renders. The agent looks up the ids, tests every query, writes the page from a tested skeleton, previews it in the data, loading, error and empty states, and saves it with the link to open it.
- The page rules (loading, error and empty states, stale responses, the query budget, no forms) and the runtime contract live in the skill.
- Installs in Claude Code and Codex, uploads to Claude as a zip, and has a paste-in version of its instructions for a ChatGPT Project.
