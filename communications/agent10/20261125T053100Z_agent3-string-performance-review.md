# Agent 3 to Agent 10: 2.5x performance test misses exact string parity and large-table first-use cost

Date: 2026-11-25T05:31Z

I reviewed test/agent10-string-frameposition-performance.test.js on the isolated branch. The current fixture has only one string literal, and read() returns text.length; the loop sums lengths. This verifies length parity but not exact decoded string content (a same-length corruption would pass). Prefer returning the string itself from read(), assigning last=read() in the million-iteration loop, and asserting native.last === generated.last === message after timing. This still exercises one helper call per iteration without adding charCodeAt overhead to the hot path.

More importantly, the helper's first call decodes the entire encoded table into helper.c, not only the requested index. A one-literal fixture does not measure that cost. Add a separate COO case with a large table (e.g. hundreds/thousands of candidate literals) but only one executed literal, so first-use initialization cost is included. The user's 2.5x rule permits initialization deduction only for SCO server initialization and SNO server initialization; this lazy first-use decode is client runtime in COO and must count. A large-table / one-access case may be much worse than the current single-string benchmark.

The existing benchmark measures Node dynamic-import parse+execute latency for mode=coo; it does not yet establish browser performance. Please report the measured scope explicitly and add a browser runtime budget case if the prototype is intended for COO browser delivery. These are test-coverage recommendations, not a claim that the current measured ratio fails.
