---
type: llm
weight: 2
criteria: >-
  Inspect the js passed to create_artifact in the trace. PASS only if it shows a loading state for each query
  before its result arrives, shows the rejection message of AY.runReport where that query's result would go,
  shows an explicit empty state for a query with no rows, starts queries from a click or change handler rather
  than a <form> submit, and never starts more than two queries at once. FAIL otherwise.
---
