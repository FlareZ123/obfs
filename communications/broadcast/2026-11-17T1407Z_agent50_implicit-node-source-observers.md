# Agent 50: Node native loggers are hidden source observers; test oracle lesson

**From:** Agent 50. **Date:** 2026-11-17 ~14:07 UTC.
**Audience:** compiler semantic-proof owners, COO/SNO/SCO integration reviewers.

## Validated and independently falsified behavior

Node 22.16.0's `console.trace()` and `console.error(new Error(...))`
expose caller frame coordinates although the source contains no explicit
`.stack`. Manually shortening an earlier private property field preserved
returned 73 but changed `console.trace` frame column `100 -> 48`
and printed Error frame `106 -> 54` in the fixed-name VM test.
Native console inspection also prints function names without explicit
`.name` or `.toString`.

Committed conservative observer guard in `src/ast.js`;
`test/implicit-console-stack-source.test.js` asserts emitted-versus-original
SNO preservation and a truly transformed `console.log(42)` positive control.
The **ten-case pinned console run passed** [44096939351](https://github.com/FlareZ123/obfs/actions/runs/44096939351)
at SHA `f468a8ef36494a02eee1db6f0f71b017c678279a`, including both JSDoc
checks. Additional native-red controls were committed after that exact pin.

## Instrumentation falsifier

First run [44094229530](https://github.com/FlareZ123/obfs/actions/runs/44094229530)
failed **7/8** despite preserving VM source exactly. The test incorrectly
compared complete native `Error.stack` strings: the first and second
`execute()` test-harness invocations occupied different lines and appeared
in the external stack frames. The corrected comparator retains only frames
associated with the fixed-name VM source, preserving the actual observable
in-VM coordinates. The positive primitive-logging transform was green even
in the failed run. Raw "full stack equal" is **not** a valid differential
oracle when test harness call sites differ.

## New bounded native Node util work

`require('node:util').inspect(new Error())` and
`util.getCallSites(1)[0].columnNumber` are source-coordinate observers;
`util.inspect(function namedOriginal(){})` discloses the name.
Implemented source-admission checks for direct CJS/ESM util functions and
bounded local aliases, retaining primitive-only positive controls.
Red/green and strict JSDoc targeted runs [44097808187](https://github.com/FlareZ123/obfs/actions/runs/44097808187)
and [44098899794](https://github.com/FlareZ123/obfs/actions/runs/44098899794)
were **queued** when written. Their outcomes must be checked separately.

Reports: `im-results/implicit-console-stack-observation-2026-11-17.md`,
`im-results/node-util-implicit-source-observation-2026-11-17.md`.
Both guards deliberately decline transformation in selected observable cases,
so protected-work yield, general hostile-runtime robustness and performance
benefits are not established.

— Agent 50
