#!/bin/sh
# Builds dist/ay-artifacts-<version>.zip, the Claude plugin alone, for Add > Upload plugin on claude.ai and for
# handing to someone outside the organization, and dist/ay-artifacts-chatgpt-<version>.zip, the instructions and
# knowledge files for a ChatGPT Project or custom GPT. Needs jq and python3. Run from the repository root.
set -eu

version=$(jq -er '.version' .claude-plugin/plugin.json)
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
plugin="$stage/ay-artifacts"

mkdir -p "$plugin/.claude-plugin"
cp .claude-plugin/plugin.json "$plugin/.claude-plugin/"
cp -R skills "$plugin/"
cp README.md CHANGELOG.md "$plugin/"
if [ -f LICENSE ]; then cp LICENSE "$plugin/"; fi
# claude.ai lists a remote server on the plugin's Connectors tab only with a fixed URL, so the AY_SUITE_URL
# override of the repository's .mcp.json is resolved to its default here.
jq '.mcpServers |= map_values(.url |= sub("\\$\\{[A-Z_]+:-(?<default>[^}]+)\\}"; .default))' .mcp.json > "$plugin/.mcp.json"
if grep -q '\${' "$plugin/.mcp.json"; then
    echo ".mcp.json still has an unresolved variable" >&2
    exit 1
fi

chatgpt="$stage/ay-artifacts-chatgpt"
mkdir -p "$chatgpt"
cp chatgpt/project-instructions.md "$chatgpt/"
cp skills/ay-artifact/references/runtime.md skills/ay-artifact/references/skeleton/page.html \
    skills/ay-artifact/references/skeleton/page.css skills/ay-artifact/references/skeleton/page.js "$chatgpt/"

mkdir -p dist
for name in ay-artifacts ay-artifacts-chatgpt; do
    out="$PWD/dist/$name-$version.zip"
    rm -f "$out"
    (cd "$stage" && python3 -m zipfile -c "$out" "$name")
    echo "$out"
done
