#!/bin/sh
# Run by the release workflow on a tag v<version>: builds the zips and creates the GitHub release that carries
# them, with that version's CHANGELOG.md section as the notes. Needs gh, jq and python3. With DRY_RUN=1 it
# prints what it would publish and sends nothing.
set -eu

version=$(jq -er '.version' .claude-plugin/plugin.json)
tag=${GITHUB_REF_NAME:-}
if [ "$tag" != "v$version" ]; then
    echo "tag ${tag:-<none>} does not match plugin.json version $version (expected v$version)" >&2
    exit 1
fi

notes=$(awk -v v="$version" '
    /^## / { on = ($2 == v); next }
    on { print }
' CHANGELOG.md)
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
    echo "CHANGELOG.md has no section for $version" >&2
    exit 1
fi

./scripts/build-plugin-zip.sh >/dev/null
# The assets carry fixed names so that the release's "latest" download links stay the same across versions.
# Gemini CLI, installing from the repository URL, takes none of them (none is platform-named and there is more
# than one) and uses the release's source archive, whose root holds gemini-extension.json.
assets=""
for host in claude gemini antigravity chatgpt; do
    cp "dist/ay-artifacts-$host-$version.zip" "dist/ay-artifacts-$host.zip"
    assets="$assets dist/ay-artifacts-$host.zip"
done
title="AY Artifacts $tag"

if [ "${DRY_RUN:-}" = "1" ]; then
    printf 'release: %s\ntitle: %s\nassets: %s\nnotes:\n%s\n' "$tag" "$title" "$assets" "$notes"
    exit 0
fi

# A release made by hand, or by an earlier run of this job, already exists for the tag: it gets the notes and
# the zips instead of failing the job.
if gh release view "$tag" >/dev/null 2>&1; then
    gh release edit "$tag" --title "$title" --notes "$notes"
    gh release upload "$tag" $assets --clobber
else
    gh release create "$tag" $assets --title "$title" --notes "$notes"
fi
