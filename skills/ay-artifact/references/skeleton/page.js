// Every id below must come from the discovery tools and have been tested with run_report.
const CONFIG = {
    report: "yield",
    data_source: { entity_ids: ["ENTITY_ID"] },
    entityLabel: "Example entity",
    timezone: "UTC",
    mainMetric: "revenue",
    tiles: ["revenue", "impressions", "rpm"],
    breakdownDimension: "geo_country_code",
    breakdownRows: 20,
    // money | int | pct | number
    formats: { revenue: "money", impressions: "int", rpm: "money" },
};

// ---- Query runner: stays inside the frame's budget (2 in flight) and drops stale responses ----

const MAX_IN_FLIGHT = 2;
const queue = [];
let inFlight = 0;

function runQuery(params) {
    return new Promise((resolve, reject) => {
        queue.push({ params, resolve, reject });
        pump();
    });
}

function pump() {
    while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
        const job = queue.shift();
        inFlight++;
        AY.runReport(job.params)
            .then(job.resolve, job.reject)
            .then(() => {
                inFlight--;
                pump();
            });
    }
}

// A load that started before the latest Apply must not paint over the newer one.
let generation = 0;

function loadAll() {
    const range = readRange();
    const problem = rangeProblem(range);
    setNotice(problem);
    if (problem != null) return;
    const gen = ++generation;
    setSubtitle(range);
    for (const panel of PANELS) {
        const body = document.querySelector(`${panel.selector} [data-body]`);
        setState(body, "Loading…");
        runQuery(panel.query(range)).then(
            result => {
                if (gen !== generation) return;
                if (result.rows.length === 0) setState(body, "No data for this range.");
                else panel.render(body, result);
            },
            error => {
                if (gen !== generation) return;
                setState(body, error instanceof Error ? error.message : String(error), true);
            }
        );
    }
}

// ---- Panels: each builds its own query and renders its own result ----

const base = range => ({
    report: CONFIG.report,
    data_source: CONFIG.data_source,
    date_range: { start: range.start, end: range.end, timezone: CONFIG.timezone },
});

const PANELS = [
    {
        selector: "#totals",
        query: range => ({ ...base(range), dimensions: [], metrics: CONFIG.tiles, limit: 1 }),
        render: renderTiles,
    },
    {
        selector: "#trend",
        query: range => ({
            ...base(range),
            dimensions: [],
            metrics: [CONFIG.mainMetric],
            time_bucket: bucketFor(range),
            order_by: { field_id: "time", direction: "asc" },
            limit: 1000,
        }),
        render: renderTrend,
    },
    {
        selector: "#breakdown",
        query: range => ({
            ...base(range),
            dimensions: [CONFIG.breakdownDimension],
            metrics: CONFIG.tiles,
            order_by: { field_id: CONFIG.mainMetric, direction: "desc" },
            limit: CONFIG.breakdownRows,
        }),
        render: renderTable,
    },
];

function renderTiles(body, { columns, rows }) {
    const row = rows[0];
    body.innerHTML = `<div class="tiles">${columns
        .filter(c => c.type === "metric")
        .map(
            c =>
                `<div class="tile"><div class="label">${escapeHtml(c.label)}</div><div class="value">${format(c.id, row[c.id])}</div></div>`
        )
        .join("")}</div>`;
}

function renderTrend(body, { rows }) {
    body.innerHTML = lineChart(rows, "time", CONFIG.mainMetric);
}

function renderTable(body, { columns, rows }) {
    const max = Math.max(...rows.map(r => Number(r[CONFIG.mainMetric]) || 0), 0);
    const head = columns
        .map(c => `<th class="${c.type === "metric" ? "num" : ""}">${escapeHtml(c.label)}</th>`)
        .join("");
    const lines = rows
        .map(r => {
            const cells = columns
                .map(c =>
                    c.type === "metric"
                        ? `<td class="num">${format(c.id, r[c.id])}</td>`
                        : `<td>${escapeHtml(r[c.id] == null ? "—" : String(r[c.id]))}</td>`
                )
                .join("");
            const width = max > 0 ? ((Number(r[CONFIG.mainMetric]) || 0) / max) * 100 : 0;
            return `<tr>${cells}<td class="bar-cell"><div class="bar" style="width:${width.toFixed(1)}%"></div></td></tr>`;
        })
        .join("");
    body.innerHTML = `<table><thead><tr>${head}<th></th></tr></thead><tbody>${lines}</tbody></table>`;
}

// ---- Controls ----

function readRange() {
    return { start: document.getElementById("start").value, end: document.getElementById("end").value };
}

// get_instructions wants a range over one month that starts 3 or more months back split into one query per
// calendar month, with ratio metrics recomputed from their counts. This page sends one query per panel, so
// it refuses such a range instead.
function rangeProblem({ start, end }) {
    if (!start || !end || start > end) return "Pick a start date on or before the end date.";
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
    if (daysBetween({ start, end }) > 31 && start <= isoDate(cutoff)) {
        return "A range longer than 31 days must start within the last 3 months.";
    }
    return null;
}

function setNotice(message) {
    const notice = document.getElementById("notice");
    notice.textContent = message ?? "";
    notice.hidden = message == null;
}

function setSubtitle({ start, end }) {
    document.getElementById("subtitle").textContent = `${CONFIG.entityLabel} · ${start} to ${end}`;
}

function daysBetween({ start, end }) {
    return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}

// get_instructions states how many days each bucket may span; keep these thresholds within them.
function bucketFor(range) {
    const days = daysBetween(range);
    if (days <= 31) return "by_day";
    if (days <= 180) return "by_week";
    return "by_month";
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function initControls() {
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    document.getElementById("start").value = isoDate(start);
    document.getElementById("end").value = isoDate(end);
    // Never a <form>: the sandbox blocks submission. A click handler starts the queries.
    document.getElementById("apply").addEventListener("click", loadAll);
}

// ---- Helpers ----

function setState(body, message, isError = false) {
    body.innerHTML = `<p class="state${isError ? " error" : ""}">${escapeHtml(message)}</p>`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
}

const intFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const moneyFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFormat = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 });

function format(metricId, value) {
    if (value == null || value === "") return "—";
    const n = Number(value);
    if (Number.isNaN(n)) return escapeHtml(String(value));
    switch (CONFIG.formats[metricId]) {
        case "money":
            return moneyFormat.format(n);
        case "pct":
            return pctFormat.format(n);
        case "int":
            return intFormat.format(n);
        default:
            return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
    }
}

// Inline SVG, since the frame cannot load a chart library.
function lineChart(rows, xKey, yKey) {
    const width = 800;
    const height = 220;
    const pad = { top: 12, right: 12, bottom: 24, left: 56 };
    const values = rows.map(r => Number(r[yKey]) || 0);
    const max = Math.max(...values, 0) || 1;
    const stepX = rows.length > 1 ? (width - pad.left - pad.right) / (rows.length - 1) : 0;
    const x = i => pad.left + i * stepX;
    const y = v => height - pad.bottom - (v / max) * (height - pad.top - pad.bottom);
    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const line = `M${points.join(" L")}`;
    const area = `${line} L${x(values.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
    const first = String(rows[0][xKey]);
    const last = String(rows[rows.length - 1][xKey]);
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(yKey)} over time">
        <line class="axis" x1="${pad.left}" y1="${y(0)}" x2="${width - pad.right}" y2="${y(0)}"></line>
        <path class="area" d="${area}"></path>
        <path class="line" d="${line}"></path>
        <text x="${pad.left - 6}" y="${y(max) + 4}" text-anchor="end">${format(yKey, max)}</text>
        <text x="${pad.left - 6}" y="${y(0) + 4}" text-anchor="end">${format(yKey, 0)}</text>
        <text x="${pad.left}" y="${height - 6}">${escapeHtml(first)}</text>
        <text x="${width - pad.right}" y="${height - 6}" text-anchor="end">${escapeHtml(last)}</text>
    </svg>`;
}

initControls();
loadAll();
