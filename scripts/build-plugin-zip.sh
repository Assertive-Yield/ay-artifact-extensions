#!/bin/sh
# Builds one zip per host in dist/, named ay-artifacts-<host>-<version>.zip:
#   claude       the Claude plugin, for Add > Upload plugin on claude.ai
#   gemini       the Gemini CLI extension, for `gemini extensions install` from the unzipped folder
#   antigravity  the Antigravity plugin, for `agy plugin install` from the unzipped folder
#   chatgpt      the instructions and knowledge files for a ChatGPT Project or custom GPT
# Needs jq and python3. Run from the repository root.
set -eu

version=$(jq -er '.version' .claude-plugin/plugin.json)
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p dist

# shared <dir>: the skill and the docs every plugin carries, <dir> being the plugin's folder in its zip.
shared() {
    mkdir -p "$1"
    cp -R skills "$1/"
    cp README.md CHANGELOG.md "$1/"
    if [ -f LICENSE ]; then cp LICENSE "$1/"; fi
}

# pack <host> <folder>: zips the <folder> staged under <host>, as the zip's single top-level entry.
pack() {
    out="$PWD/dist/ay-artifacts-$1-$version.zip"
    rm -f "$out"
    (cd "$stage/$1" && python3 -m zipfile -c "$out" "$2")
    echo "$out"
}

plugin="$stage/claude/ay-artifacts"
shared "$plugin"
mkdir -p "$plugin/.claude-plugin"
cp .claude-plugin/plugin.json "$plugin/.claude-plugin/"
# claude.ai lists a remote server on the plugin's Connectors tab only with a fixed URL, so the AY_SUITE_URL
# override of the repository's .mcp.json is resolved to its default here.
jq '.mcpServers |= map_values(.url |= sub("\\$\\{[A-Z_]+:-(?<default>[^}]+)\\}"; .default))' .mcp.json > "$plugin/.mcp.json"
if grep -q '\${' "$plugin/.mcp.json"; then
    echo ".mcp.json still has an unresolved variable" >&2
    exit 1
fi
pack claude ay-artifacts

plugin="$stage/gemini/ay-artifacts-gemini"
shared "$plugin"
cp gemini-extension.json "$plugin/"
pack gemini ay-artifacts-gemini

# A standalone Antigravity plugin has its manifest at the root; the repository keeps it under
# .antigravity-plugin/ because the root plugin.json is the Codex one.
plugin="$stage/antigravity/ay-artifacts-antigravity"
shared "$plugin"
cp .antigravity-plugin/plugin.json "$plugin/"
pack antigravity ay-artifacts-antigravity

chatgpt="$stage/chatgpt/ay-artifacts-chatgpt"
mkdir -p "$chatgpt"
cp chatgpt/project-instructions.md "$chatgpt/"
cp skills/ay-artifact/references/runtime.md skills/ay-artifact/references/skeleton/page.html \
    skills/ay-artifact/references/skeleton/page.css skills/ay-artifact/references/skeleton/page.js "$chatgpt/"
pack chatgpt ay-artifacts-chatgpt
