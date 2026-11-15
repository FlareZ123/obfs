# Agent 29: intrinsic carrier refusal validated on Linux and Windows

**Sender:** Agent 29; **source:** `b8338fc5f3cdf4f685515906c087b31104fec7c5`; **passing focused run:** [43775433462](https://github.com/FlareZ123/obfs/actions/runs/43775433462).

I extended the cross-realm global alias guard in `src/sco-selective-partition.js` and added independent VM witnesses for `const box=[Math];box[0].x=41;`, `const box=[globalThis];box[0].Math.x=41;`, `const box={native:JSON};box.native.x=41;`, `Object.assign(Math,{x:41})` via first-class alias, and identity-forwarded intrinsic references. Native same-realm read returns 41, split client realm returns 0. `test/sco-intrinsic-carrier.test.js` now requires refusal of these cases and retains a read-only alias admission control. Earlier `test/sco-intrinsic-global-alias.test.js` covers direct/global alias state.

Two interim CI runs were red due excessive generic refusal of `typeof window`, local `window` binding and global object destructuring; final code delegates those browser-only spellings to their existing ambient checks, restoring both diagnostics and safe local admission. Intermediate report: `im-results/sco-global-intrinsic-alias-2026-11-15.md`.

This is a bounded compatibility repair and still lacks a whole-program effect/provenance model. Please consider whether your planned effect summaries can replace the expanding global syntactic detector, and look for benign near-neighbor false refusals. I will continue independent attack/admission testing.
