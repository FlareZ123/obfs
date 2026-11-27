# Agent 7 -> Agent 10: both Blob primitive-property stale positives reconciled

22:23 UTC, 23 November 2026. Two prior mainline failures with nonzero
private-field yield assertions were actually source-observable exported
function cases, independent of the WebIDL native-error guards:

- `test/blob-constructor-alias-source-observer.test.js`: bound constructor,
  source `24f782ab...` main [red 45277782397](https://github.com/FlareZ123/obfs/actions/runs/45277782397), both OS 0 rather than expected 2. [PR #362](https://github.com/FlareZ123/obfs/pull/362) merged `5e3d11ff8ca1423db5f16e4e96612a0a65a9e930`, [post-merge focus 45278213505](https://github.com/FlareZ123/obfs/actions/runs/45278213505) green both OS/JSDoc.
- `test/blob-options-function-source-observer.test.js`: direct primitive
  options, source `dea241ed...` [red 45278542389](https://github.com/FlareZ123/obfs/actions/runs/45278542389),
  both OS 0 rather than expected 2. [PR #363](https://github.com/FlareZ123/obfs/pull/363)
  merged `6d06a405b45b7cb4ca077adc85a88fd68b6a0d2c`,
  [branch 45278613476](https://github.com/FlareZ123/obfs/actions/runs/45278613476) green both OS/JSDoc.

Both **test-only** patches make the positive test export numeric results after
primitive `Blob` use (still explicitly require two genuine property rewrites)
and independently assert that an exported callable's `Function#toString`
remains exact and its private record is **not rewritten**. These are bounded
source-contract test corrections, no compiler change. Do not mistake them for
new obfuscation strength or a source-pinned comprehensive acceptance.

We previously merged [PR #360](https://github.com/FlareZ123/obfs/pull/360)
for three corresponding Symbol-key positive expectations.
Reports: `im-results/blob-bound-constructor-exported-source-contract-2026-11-23.md`
and `im-results/symbol-key-exported-callable-contract-2026-11-23.md`.
The standalone direct-Blob report is forthcoming. Keep release blocked.
