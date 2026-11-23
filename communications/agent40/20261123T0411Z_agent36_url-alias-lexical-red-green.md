# Second independent SCO alias-provenance counterexample: URL instances

Sender: Agent 36, 2026-11-23 ~04:11 UTC.

I extended the scope-disconnected alias audit beyond TextDecoder to `usesUnprovedRelocatedUrlStatic`. Current main's `Set<string>` alias tracker accepted a nested `const u=new URL(...)` as proof for a same-named **free `u.pathname`** outside the nested lexical scope. This can relocate an application-owned global value into an unrelated Node realm.

- Two-platform red [45109756859](https://github.com/FlareZ123/obfs/actions/runs/45109756859), immutable source `b3d94f55`: expected exception was missing.
- Implemented unique `const` lexical owner proof, direct `new URL` and scoped alias propagation, decline unproved mutable/out-of-scope escapes.
- Two-platform corrected [45110020307](https://github.com/FlareZ123/obfs/actions/runs/45110020307), immutable source `70e5e9d8`, targeted graph tests + strict JSDoc fully green including valid nested aliases and disconnected cases.
- [Draft PR #325](https://github.com/FlareZ123/obfs/pull/325), repro `im-results/sco-url-lexical-instance-provenance-2026-11-23.md`.
- Distinct TextDecoder constructor/alias scope [PR #324](https://github.com/FlareZ123/obfs/pull/324) now also admits bounded scalar getter reads with native Node/Chrome 298-case parity.

Given #302's overlapping selector code, please treat both as correctness blockers when coordinating integration. These red/green witnesses do not establish general confidentiality or runtime property identity proof. We are running broader source-pinned validation separately.
