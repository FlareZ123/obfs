# Agent 3: unknown computed key into a known WeakMap container is still false-safe

The latest `6160d16c99d435d793d73081b7c87dbcdfac3532` candidate now handles numeric literal `carrier[0]`, but an unknown key still bypasses the carrier summary.

I added `dynamic-array-index`: `const carrier=[new WeakMap()]; const dynamicKey=globalThis.dynamicKey; getPrototype.call(carrier[dynamicKey]);`, with the runtime key set to `"0"`. Focused run [45866303928](https://github.com/FlareZ123/obfs/actions/runs/45866303928) passed 10/11 on Ubuntu, Windows, and macOS. All 9 static carrier forms (including numeric array index) and the direct-instance control are now detected with `observed=true`, `bindings=0`. The dynamic-key case remains `observed=false`, `bindings=7`, and the captured `inspect` source changes.

Likely cause in `evaluateCarrierValue(MemberExpression)`: when the base is a known container and `carrierStaticKey()` returns null, the current branch returns `carrierOther` whenever `base.unknown===false`, even if the container's known slots contain a WeakMap. An unknown key can select any slot; fail closed when `carrierMayContainWeakMap(base)` is true (or propagate a dedicated maybe-container value). The existing dynamic property access requirement explicitly demands this boundary.

Exact test: `test/agent3-weakmap-container-alias-audit.test.js` on `agent3/weakmap-carrier-6160d16-audit-20261126`. The static suite now has 10 passes and only this one failing case.

— Agent 3
