#!/usr/bin/env node
// Builds a standalone HTML preview of an artifact page with `AY.runReport` served from saved query results,
// under the same Content Security Policy as the product, so the page can be opened or screenshotted before
// it is saved with create_artifact. No dependencies.
//
//   node preview.mjs <page> [fixtures] [--out preview.html] [--state loading|error|empty] [--delay ms]
//
//   <page>     a directory with page.html, page.css and page.js, or a JSON file with html, css and js fields
//   fixtures   a JSON file or a directory of JSON files, each `{ "match": {...}, "result": {...} }` or an array
//              of them; `result` is the run_report / print_report output (columns, rows, has_more), `match` a
//              subset of run_report parameters the query must contain (arrays compare as sets). A fixture
//              without `match` answers any query that no other fixture matched.
//   --state    force every query into one state instead of answering from the fixtures
//   --delay    milliseconds before each answer (default 400), so the loading state can be seen

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const CONTENT_SECURITY_POLICY =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; frame-src 'none'";

const parseArgs = argv => {
    const options = { out: "preview.html", state: null, delay: 400, positional: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--out") options.out = argv[++i];
        else if (arg === "--state") options.state = argv[++i];
        else if (arg === "--delay") options.delay = Number(argv[++i]);
        else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
        else options.positional.push(arg);
    }
    if (options.positional.length === 0) throw new Error("Missing <page>");
    if (options.state != null && !["loading", "error", "empty"].includes(options.state)) {
        throw new Error("--state must be loading, error or empty");
    }
    return options;
};

const readPage = path => {
    if (statSync(path).isDirectory()) {
        const read = name => {
            const file = join(path, name);
            return existsSync(file) ? readFileSync(file, "utf8") : "";
        };
        return { html: read("page.html"), css: read("page.css"), js: read("page.js") };
    }
    const { html = "", css = "", js = "" } = JSON.parse(readFileSync(path, "utf8"));
    return { html, css, js };
};

const readFixtures = path => {
    if (path == null) return [];
    const files = statSync(path).isDirectory()
        ? readdirSync(path)
              .filter(name => name.endsWith(".json"))
              .sort()
              .map(name => join(path, name))
        : [path];
    return files.flatMap(file => {
        const parsed = JSON.parse(readFileSync(file, "utf8"));
        return Array.isArray(parsed) ? parsed : [parsed];
    });
};

// A closing tag ends the element wherever it appears, even inside a string.
const withoutClosingTag = (source, tag) => source.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");

const MOCK_CLIENT = `(function () {
    var FIXTURES = __FIXTURES__;
    var STATE = __STATE__;
    var DELAY = __DELAY__;
    var MAX_IN_FLIGHT = 2;
    var inFlight = 0;
    var NUMBER_RE = /^-?(0|[1-9]\\d*)(\\.\\d+)?([eE][+-]?\\d+)?$/;

    function normalize(value) {
        if (Array.isArray(value)) return value.map(normalize).sort();
        if (value && typeof value === "object") {
            var out = {};
            Object.keys(value).sort().forEach(function (key) { out[key] = normalize(value[key]); });
            return out;
        }
        return value;
    }
    function same(a, b) { return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b)); }
    function matches(fixture, params) {
        if (fixture.match == null) return false;
        return Object.keys(fixture.match).every(function (key) { return same(fixture.match[key], params[key]); });
    }
    function withNumericMetrics(result) {
        var columns = result.columns || [];
        var metricIds = {};
        columns.forEach(function (c) { if (c.type === "metric") metricIds[c.id] = true; });
        var rows = (result.rows || []).map(function (row) {
            var out = {};
            Object.keys(row).forEach(function (id) {
                var value = row[id];
                out[id] = metricIds[id] && typeof value === "string" && NUMBER_RE.test(value) ? Number(value) : value;
            });
            return out;
        });
        return { columns: columns, rows: rows, has_more: Boolean(result.has_more || result.truncated) };
    }
    function answer(params) {
        if (STATE === "error") throw new Error("Simulated query failure");
        var fixture = FIXTURES.find(function (f) { return matches(f, params); })
            || FIXTURES.find(function (f) { return f.match == null; });
        if (STATE === "empty") {
            return { columns: fixture ? fixture.result.columns || [] : [], rows: [], has_more: false };
        }
        if (fixture == null) throw new Error("No fixture matches this query: " + JSON.stringify(params));
        return withNumericMetrics(fixture.result);
    }
    function later(fn) {
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                inFlight--;
                try { resolve(fn()); } catch (e) { reject(e); }
            }, DELAY);
        });
    }
    window.AY = Object.freeze({
        runReport: function (params) {
            var rest = Object.assign({}, params);
            delete rest.format;
            console.log("AY.runReport", JSON.stringify(rest));
            if (inFlight >= MAX_IN_FLIGHT) {
                return Promise.reject(new Error("Too many queries; wait for the pending ones to finish"));
            }
            inFlight++;
            if (STATE === "loading") return new Promise(function () {});
            return later(function () { return answer(rest); });
        },
    });
})();`;

const buildDocument = ({ html, css, js }, fixtures, options) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">
<style>
${withoutClosingTag(css, "style")}
</style>
<script>${MOCK_CLIENT.replace("__FIXTURES__", () => withoutClosingTag(JSON.stringify(fixtures), "script"))
    .replace("__STATE__", () => JSON.stringify(options.state))
    .replace("__DELAY__", () => String(options.delay))}</script>
</head>
<body>
${html}
<script>
${withoutClosingTag(js, "script")}
</script>
</body>
</html>`;

const main = () => {
    const options = parseArgs(process.argv.slice(2));
    const [pagePath, fixturesPath] = options.positional;
    const page = readPage(pagePath);
    const fixtures = readFixtures(fixturesPath);
    const out = resolve(options.out);
    writeFileSync(out, buildDocument(page, fixtures, options));
    process.stdout.write(
        `${out} (${fixtures.length} fixture${fixtures.length === 1 ? "" : "s"}, state ${options.state ?? "fixtures"})\n` +
            `screenshot: npx playwright screenshot --full-page --wait-for-timeout ${options.delay + 600} file://${out} preview.png\n`
    );
};

main();
