# Agent 10: SCO host-lock Storage source observation in classic scripts

**Date:** 2026-11-25  
**Test-only branch:** `agent10/sco-host-lock-storage-browser-20261125`  
**Exact final branch head:** `b67ce4520b864997570dfe72388aa408a2eadeda`  
**Manual browser run:** [45566273557](https://github.com/FlareZ123/obfs/actions/runs/45566273557)  
**Disposition:** confirmed classic-script source-observation gap; no production code changed.

## Question

Does the SCO host-lock path refuse a classic script when native Storage Web IDL DOMString conversion can expose a transformed function's source? Does the emitted host lock still enforce its allowed hostname?

## Fixture and method

The test-only branch adds `sims/sco-host-lock-storage-source-browser.js` and a manual-only step to `.github/workflows/manual-browser.yml`. It adds the script to `jsconfig.dom-source-evidence.json` for strict JSDoc checking.

The fixture compiles a single `sourceType:'script'` file with:

- `mode:'sco'`
- `allowedHosts:['127.0.0.1']`
- `identifiers:true`, `properties:false`, `strings:false`
- A function `inspect` with local `privateLocal`, passed as the value to `localStorage.setItem`
- An unrelated `independent` helper with local `independentLocal`

The browser page first verifies that `localStorage.setItem` is exactly `Storage.prototype.setItem` and that the native method's `Function#toString` contains `[native code]`. It then executes native and emitted code in Chromium, compares stored function source and numeric results, and executes the same generated artifact on a second hostname.

## Target-step result

On exact branch head `b67ce452...`, manual-browser run [45566273557](https://github.com/FlareZ123/obfs/actions/runs/45566273557) completed the target step **“Demonstrate SCO host-lock Storage source observation in Chromium”** successfully on Chromium.

The emitted witness line was:

```json
{
  "browser": "Chromium",
  "sourceObserver": false,
  "hostLock": "allowed 127.0.0.1 / denied 127.0.0.2",
  "metrics": {"literals": 0, "objects": 0, "properties": 0, "bindings": 2},
  "nativeSource": {
    "length": 62,
    "sha256": "dce24b03dbaee0b579b0c6a8b7a9b1a23ba9dcb90ac930226433d66265980273",
    "containsPrivateName": true
  },
  "emittedSource": {
    "length": 66,
    "sha256": "0a08125b37d643d37d1c709fd49f8af57ef327b07c31292bc9871f45cbdb19c1",
    "containsPrivateName": false
  },
  "runtimeValuesPreserved": true,
  "sourceParity": false,
  "hostLockPositive": true,
  "hostLockNegative": true
}
```

Thus:

1. The source observer returns false for this classic-script Storage sink.
2. The SCO host-lock path is admitted and two private bindings are rewritten.
3. Native `Storage.prototype.setItem` converts the function value to a DOMString, exposing its function source.
4. The native stored function source contains `privateLocal`; the emitted stored source does not. Their lengths and SHA-256 digests differ.
5. The application values remain 29 and 7.
6. The generated artifact executes on allowed hostname `127.0.0.1` and is rejected on `127.0.0.2`.

This confirms that the current host-lock source-observer gate does not model the native Storage source sink. The host lock still performs its hostname check, but it does not restore source parity or make the transformed function source unobservable.

## Full-workflow accounting

The full manual-browser workflow [45566273557](https://github.com/FlareZ123/obfs/actions/runs/45566273557) is **RED**, not green. The new target step passed. The pre-existing `test/bound-runtime-interception-browser.js:52` step failed with `0 !== 2`. The final strict DOM source-observation JSDoc step passed after fixing two harness-only typing issues found in the first attempt [45565877139](https://github.com/FlareZ123/obfs/actions/runs/45565877139). The final run also logged the existing browser source/stack parity observations. No full-browser acceptance claim is made.

## Relationship to earlier Storage evidence

This is a classic-script counterpart to the ESM SCO host-lock witness in `test/storage-sco-host-lock-source-observation-browser.js` on Agent 47's test-only branch (source pin `fcfb7c437b536805b8fa296f6d479c083ad78226`, run [45233032518](https://github.com/FlareZ123/obfs/actions/runs/45233032518)). That ESM fixture already showed a host-locked SCO module can execute on the allowed origin while native Storage conversion exposes changed function source. The present witness adds classic-script sourceType, a native Storage method identity check, and an explicit denied-host control. It does not replace the broader own-hook/captured-native/named-setter matrix in `im-results/storage-value-coercion-hooks-2026-11-23.md`.

Agent 8's proposed mapping remains appropriate: model the Storage call as a `WebIDLStringConversion` HostEffect with the exact receiver/lookup route and value argument, and attach a callable-scoped `ExactSource` SourceMirrorRead edge only when the ToPrimitive/effective-dispatch route is proven. A method-name-only `.setItem` veto would incorrectly conflate native conversion with JavaScript own/prototype overrides.

## Scope and limitations

- One Chromium build and a single localStorage value-argument path were tested. SessionStorage, the key argument, named-property assignment, captured native aliases, and conversion hooks are covered by other witnesses, not this fixture.
- The host lock checks `location.hostname`; this test does not establish scheme, port, path, URL-prefix, or cryptographic authorization.
- The browser witness is an intermediate source-parity result, not a proof that an attacker cannot patch or bypass client code.
- The test-only branch contains no production compiler change and should not be merged as a claim of repair. The compiler currently permits a source-observed rewrite in this fixture; a future fix should make the host-lock/source-observer admission fail closed or use the callable-scoped effect graph without sacrificing unrelated helper yield.

**Release status remains RELEASE-BLOCKED.**
