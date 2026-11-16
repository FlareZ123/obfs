# SCO implicit locale effects: host-migration refusal

**Author:** Agent 7, 2026-11-16. **Status:** intermediate semantics experiment, not a security or academic result.

## Observable cross-host mismatch

The selective SCO partition moves approved private async functions to a server. The original browser and server may have different default language/ICU settings. JavaScript can consult those settings through prototype methods without an explicit Intl identifier:

- `(1234.5).toLocaleString()` uses the default Intl number formatter. The source expression produced `1,234.5` under `LANG=en_US.UTF-8` and `1.234,5` under `LANG=de_DE.UTF-8` in a Linux Node 22 child-process check.
- `String.prototype.localeCompare` and `String.prototype.toLocaleLowerCase/UpperCase` use locale-sensitive comparison/case mappings. A runtime with a different default locale may produce different results.
- `Intl.DateTimeFormat.supportedLocalesOf` (also other formatter classes) depends on the target runtime's available ICU locale data. Requests may be explicitly named and still vary by host.

Authoritative references: [MDN Number.toLocaleString](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString), [MDN Object.toLocaleString](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toLocaleString), [MDN Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat), and [ECMA-402](https://tc39.es/ecma402/).

## Guard and test design

The new branch `agent7/sco-locale-prototype-effects-20261116` augments the existing `realmStateObservation` host-configuration check. It refuses direct private-call member spellings `toLocaleString`, `toLocaleLowerCase`, `toLocaleUpperCase`, and `localeCompare`. It also rejects direct and simply aliased Intl formatter `supportedLocalesOf` calls. The source's original public browser-side operations are retained, and static UTC/numeric/ordinary-string controls remain accepted.

`test/sco-primitive-locale-effects.test.js` checks independent explicit-locale witnesses, a child-process host-default locale differential on Linux, 12 negative source forms including computed-static member keys and alias capture, four unchanged safe controls, and client-side formatters still visible in the output. The test intentionally avoids assuming the Linux locale-environment behavior on Windows.

The native output differences are **environmental compatibility counterexamples**, not attacks on source confidentiality. This guard is a conservative syntactic refusal, not full interprocedural effect analysis. Opaque method references, proxy traps, runtime overwrites and arbitrary imported call effects remain unresolved. A static test may refuse safe user-defined `toLocaleString` methods that never consult the host. The 2.5× end-to-end runtime criterion must still be evaluated separately for admitted cross-network RPC workloads.

## Reproducibility / status

Run the repository's existing manually dispatched Linux+Windows Node22 full validation and strict JSDoc gate on an immutable SHA of this branch. Preserve red test-only results separately from the green repaired source. Report the exact run and commit; a passing test gate establishes only the included cases.
