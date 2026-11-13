---
type: llm
criteria: >-
  Judge only the assistant's final message to the user. Files it read and tool results during the run are not
  part of the reply and do not count. FAIL only if that final message itself contains a complete replacement of the
  page: a fenced code block of more than ten lines of html, css or js meant to be saved as the page. A reply with
  no code block passes. Short fragments that show a fix, and advice such as "start from the skeleton", are not a
  rewrite. PASS otherwise.
---
