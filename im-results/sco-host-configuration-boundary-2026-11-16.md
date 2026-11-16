# SCO private-code timezone/locale migration: counterexample and bounded guard

**Author:** Agent 7, 2026-11-16. **Status:** intermediate compiler-correctness evidence. This is neither an established security result nor proof of observational equivalence or hostile-runtime protection.

## Failure model

The SCO selective partition moves private asynchronous code from the original runtime into an authenticated RPC server. Its existing realm guards focus on shared intrinsic prototypes, native static mutations and browser globals. The original client and replacement server may have different local timezone and default locale. A program can expose these settings through ordinary JSON-returning JavaScript without touching a prototype or browser global.

In a Node 22 reproduction, the same expression evaluated under two documented TZ settings gives:

| Expression | Etc/UTC | Pacific/Honolulu |
| --- | --- | --- |
| new Date(2020,0,1).toISOString() | 2020-01-01T00:00:00.000Z | 2020-01-01T10:00:00.000Z |
| new Date(0).getHours() | 0 | 14 |
| Intl.DateTimeFormat('en-US').resolvedOptions().timeZone | UTC | Pacific/Honolulu |
| new Date(0).getUTCFullYear() | 1970 | 1970 |

The first three produce different observable values even with a fixed input and no adversarial mutation. Moving execution to a differently configured server therefore can change behavior. Node documents changing TZ at runtime on Windows from v16.2.0 and POSIX from v13.0.0. MDN documents local interpretation of Date timestamps and Intl formatters' default timezone. This is an environmental semantic mismatch independent of obfuscation quality or transport latency.

Sources: [Node Command-line API TZ](https://nodejs.org/api/cli.html#tz), [MDN Date/time zones](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_components_and_time_zones), [MDN Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat).

## Branch experiment

Branch: agent7/sco-realm-timezone-boundary-20261116.

- Test file: test/sco-realm-timezone-boundary.test.js. Independent host configuration witness, refusal assertions against selected-private implementations, UTC-only positive controls, and an explicitly retained-client local-time positive control.
- Compiler: src/sco-selective-partition.js. Extends realmStateObservation with an optional relocated-private-only configuration check. Refuses unpinned Date construction/calls, Date.now/parse, known local-time instance methods on directly constructed or simply aliased Date instances, and known Intl formatter constructors including captured aliases. Permits numeric timestamp/UTC construction with verified UTC-only operations.
- Applies the same private-code check to explicitly supplied private-module dependencies, avoiding an obvious transitive omission.

The selective SCO architecture already contracts down to JSON-compatible input/output and explicit side effects. This guard does not prove all source behavior. Unrecognized functions, reflective Date method aliases, parameter passing, imported host libraries, mutable global bindings, nondefault ICU data, performance clocks, and timer/event-loop semantics remain open. Pinned Intl timezone operations are conservatively refused even if a particular deployment could prove equivalent settings. Retained public client-side Date and Intl operations remain allowed.

## Validation discipline

Require two-platform Node 22 native/generated differential tests and strict JSDoc before calling the change production-safe. Run the full manual gate on the exact final branch SHA. Raw admission counts are compatibility metrics; they do not measure resistance to static or runtime attacks. Compiler-time checks do not count toward the delivered runtime 2.5x ratio, but SCO RPC transport does and must be benchmarked on the protected application.

Next: test Date values forwarded through private helpers and more complex aliases; add a generated-RPC differential test with different host zones; measure safe-control admission after the guard. The broader solution requires interprocedural effects/provenance and an explicit destination-server locale and timezone contract.
