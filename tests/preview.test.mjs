// Run from the repo root: node --test tests/*.test.mjs
// Builds previews with the skill's harness and runs the mock AY client it embeds in a Node vm.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SKILL = fileURLToPath(new URL("../skills/ay-artifact/", import.meta.url));
const PREVIEW = join(SKILL, "scripts/preview.mjs");
const SKELETON = join(SKILL, "references/skeleton");
const FIXTURES = join(SKILL, "references/fixtures");
const dir = mkdtempSync(join(tmpdir(), "ay-artifacts-preview-"));
let builds = 0;

const build = (page, fixtures, ...flags) => {
    const out = join(dir, `preview-${++builds}.html`);
    const args = [PREVIEW, page, ...(fixtures ? [fixtures] : []), "--out", out, "--delay", "0", ...flags];
    execFileSync(process.execPath, args, { stdio: "pipe" });
    return readFileSync(out, "utf8");
};

// The first script of the preview is the mock client; it defines window.AY.
const client = html => {
    const [, script] = /<script>([\s\S]*?)<\/script>/.exec(html);
    const ctx = { console: { log() {} }, setTimeout };
    ctx.window = ctx;
    vm.runInNewContext(script, ctx);
    return ctx.AY;
};

const QUERY = {
    report: "yield",
    data_source: { entity_ids: ["ENTITY_ID"] },
    date_range: { start: "2026-11-01", end: "2026-11-07" },
    dimensions: [],
    metrics: ["revenue", "impressions", "rpm"],
    limit: 1,
};
// vm objects come from another realm, so compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));
const settled = promise => Promise.race([promise.then(() => "settled"), new Promise(r => setTimeout(() => r("pending"), 30))]);

test("renders the page under the product's Content Security Policy", () => {
    const html = build(SKELETON, FIXTURES);
    assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'/);
    assert.ok(html.includes(readFileSync(join(SKELETON, "page.html"), "utf8")));
    assert.ok(html.includes(readFileSync(join(SKELETON, "page.css"), "utf8")));
    assert.ok(html.includes(readFileSync(join(SKELETON, "page.js"), "utf8")));
});

test("answers from the fixture whose match is a subset of the query, with numeric metrics", async () => {
    const AY = client(build(SKELETON, FIXTURES));
    const totals = await AY.runReport({ ...QUERY, format: "json" });
    assert.deepEqual(plain(totals), {
        columns: [
            { id: "revenue", label: "Revenue", type: "metric" },
            { id: "impressions", label: "Impressions", type: "metric" },
            { id: "rpm", label: "RPM", type: "metric" },
        ],
        rows: [{ revenue: 12345.678, impressions: 4567890, rpm: 2.7 }],
        has_more: false,
    });
    const trend = await AY.runReport({ ...QUERY, metrics: ["revenue"], time_bucket: "by_day", limit: 1000 });
    assert.equal(trend.rows.length, 7);
    assert.equal(trend.rows[0].time, "2026-11-01");
});

test("compares arrays as sets and keeps null dimension values", async () => {
    const AY = client(build(SKELETON, FIXTURES));
    const totals = await AY.runReport({ ...QUERY, metrics: ["rpm", "impressions", "revenue"] });
    assert.equal(totals.rows[0].revenue, 12345.678);
    const breakdown = await AY.runReport({ ...QUERY, dimensions: ["geo_country_code"], limit: 20 });
    assert.equal(breakdown.has_more, true);
    assert.deepEqual(plain(breakdown.rows[2]), { geo_country_code: null, revenue: 1345.678, impressions: 1067890, rpm: 1.26 });
});

test("rejects a query no fixture matches, naming its parameters", async () => {
    const AY = client(build(SKELETON, FIXTURES));
    await assert.rejects(AY.runReport({ ...QUERY, dimensions: ["device"] }), /^Error: No fixture matches this query: .*"device"/);
});

test("allows two queries in flight and rejects the third", async () => {
    const AY = client(build(SKELETON, FIXTURES));
    const first = AY.runReport(QUERY);
    const second = AY.runReport({ ...QUERY, dimensions: ["geo_country_code"] });
    await assert.rejects(AY.runReport(QUERY), /Too many queries/);
    await Promise.all([first, second]);
    assert.equal((await AY.runReport(QUERY)).rows.length, 1);
});

test("--state forces loading, error or empty", async () => {
    assert.equal(await settled(client(build(SKELETON, FIXTURES, "--state", "loading")).runReport(QUERY)), "pending");
    await assert.rejects(client(build(SKELETON, FIXTURES, "--state", "error")).runReport(QUERY), /Simulated query failure/);
    const empty = await client(build(SKELETON, FIXTURES, "--state", "empty")).runReport(QUERY);
    assert.deepEqual(plain(empty), { columns: [{ id: "revenue", label: "Revenue", type: "metric" }, { id: "impressions", label: "Impressions", type: "metric" }, { id: "rpm", label: "RPM", type: "metric" }], rows: [], has_more: false });
    assert.throws(() => build(SKELETON, FIXTURES, "--state", "broken"), /--state must be loading, error or empty/);
});

test("reads a JSON page and a fixtures file, escapes closing tags, and falls back to a fixture without match", async () => {
    const page = join(dir, "page.json");
    writeFileSync(page, JSON.stringify({ html: "<div id=\"x\"></div>", css: "b { color: red }", js: "const s = \"</script>\";" }));
    const fixtures = join(dir, "fixtures.json");
    writeFileSync(fixtures, JSON.stringify([
        { match: { dimensions: ["device"] }, result: { columns: [], rows: [], truncated: true } },
        { result: { columns: [{ id: "revenue", type: "metric" }], rows: [{ revenue: "1", note: "2" }] } },
    ]));
    const html = build(page, fixtures);
    assert.ok(html.includes("<div id=\"x\"></div>") && html.includes("b { color: red }"));
    assert.ok(html.includes("const s = \"<\\/script>\";"));
    assert.equal(html.split("</script>").length, 3, "only the two real closing tags remain");
    const AY = client(html);
    assert.deepEqual(plain(await AY.runReport(QUERY)), { columns: [{ id: "revenue", type: "metric" }], rows: [{ revenue: 1, note: "2" }], has_more: false });
    assert.equal((await AY.runReport({ ...QUERY, dimensions: ["device"] })).has_more, true);
});

test("refuses a missing page and an unknown option", () => {
    assert.throws(() => execFileSync(process.execPath, [PREVIEW], { stdio: "pipe" }), /Missing <page>/);
    assert.throws(() => build(SKELETON, FIXTURES, "--nope"), /Unknown option --nope/);
});

test("inserts fixture text holding replacement patterns literally", async () => {
    const fixtures = join(dir, "dollars.json");
    writeFileSync(fixtures, JSON.stringify([{ result: { columns: [], rows: [{ note: "$& $$ $' $`" }] } }]));
    assert.equal((await client(build(SKELETON, fixtures)).runReport(QUERY)).rows[0].note, "$& $$ $' $`");
});

// ---- The skeleton page, run against the mock client with a stub DOM ----

const tick = () => new Promise(r => setTimeout(r, 50));
const isoDaysAgo = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const loadSkeleton = (fixtures, ...flags) => {
    const [mock, page] = [...build(SKELETON, fixtures, ...flags).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const elements = {};
    const element = key => (elements[key] ??= { value: "", textContent: "", innerHTML: "", hidden: true, addEventListener(_, fn) { this.click = fn; } });
    const document = { getElementById: element, querySelector: selector => element(selector.split(" ")[0].slice(1)) };
    const ctx = { console: { log() {} }, setTimeout, document };
    ctx.window = ctx;
    vm.runInNewContext(mock, ctx);
    vm.runInNewContext(page, ctx);
    return {
        body: id => element(id).innerHTML,
        notice: element("notice"),
        subtitle: element("subtitle"),
        apply: (start, end) => {
            element("start").value = start;
            element("end").value = end;
            element("apply").click();
        },
    };
};

test("skeleton renders every panel from the fixtures within the query budget", async () => {
    const page = loadSkeleton(FIXTURES);
    assert.match(page.body("totals"), /Loading…/);
    await tick();
    assert.match(page.body("totals"), /<div class="value">12,345\.68<\/div>/);
    assert.match(page.body("totals"), /<div class="value">4,567,890<\/div>/);
    assert.match(page.body("trend"), /<svg class="chart"/);
    assert.match(page.body("breakdown"), /<td>—<\/td>/);
    assert.match(page.subtitle.textContent, /^Example entity · \d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d$/);
    assert.equal(page.notice.hidden, true);
});

test("skeleton shows the error and empty states per panel", async () => {
    const failed = loadSkeleton(FIXTURES, "--state", "error");
    const empty = loadSkeleton(FIXTURES, "--state", "empty");
    await tick();
    for (const id of ["totals", "trend", "breakdown"]) {
        assert.equal(failed.body(id), '<p class="state error">Simulated query failure</p>');
        assert.equal(empty.body(id), '<p class="state">No data for this range.</p>');
    }
});

test("skeleton escapes values from the data", async () => {
    const fixtures = join(dir, "markup.json");
    const columns = [{ id: "geo_country_code", label: "<i>Country</i>", type: "dimension" }, { id: "revenue", label: "Revenue", type: "metric" }];
    writeFileSync(fixtures, JSON.stringify([{ result: { columns, rows: [{ geo_country_code: "<b>US</b>", revenue: 1 }] } }]));
    const page = loadSkeleton(fixtures);
    await tick();
    assert.match(page.body("breakdown"), /<th class="">&#60;i&#62;Country&#60;\/i&#62;<\/th>/);
    assert.match(page.body("breakdown"), /<td>&#60;b&#62;US&#60;\/b&#62;<\/td>/);
});

test("skeleton refuses an invalid range without dropping the load in flight", async () => {
    const page = loadSkeleton(FIXTURES);
    page.apply("2026-11-07", "2026-11-01");
    assert.equal(page.notice.hidden, false);
    assert.equal(page.notice.textContent, "Pick a start date on or before the end date.");
    await tick();
    assert.match(page.body("totals"), /12,345\.68/);
    assert.match(page.body("breakdown"), /<table>/);

    page.apply(isoDaysAgo(200), isoDaysAgo(1));
    assert.equal(page.notice.textContent, "A range longer than 31 days must start within the last 3 months.");

    page.apply(isoDaysAgo(200), isoDaysAgo(180));
    assert.equal(page.notice.hidden, true);
    assert.match(page.body("totals"), /Loading…/);
    await tick();
    assert.match(page.body("totals"), /12,345\.68/);
});

test("the skill description has no angle-bracket tags, which Claude's plugin upload refuses", () => {
    const description = readFileSync(join(SKILL, "SKILL.md"), "utf8").match(/^description:.*$/m)[0];
    assert.doesNotMatch(description, /<[^>]+>/);
});
