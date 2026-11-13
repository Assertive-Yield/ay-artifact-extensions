---
type: llm
weight: 3
criteria: >-
  PASS only if the reply identifies all of the following problems: (1) the <form> submit never fires in the
  sandbox, so queries must start from a click/change handler; (2) the external stylesheet, the chart.js import and
  the fetch to hooks.example.com are blocked by the Content Security Policy (no network access, no libraries); (3)
  the total shows "0" before data arrives instead of a loading state, and there is no error or empty state;
  (4) limit 5000 exceeds the maximum of 1000 for AY.runReport. FAIL if any of these four is missing.
---
