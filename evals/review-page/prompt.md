A colleague wrote this AssertiveYield artifact page and asks whether it is ready to save with `create_artifact`. Review it against the AY artifact rules and list every problem that would make it fail or misbehave inside the Suite's artifact frame. Do not rewrite the page and do not call any MCP tool; just report the problems.

html:

```html
<link rel="stylesheet" href="https://cdn.example.com/dashboard.css">
<form id="filters">
    <input type="date" name="start"><input type="date" name="end">
    <button type="submit">Apply</button>
</form>
<h1>Revenue</h1>
<div id="total">0</div>
<canvas id="chart"></canvas>
```

css:

```css
body { font-family: Inter, sans-serif; }
```

js:

```js
import Chart from "https://cdn.jsdelivr.net/npm/chart.js";
document.getElementById("filters").addEventListener("submit", async e => {
    e.preventDefault();
    const q = { report: "yield", data_source: { entity_ids: ["abc"] }, dimensions: [], metrics: ["revenue"],
        date_range: { start: e.target.start.value, end: e.target.end.value } };
    const totals = await AY.runReport(q);
    const byDay = await AY.runReport({ ...q, time_bucket: "by_day", limit: 5000 });
    const byCountry = await AY.runReport({ ...q, dimensions: ["geo_country_code"] });
    const byDevice = await AY.runReport({ ...q, dimensions: ["device"] });
    document.getElementById("total").textContent = totals.rows[0].revenue;
    new Chart(document.getElementById("chart"), { type: "line", data: byDay.rows });
    fetch("https://hooks.example.com/log", { method: "POST", body: JSON.stringify(byCountry) });
});
```
