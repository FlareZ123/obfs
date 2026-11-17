# Experimental SCO private-capability local CPU probe (17 November 2026)

**Classification:** intermediate single-runner engineering observation. Not a
2.5× release clearance, a general benchmark, or an established security result.

## Executable boundary

Reproduce with `node sims/sco-private-capability-cost.js` using Node 22+.
The script compares the same SHA-256 loop directly and through
`createScoPrivateHandles.use` inside the isolated server request context.
It uses 1,000 calls at each of 1, 64 and 256 digest rounds, three consecutive
trials per workload, and prints the output checksum after both paths. The
wrapper timer starts **inside** the callback already admitted by the per-
principal isolation queue. It therefore excludes queue admission,
authentication, HTTP and TLS traffic, marshalling, worker startup, and cold
module initialization. Both paths do the same nominal digest work.
`src/sco-capabilities.js` was copied byte-for-byte into the local test
harness; the executable probe is preserved at
`sims/sco-private-capability-cost.js` on this branch.

## Raw local measurements

Local runtime: Node.js v22.16.0, Linux shared container, monotonic
`performance.now()`. Three unrandomized trials per workload, single session.
Each line below records elapsed milliseconds for direct and scoped runs;
the scope is a test-only pre-resolved `alice` principal.

| SHA-256 rounds/call | Trial | Direct ms | Scoped ms | Scoped/direct |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 4.26268 | 4.55904 | 1.06952× |
| 1 | 1 | 2.78891 | 2.54998 | 0.91433× |
| 1 | 2 | 0.93979 | 2.85826 | **3.04140×** |
| 64 | 0 | 129.73279 | 81.66712 | 0.62950× |
| 64 | 1 | 77.09165 | 79.05459 | 1.02546× |
| 64 | 2 | 70.75230 | 70.46184 | 0.99589× |
| 256 | 0 | 309.70841 | 333.99084 | 1.07840× |
| 256 | 1 | 307.93967 | 371.36104 | 1.20595× |
| 256 | 2 | 416.75611 | 320.39922 | 0.76879× |

Checksums: 204000 for all 1-round trials, 480000 for all 64-round
trials, 68000 for all 256-round trials. These are coarse arithmetic
checksums, not an independent differential application correctness check.

## Interpretation and rejection criteria

The short 1-round trial has an observed **3.04140×** pair, exceeding the
project's strict 2.5× budget. An earlier independent run of the same initial
local harness also observed a **3.00256×** 1-round pair (trial 2); no attempt
was made to erase the breach by averaging. Warmup and sequential run order
can cause apparent acceleration or deceleration of either path. This finite
probe cannot distinguish the overhead from JIT or scheduling noise.

For meaningful production evidence, freeze exact source hashes and a
representative original/minified/private-handle application, balance run
order, include complete Node and browser-client sessions, isolate the
server CPU from RPC/network, and test short and sustained workloads with a
matched independent attacker. The client/browser may never execute the
server-private operation itself, so any claimed cross-boundary compute
comparison must specify both locations and the actual original workload.
Preserve every observed strict >2.5× paired slowdown; a median alone does
not establish the budget. Treat the current capability API as experimental.
