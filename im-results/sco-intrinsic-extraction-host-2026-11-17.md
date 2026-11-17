# SCO extracted intrinsic host-configuration admission (17 November 2026)

## Evidence category and scope

**Engineering correctness counterexample, not an obfuscation-security result.** Selective SCO moves nominated asynchronous functions into a separate Node.js server realm. The earlier host-configuration scanner refused direct `Intl.DateTimeFormat` and direct unpinned `Date.parse` calls, but did not adequately preserve the origin of some **extracted** intrinsic methods and constructors.

The exact pre-fix regression was introduced in `test/sco-intrinsic-global-alias.test.js` at commit [`79badd24`](https://github.com/FlareZ123/obfs/commit/79badd24f5da44484c0c020a17e68261aba7f8e2). The [pre-fix Linux and Windows workflow 44066638081](https://github.com/FlareZ123/obfs/actions/runs/44066638081), pinned to `6e9e69bfc637eeaf747ff79551fe961dbbcc1748`, failed the new test with:

```text
not ok - SCO refuses destructured Intl constructors with host-local defaults
Missing expected exception:
const {DateTimeFormat:F}=Intl;return F('en-US').resolvedOptions().timeZone;
```

The Ubuntu log recorded 190 passes, one failure in 191 tests; the Windows log recorded 189 passes, one failure, one skip. The other 190 cases did not all exercise the same admission rule. These numbers describe the focused SCO workflow's **test phase**, not a complete project gate.

## Native host-configuration witness

The following original JavaScript expressions were executed with Node 22 `node:vm` under process timezones `Etc/UTC` and `Pacific/Honolulu`:

| Expression | UTC host | Honolulu host |
| --- | --- | --- |
| `const {DateTimeFormat:F}=Intl;F('en-US').resolvedOptions().timeZone` | `UTC` | `Pacific/Honolulu` |
| `const {DateTimeFormat:F}=Intl;F.bind(null)('en-US').resolvedOptions().timeZone` | `UTC` | `Pacific/Honolulu` |
| `const {parse:parse}=Date;parse('2020-01-01T00:00')` | `1577836800000` | `1577872800000` |

The native examples establish actual host-observable divergence. The first extracted formatter was separately confirmed **admitted by the pre-fix compiler** in both CI environments. The other extraction forms were identified by source-path analysis and included as new regression cases; their exact pre-fix admission status was not individually established by that first failing test.

## Narrow source and test changes

- `src/sco-selective-partition.js` tracks flat destructured `Intl` constructor aliases through the existing fixed-point origin scan, including direct `Intl`, `globalThis.Intl`, and previously recognized aliases. Constructor invocation through these aliases is treated as host-configuration dependent.
- Nested or defaulted destructuring directly from an intrinsic now conservatively refuses relocation where the alias cannot be proven.
- Extraction of `Date.now` or `Date.parse`, and `Date` or locale-sensitive `Intl` constructor paths using `.bind`, `.call`, or `.apply`, now trigger conservative host-configuration refusal. A direct `Date.parse` call with an explicitly pinned ISO UTC literal retains its existing positive exception.
- `test/sco-intrinsic-global-alias.test.js` contains cases for these refusal paths, a native timezone witness, and positive controls for `Date.UTC`, explicitly UTC `Date.parse`, and `Intl.getCanonicalLocales`.
- `sims/sco-realm-admission-coverage.js` adds three labeled safe controls and five labeled unsafe host-extraction examples. These are admission-label diagnostics, not a statistical proof of semantic safety.

Source commits: [`77ec335b`](https://github.com/FlareZ123/obfs/commit/77ec335b608f044b4e14b8d934604a17ab54d8ad), [`02c3adab`](https://github.com/FlareZ123/obfs/commit/02c3adabb7bb9bb863e1f347b2e0251554b7a71b); test and corpus follow-ups [`dfd13513`](https://github.com/FlareZ123/obfs/commit/dfd135137edecc16bfd5f26396cda0bc4b679e0f), [`41f850a4`](https://github.com/FlareZ123/obfs/commit/41f850a44cbf9fc6b1fa8be2efe77337ba52226e), [`18c61c9e`](https://github.com/FlareZ123/obfs/commit/18c61c9e2f3007efc6ec7903a6eaa4772bec871e).

## Validation status and limits

The initial red test is independently pinned and reproducible through GitHub Actions. **Post-fix cross-platform CI was still pending at the time this report was created**; do not infer success from the committed guard alone. A [post-fix SCO run 44067367012](https://github.com/FlareZ123/obfs/actions/runs/44067367012) was dispatched at `5f73d68bbe3632b74ce638c0e51b56ec42b31a8d`, prior to the final native witness and corpus commits. Recheck its exact head, status and logs, and run an exact-source final verification if needed. The entire mainline has changed concurrently, so CI pinned to an earlier head cannot certify later changes.

This change is entirely in compiler admission; it adds no generated client runtime instructions. It has **no measured transform-time bound**, broad semantic proof, attacker-reconstruction cost improvement, or universal 2.5× security-performance guarantee. The compiler still conservatively refuses some host-stable operations, and arbitrary reflective/host mutations remain outside this bounded syntactic model.

## Next independent checks

1. Obtain focused Linux/Windows red-to-green tests and strict JSDoc typecheck at one exact final source SHA.
2. Inspect whether the new nested intrinsic refusal reduces positive transformation yield for representative applications; report admitted safe controls separately from refused unsafe witnesses.
3. Examine cross-realm error-stack and additional host-intrinsic getters only with original-versus-split executable witnesses and positive controls, rather than broad speculative refusal rules.
