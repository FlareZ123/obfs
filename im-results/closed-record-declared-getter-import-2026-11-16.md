# Declared getter and dynamic ESM import: negative refusal and positive own-field yield (16 November 2026)

**Status:** bounded compatibility confirmation, rather than a new compiler security feature. This study first tested a potential proof escape and found that the current conservative graph analysis **already refuses it**. The unmodified static positive control demonstrates retained transformation coverage.

## Exact source and executable witness

- [Full manual application gate 43856079701](https://github.com/FlareZ123/obfs/actions/runs/43856079701) passed on Ubuntu, Windows and legacy Node 22.0 at immutable source `9930e34c321b7831f55cac9917308db0bf819eeb`. The 51 scoped property/host tests in each modern Node 22 OS lane passed; independent frozen application differential, attack/cost, strict JSDoc and real Chromium steps also passed.
- The actual test is [`test/closed-record-declared-getter-import.test.js`](../test/closed-record-declared-getter-import.test.js). It writes four ESM modules into a temporary directory using the repository's atomic writer and launches a real Node process for the original and compiler-emitted graphs.
- An exported owner from `state.mjs` contains `{secretField:41}`; an unrelated verified private-record reader in `record.mjs` contains `schema[key]`. `setup.mjs` declares `Object.defineProperty(globalThis,'TRIGGER',{get(){globalThis.OBSERVED=import('./state.mjs').then(ns=>Object.keys(ns.state));return 1;}})`. The static entry imports the setup module, owner and reader; it reads `globalThis.TRIGGER` and awaits the promise.
- Native output for the declared getter is exactly `[41,"audit-v1",["secretField"],1]`. The current obfuscator emits the same result and reports **zero** cross-file owner property renames. This is the correct refusal for a runtime import able to inspect an exported object's original key.
- The independent positive replaces the getter with an inert value descriptor and a constant `Promise.resolve(['unrelated'])`. The original and transformed output is `[41,"audit-v1",["unrelated"],1]`, and the compiler reports **one** renamed cross-file owner property. This is a *different input program* from the dynamic-import negative. It must not be represented as protecting the getter original.

## Proof interpretation

The script-level declared runtime import is visible as an `ImportExpression` in the supplied source graph. Existing property-proof machinery already declines the corresponding exported owner transformation. Consequently there is no red counterexample, no compiler patch and no new host-environment theorem. A different model in which external code installs an opaque getter remains a separate malicious-host/external-contract attack, as documented by the preceding [host callback proof study](closed-record-reflect-apply-host-2026-11-16.md).

This evidence supports a limited decision: preserve existing conservative runtime-import recognition and keep a separate, nonvacuous positive owner-yield fixture. It cannot establish semantic preservation under arbitrary loaders or proxies; even a green test suite does not prove hostile-runtime confidentiality, general tamper resistance or the 2.5× whole-session requirement.
