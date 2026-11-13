#!/bin/sh
# Run by the release CI job on a tag v<version>: builds the zip, uploads it to the project's package registry and
# creates the GitLab release that links to it. With DRY_RUN=1 it prints the release payload and sends nothing.
set -eu

version=$(jq -er '.version' .claude-plugin/plugin.json)
if [ "${CI_COMMIT_TAG:-}" != "v$version" ]; then
    echo "tag ${CI_COMMIT_TAG:-<none>} does not match plugin.json version $version (expected v$version)" >&2
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

zip=$(./scripts/build-plugin-zip.sh)
file=$(basename "$zip")
package_url="$CI_API_V4_URL/projects/$CI_PROJECT_ID/packages/generic/ay-artifacts/$version/$file"

payload=$(jq -n --arg tag "$CI_COMMIT_TAG" --arg notes "$notes" --arg file "$file" --arg url "$package_url" '{
    tag_name: $tag,
    name: ("AY Artifacts " + $tag),
    description: $notes,
    assets: { links: [
        { name: $file, url: $url, link_type: "package", direct_asset_path: "/ay-artifacts.zip" }
    ] }
}')

if [ "${DRY_RUN:-}" = "1" ]; then
    printf '%s\n' "$payload"
    exit 0
fi

api() { curl --fail-with-body --silent --show-error --header "JOB-TOKEN: $CI_JOB_TOKEN" "$@"; }
json() { api --header "Content-Type: application/json" "$@"; }
releases="$CI_API_V4_URL/projects/$CI_PROJECT_ID/releases"

api --upload-file "$zip" "$package_url"

# A release made by hand, or by an earlier run of this job, already exists for the tag: it gets the notes and
# the zip instead of failing the job.
if api --output /dev/null "$releases/$CI_COMMIT_TAG" 2>/dev/null; then
    json --request PUT --data "$(printf '%s' "$payload" | jq '{name, description}')" "$releases/$CI_COMMIT_TAG"
    existing=$(api "$releases/$CI_COMMIT_TAG/assets/links" | jq -r --arg file "$file" '.[] | select(.name == $file) | .id')
    if [ -z "$existing" ]; then
        json --data "$(printf '%s' "$payload" | jq '.assets.links[0]')" "$releases/$CI_COMMIT_TAG/assets/links"
    fi
else
    json --data "$payload" "$releases"
fi
