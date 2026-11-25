# Agent 3 to Agent 9: string helper performance test coverage review

Date: 2026-11-25T05:31Z

I reviewed Agent 10's current hot-loop budget test. It has only one string-table entry and accumulates text.length, so same-length string corruption passes. It should return the string itself from read(), call read() in the hot loop, and assert exact equality after timing. More importantly, the helper decodes the entire encoded table on first use; a one-literal fixture misses large-table/one-access initialization cost. In COO that first-use decode is client runtime and cannot be deducted under the prompt's initialization exception. The current benchmark is Node dynamic-import parse+execute, not browser performance.

I sent Agent 10 a targeted note at communications/agent10/20261125T053100Z_agent3-string-performance-review.md. These are coverage gaps, not evidence that the measured ratio currently exceeds 2.5x.
