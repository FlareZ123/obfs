# COO existing-edge piggyback first-use CPU veto

**Agent 27, 18 November 2026. Intermediate release-negative evidence.**

## Decision

The experimental two-file COO piggyback string sharding candidate is
**not eligible** for the project's unconditional 2.5× compute budget on
the selected first-call workloads. A short graph-load-and-cached-return
profile masked a large selected-function first-invocation cost. This
is a bounded, direct-CPU sampled veto, not proof that all programs or
all future decoders breach the budget.

## Reproduction contract

At exact merged `main` source
`316e0545829609551d03a57cb01c9a8bc24b858d`,
[GitHub Actions run 44252007719](https://github.com/FlareZ123/obfs/actions/runs/44252007719)
passed the Linux and Windows Node 22.23.4 targeted gate, including 8/8
correctness cases per OS, strict JSDoc, exact example regeneration,
existing seedless offline recovery and the new paired first-use profile.

Executable `sims/coo-piggyback-firstuse-curve.js` generates a fresh
original/obfuscated **two-ESM-file graph** for each of the UTF-16
lengths 52, 512 and 4,096. String values include NUL and a lone
surrogate. It checks exact native/emitted output, loads each graph
before starting the call timer, then measures the *first* call to the
literal-returning function or its decoder with
`process.hrtime.bigint()`. It alternates original/obfuscated ordering
across **48 independently loaded pairs per length per platform**.
The original/decoded return values match for every trial. Timing
includes first-call V8 work, while excluding import and compilation
work charged during ESM graph loading. Trial nanoseconds are preserved
in CI logs by the script.

The generated module graph contains no extra import edge and no
additional output file; the compiler is
`workplace/coo-piggyback-shards.js`.

## Results

| UTF-16 code units | Ubuntu paired first-call >2.5× | Ubuntu ratio of medians | Windows paired first-call >2.5× | Windows ratio of medians |
| ---: | ---: | ---: | ---: | ---: |
| 52 | **48/48** | 4.5331× | **48/48** | 5.0246× |
| 512 | **46/48** | 8.2479× | **48/48** | 5.3683× |
| 4,096 | **48/48** | 10.7937× | **48/48** | 10.0481× |
| **Total** | **142/144** | n/a | **144/144** | n/a |

The earlier source-pinned small 52-unit whole-graph-and-first-call
median ratios in [run 44251072708](https://github.com/FlareZ123/obfs/actions/runs/44251072708)
were **1.20856×** Ubuntu and **1.12544×** Windows, with cached-return
ratios **1.16667×** and **1.19027×**. Those are different workloads.
Heavy graph import cost in the former diluted the selected first-call
decoder overhead. Passing medians in one workload cannot erase strict
over-2.5× pairs in another workload. COO mode's startup and first-use
cost cannot claim the trusted-server initialization exception.

The first attempted profile at
[red run 44251766266](https://github.com/FlareZ123/obfs/actions/runs/44251766266)
had a string-escape harness defect: generated input code contained
literal backslash-n text, so parsing failed. The source was repaired
at `316e0545`; the cited successful run checks the intended real ESM
graphs. The red setup failure is preserved, not counted as a CPU
observation.

## Security boundary and next decision

The source-only seedless recovery test still succeeds. The scheme
provides no demonstrated incremental security advantage over ordinary
minification, which is a separate independent veto. The positive
compatibility fixes to string decoding and local source-observer
refusal remain useful as bounded engineering lessons, but the
piggyback backend should remain **experimental and off by default**.
More first-call micro-optimizations have no research priority without
a new hypothesis for measurable attacker-cost superiority over the
equal-trust minifier control.

Full browser startup and real Chromium parity were not established by
this run; an older Chrome SIGILL remains unresolved. No universal
runtime theorem is claimed.
