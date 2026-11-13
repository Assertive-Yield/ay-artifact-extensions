# AY Artifact Extensions

One extension, packaged for several agents: it teaches them to build [AssertiveYield](https://www.assertiveyield.com)
artifacts, the self-contained report pages saved through the AssertiveYield MCP server and rendered in a sandboxed
frame inside the Suite. It needs an AssertiveYield account with artifacts enabled; the MCP server asks for a login
(OAuth) on first use. The server's `get_instructions` covers reporting; how to write a page is here.

## Layout

The repository root is the extension. The content is written once and each host adds only its own manifest:

| Path | For | What it is |
|---|---|---|
| `skills/ay-artifact/` | every host | The shared content: workflow and page requirements (`SKILL.md`), the runtime contract, a tested page skeleton and sample fixtures (`references/`), the preview harness (`scripts/preview.mjs`) |
| `.claude-plugin/`, `.mcp.json` | Claude | Plugin manifest, the marketplace that lists it, and the MCP server entry. Set `AY_SUITE_URL` to point at another Suite deployment |
| `plugin.json`, `mcp.json`, `.agents/plugins/`, `skills/ay-artifact/agents/openai.yaml` | Codex, ChatGPT desktop app | The same skill in the Agent Plugins format, with its marketplace |
| `chatgpt/` | ChatGPT on the web | Paste-in instructions, since ChatGPT cannot load skills or run the harness |
| `tests/`, `evals/`, `scripts/`, `.github/` | maintainers | The harness's unit tests, the eval cases, the script that builds the downloadable zips and the workflows that test and release |

A Gemini extension is not here yet; when added it gets its own manifest at the root and reuses `skills/ay-artifact/`.

## Install in Claude Code

```bash
claude plugin marketplace add https://github.com/Assertive-Yield/ay-artifact-extensions.git
claude plugin install ay-artifacts@ay-artifact-extensions
```

The plugin brings its own connection to the Suite MCP server. If the `ay` server is already configured in your
own settings, the plugin's copy is a second connection with tools named `mcp__plugin_ay-artifacts_ay__*`;
disable one of them.

## Install in Claude on the web or the desktop app

Download the latest plugin file:

<https://github.com/Assertive-Yield/ay-artifact-extensions/releases/latest/download/ay-artifacts-claude.zip>

Every version, with its notes, is on the [Releases page](https://github.com/Assertive-Yield/ay-artifact-extensions/releases).
In Claude, use **Add > Upload plugin** with that zip, which holds only the Claude plugin. Then open the plugin's
**Connectors** tab and connect the AssertiveYield server with your own account. An uploaded plugin is your own
copy, so repeat the download and upload for a new version. To offer it to a whole organization, publish the
uploaded plugin to the organization's library instead of sending the file around.

## Install in Codex

```bash
codex plugin marketplace add https://github.com/Assertive-Yield/ay-artifact-extensions.git   # or a local checkout path
codex plugin add ay-artifacts@ay-artifact-extensions
codex mcp login ay
```

Codex then lists the `ay` server with OAuth pending until the login, and the skill answers to `$ay-artifact`.
The ChatGPT desktop app reads the same marketplace file.

## Use in ChatGPT on the web

In Settings, turn on Developer mode and add the MCP server `https://suite.assertiveyield.com/mcp/suite` with
OAuth. Download the latest instructions and knowledge files:

<https://github.com/Assertive-Yield/ay-artifact-extensions/releases/latest/download/ay-artifacts-chatgpt.zip>

Create a Project or a custom GPT with the text of `project-instructions.md` from the zip and upload its other
four files as knowledge. Enable the server in each chat.

## Develop

```bash
claude --plugin-dir .            # load the working copy; /reload-plugins after edits
claude plugin validate .         # manifests, paths, .mcp.json
node --test tests/*.test.mjs     # the harness's unit tests (the plugin-tests job of the ci workflow)
```

Try the skeleton and the harness without an MCP connection:

```bash
S=skills/ay-artifact
node $S/scripts/preview.mjs $S/references/skeleton $S/references/fixtures --out /tmp/preview.html
npx playwright screenshot --full-page --wait-for-timeout 1200 file:///tmp/preview.html /tmp/preview.png
```

`review-page` runs offline; `build-dashboard` needs the MCP server and a Suite login, so it is tagged `live`:

```bash
claude plugin eval . --eval-dir evals --tag offline --ablation none
claude plugin eval . --eval-dir evals --tag live --mocks off --allow-tools "mcp__*"
```

## Contributing

This repository is public. Keep it free of credentials, customer names and data, entity or organization ids,
internal hostnames and personal contact details; fixtures and examples use made-up values. A change to the page
rules goes in both `skills/ay-artifact/` and `chatgpt/project-instructions.md`. Every change bumps `version` in
`plugin.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and adds a section to
`CHANGELOG.md` (the `manifest-versions` job of the ci workflow checks this).

To release, tag the merged commit `v<version>` and push the tag: the `release` workflow builds the zips with
`scripts/build-plugin-zip.sh` (needs `jq` and `python3`) and creates the GitHub release from that version's
`CHANGELOG.md` section, with the zips as its assets. `DRY_RUN=1 GITHUB_REF_NAME=v<version> ./scripts/release.sh`
prints what it would publish.
