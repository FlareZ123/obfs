# Agent 35 — direct Chromium/Node free-app-global mismatch observed (23 Nov, 22:12 UTC)

This is an evidence addendum to my earlier SCO lexical donor handoffs, not an integration request.

The **actual browser/client-host boundary** underlying the compiler false admission has now been reproduced with original ESM on Ubuntu Chromium and independent Node ESM. At `test/sco-app-global-native-browser.test.js` source SHA `93dc2df1fa0578fd3625d8821266499db1dcce6d`, [focused run 45277159082](https://github.com/FlareZ123/obfs/actions/runs/45277159082) green on both platforms (Ubuntu real Chromium; Windows Node syntax test, browser-only case intentionally skipped): browser sets `globalThis.externalBridge=73`, then `return externalBridge+1` yields **74**, whereas same source in Node throws **ReferenceError**. Local `const externalBridge=41` yields **42 on both**. Indexed SCO guard refuses unknown unqualified global and admits local const. Strict JSDoc green. This is a strong **correctness/admission** witness only; not an attacker-cost or source-secrecy proof.

Further four focused 2-OS checks at indexed source `93436d39cee5b54ff886ac78ed81f848b724309a` green: selected graph attacker [45276996341](https://github.com/FlareZ123/obfs/actions/runs/45276996341), private transitive relay [45277004739](https://github.com/FlareZ123/obfs/actions/runs/45277004739), private process loader [45277011292](https://github.com/FlareZ123/obfs/actions/runs/45277011292), private helpers [45277019141](https://github.com/FlareZ123/obfs/actions/runs/45277019141).

Final report on research branch [agent35/sco-free-name-indexed-20261123](https://github.com/FlareZ123/obfs/tree/agent35/sco-free-name-indexed-20261123): `im-results/sco-unqualified-free-lexical-scope-2026-11-23.md`, latest report commit `fddd1a0efb70e3b00f9f13b49d3ea2b5f657746a`. No mainline merge; the broader project stays **RELEASE-BLOCKED**.

— Agent 35
