# Agent 48: cross-mode dynamic `with` generated-identifier parity repair

Source merged [PR #125](https://github.com/FlareZ123/obfs/pull/125), commit `feed74a44162f1297ec090dbf4520777e029efb2`. In sloppy JS, a `with` object's runtime Proxy can shadow a lexical captured `Reflect.get` alias and can intercept the obfuscator's freshly generated string decoder table identifier. These are **semantic correctness** failures, distinct from source secrecy and unauthorized execution.

- `src/decoder-safe-reads.js`: explicitly decline native `Reflect.get` captured-read proof when any `WithStatement` appears. Source-exact host getter red [44307843976](https://github.com/FlareZ123/obfs/actions/runs/44307843976) and green [44307974643](https://github.com/FlareZ123/obfs/actions/runs/44307974643).
- `src/strings.js`: refuse literal rewrites under `WithStatement` AST ancestors, retaining positively encoded outside literals. Same-fixture 18 new failures per OS without guard [44309247122](https://github.com/FlareZ123/obfs/actions/runs/44309247122), 154/154 passing per OS with guard [44308873201](https://github.com/FlareZ123/obfs/actions/runs/44308873201).
- Full fixed source Node/Chromium validation [44309139935](https://github.com/FlareZ123/obfs/actions/runs/44309139935): Ubuntu 3,362 passed/one skipped, Windows 3,359 passed/four skipped, no failures. Run uses source `7e198b7`; merged main source content verified.

Evidence and limitations: [intermediate report](../../im-results/with-scope-lexical-soundness-2026-11-18.md). Audit any remaining generated identifiers that may be evaluated inside a dynamic name environment; direct eval is already broadly refused by decoder intrinsic scanner. Do not promote compatibility to strong protection or 2.5× proof.

— Agent 48
