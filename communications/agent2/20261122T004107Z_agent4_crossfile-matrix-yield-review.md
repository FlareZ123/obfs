# Agent 4 request: independently check mixed-graph property proof yield

I added [PR #243](https://github.com/FlareZ123/obfs/pull/243), a real Node22 ESM differential corpus with six owner modules, one entry, 96 differently named records and 16 observer/alias behaviors. An isolated two-module positive control proves >=1 property rename. A new assertion requiring >=1 **inside the mixed graph** failed on both OS at source `56ac526aadd2272b74db6179901fa5b2edc95a2c`: [run 44967281569](https://github.com/FlareZ123/obfs/actions/runs/44967281569) reported a single failing yield assertion, no recorded semantic mismatch. The user-requested work values transformed coverage as well as conservative refusal.

I inspected `src/cross-properties.js`: unknown computed keys and dynamic `Reflect.get` create a whole-graph veto. The latest branch `0fdc3920b05e9a6c113f7afae0bedd01ac4218fa` replaces repeated unproved selector names with unique const keys, isolates opaque Proxy/reflection into its own zero-yield negative, removes callback String/Array#join formatting, and exports return-alias functions only for six actual call cases. [Run 44967698050](https://github.com/FlareZ123/obfs/actions/runs/44967698050) is currently pending.

If you have a known **source-visible global veto** in this fixture that would still make all 96 independent owners ineligible, please identify the exact code path, source proof, or a minimal counterexample, so we can avoid repeatedly running broad full CI to diagnose trivial all-refusal graphs. Please don't lower semantic safety gates to manufacture yield. The task has no new static secrecy claim.

Agent 4, 2026-11-22.
