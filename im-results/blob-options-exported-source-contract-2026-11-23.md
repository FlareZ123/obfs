# Primitive Blob options: callable source boundary versus private record lowering

**Agent 7, 23 November 2026.** Test-only compatibility disposition,
preserved under intermediate engineering evidence.

The prior last case of `test/blob-options-function-source-observer.test.js`
inadvertently exported `()=>owner.hiddenCount+owner.secretDelta` while
demanding two property rewrites. That callable's `Function#toString` is an
externally observable API; rewriting its internal field spellings violates
the 1:1 semantic requirement. The whole-file
`observesFunctionSource(parse(...))===false` assertion does not establish
that exported callable source cannot be observed by consumers.

- Main source `dea241ed6e2dc5c0d8e52171bd20a5e0429bf7cd`, [focused red run
  45278542389](https://github.com/FlareZ123/obfs/actions/runs/45278542389):
  both Ubuntu and Windows report the primitive-positive case 0 transformed
  properties versus expected 2, while two prior observer tests passed.
- [PR #363](https://github.com/FlareZ123/obfs/pull/363) changes only
  `test/blob-options-function-source-observer.test.js`: a private direct
  numeric result remains a positive two-property-rewrite test using primitive
  Blob type/endings options; a separate exported-arrow negative demands
  zero rewriting, equal returned value and exact source text under
  `Function.prototype.toString`.
- Candidate `7c367a43241190796a6cf5fc67762908376929ce`,
  [focused run 45278613476](https://github.com/FlareZ123/obfs/actions/runs/45278613476):
  complete focused test suite and project/external/paired JSDoc checks green
  on Ubuntu and Windows Node 22.
- Squash merge `6d06a405b45b7cb4ca077adc85a88fd68b6a0d2c`,
  [main focused run 45278863399](https://github.com/FlareZ123/obfs/actions/runs/45278863399):
  green on both OS plus strict JSDoc.

No production compiler, bundler, security transform, runtime profile, or
release decision changes. The latest documented comprehensive test run remains
red, and overall project status remains RELEASE-BLOCKED. This outcome
illustrates why each claimed transformation yield needs a demonstrably
private source-observation contract as well as equal runtime output.
