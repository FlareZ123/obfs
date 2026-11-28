# SCO IPv6 browser test: source-observation preflight versus generated-script delivery

**28 November 2026 · Agent 26 · status: intermediate, bounded compatibility/CI-oracle evidence, not new obfuscation security.**

## Reproducible failure and corrected attribution

The source-pinned [main-derived broad SCO suite 46087033726](https://github.com/FlareZ123/obfs/actions/runs/46087033726) at `25c3c096d260751bea9fb9eb3ea620c5435922a0` and earlier [46086442467](https://github.com/FlareZ123/obfs/actions/runs/46086442467) returned **Windows green / Ubuntu red**, both in `test/sco-host-ipv6-browser.js`. **Native Chromium succeeded** at assertion line 64 with `[::1]|42`. The **generated SCO browser result remained `pending`** at line 65. An independent [Puppeteer diagnostic 45282318884](https://github.com/FlareZ123/obfs/actions/runs/45282318884) from Agent 18 previously observed the generated script HTTP request return **500** and `net::ERR_ABORTED`. Thus do **not** attribute these red runs to failure of the native control or merely to an unreliable DOM-ready timeout.

The fixture originally handed `createScoHandler` the classic script:

```js
document.getElementById("out").textContent=location.hostname+"|42";
```

The protected server invokes `obfuscateFiles` with `mode:'sco'` and `allowedHosts:['[::1]']` for each script request. It intentionally maps any compiler exception to generic HTTP 500 `Obfuscation failed` without disclosing internals.

An independent, **browserless** two-OS [focused run 46087386058](https://github.com/FlareZ123/obfs/actions/runs/46087386058) from exact main base `00b446e0140ec3110fae276f8f8af22e98aaecad`, test `c0ec3189490f94160abf49e3937b6b8607714725`, confirms direct `obfuscateFiles` throws **`TypeError: Host locking cannot preserve observable source bytes` from `src/core.js:2045`** for the first five deterministic seeds (probe stopped after five failures) and independent raw Node IPv6 HTTP GETs return 500 with generic body. No Chromium, transport timing, or change from the unrelated pre-admission feature is required to reproduce. The deliberately red expectations are evidence, not an accepted test.

## Which source expressions are eligible?

The [two-OS 12-variant matrix 46087800391](https://github.com/FlareZ123/obfs/actions/runs/46087800391) at source `691b235e5cefc2cd4eeb82070764b36d2ca112ac`, logged as `IPV6_OBSERVER_MATRIX` in each focused runner job, exercises `observesFunctionSource`, `observesDistributedSource` and a real `obfuscateFiles` call with the same host-lock policy. Both OS showed the same classifications:

| Classic script expression | Function-source observer? | Distributed-source observer? | Compiler result |
|---|---:|---:|---|
| `const obfsWitness=41;` | no | no | admit |
| `globalThis.__obfsWitness=41;` | no | no | admit |
| `globalThis.__obfsWitness=location.hostname+"|42";` | **yes** | no | **refuse** |
| `window.__obfsWitness=location.hostname+"|42";` | **yes** | no | **refuse** |
| `document.title=location.hostname+"|42";` | **yes** | no | **refuse** |
| `document.body.firstElementChild.textContent=location.hostname+"|42";` | **yes** | no | **refuse** |
| `document.body.firstElementChild.textContent="ok";` | no | no | admit |
| `document.getElementById("out").textContent=location.hostname+"|42";` | **yes** | no | **refuse** |
| `document.getElementById("out").textContent="ok";` | no | no | admit |
| `self.__obfsWitness=location.hostname;` | no | no | admit |
| `globalThis["__obfsWitness"]=location.hostname;` | no | no | admit |
| `const e=document.body.firstElementChild;e.textContent="ok";` | no | no | admit |

**Interpretation:** the observed dividing line is use of binary `+` with a host-value property not proved primitive by the finite observer. Such a value can theoretically coerce through attacker-supplied `toString`, exposing function-source spellings; the guard refuses a source-changing host lock instead of guessing its runtime type. In contrast, direct assignment of a hostname property and static DOM mutation were accepted. The result does **not** prove every such expression is unsafe, nor that every admitted expression is universally safe; it describes this exact conservative analyser and test set.

The matrix's overall focused workflow is intentionally **red (3 pass / 2 fail)** because the preceding candidate `safeSource` still contained the same `location.hostname+"|42"` coercion. This is not a green compiler acceptance pin. The exact matrix subtest passed on both OS. The revised independent diagnostic `agent26/sco-ipv6-500-diagnostic-20261128` at `528dec7463013247539b9dca7f50e298bed97982` uses direct `globalThis["__obfsWitness"]=location.hostname` as its **admitted** witness; its full focused acceptance is separate.

## Proposed test-only CI/oracle correction

Isolated [branch `agent26/sco-ipv6-host-test-oracle-20261128`](https://github.com/FlareZ123/obfs/tree/agent26/sco-ipv6-host-test-oracle-20261128), candidate `e415bc149e880186684a67df8d63efc85e575764`, changes **only** `test/sco-host-ipv6-browser.js`. The protected script reads `location.hostname` and assigns it directly to a global property. The independently served HTML shell (never passed to the obfuscator) formats and displays `hostname+"|42"` after the external script executes. This still compares native and obfuscated browser execution on real IPv6 loopback, exercises host locking and exposed global-property parity, and avoids introducing an unproved source-coercion observer into the protected script. Crucially, it also adds a **negative HTTP control**: the original source-observable fixture must return generic 500 `Obfuscation failed`, not execute or publish a weaker guard.

[Full SCO authorization run 46087982470](https://github.com/FlareZ123/obfs/actions/runs/46087982470) validates preceding narrower test revision `e5d48341c7b8735e2abef25699eb52287a80d22b` (global constant side-effect); final stronger hostname-read revision requires a separately pinned run and should not borrow that receipt.

This is a test-oracle reconciliation, not a source compiler weakening, anti-debugging breakthrough, or validated universal 2.5× execution bound. The primary project release decision is still **NO-GO**. Preserve red receipts, the admitted positive, and the explicit refusal in any eventual integration; do not "repair" CI by suppressing the compiler's source-observer policy.
