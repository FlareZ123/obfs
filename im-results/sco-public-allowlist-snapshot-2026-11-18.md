# SCO positive publication allowlist: accessor and iterator consistency

**Agent 5, 18 November 2026. Classification:** intermediate, reproducible
trusted-server publication correctness. No claim of hostile-client tamper
resistance, general JavaScript semantic preservation or stronger obfuscation
than a conventional minifier.

## Reviewed source declaration versus handler admission

`createScoHandler(files,{publicPaths})` is an opt-in positive boundary:
reviewed path entries should be the exact files eligible for HTTP publication.
At source before `6f17aacaa085e387a0de22f728abc49763ec7703`,
the handler read `options.publicPaths` separately for an undefined test,
an Array check and iteration. A caller-controlled getter could return
`['public.css']` at first inspection, then expand to
`['public.css','private.css']`. The previous handler accepted both
files. Likewise, an Array containing only `public.css` could override
`Symbol.iterator` to yield `private.css` too. These are consistency
counterexamples when a trusted server integrator uses mutable objects,
accessors or wrappers for its reviewed configuration. A fully malicious
server integrator can simply disclose its own files; this does not create
a remote-client exploit by itself.

`src/sco.js` now obtains `options.publicPaths` once, copies the Array
through indexed values with the existing `snapshotMetadataEntries`
helper, and validates the copied values. The return-time request policy
is constructed from only fields actually used when handling requests;
spreading all of `options` previously re-read `publicPaths` during
construction, which the strengthened regression detected. The file
inventory already has an independent indexed snapshot, and `privateModulePaths`
and original digests are likewise owned before the same publication pass.

## Exact red and green evidence

- **Old policy:** [two-platform SCO run 44210759159](https://github.com/FlareZ123/obfs/actions/runs/44210759159)
  at `c9ba9eaa2100ad757f8545358133a529f61983dc`
  failed the expected-exception tests for a getter expansion and custom
  iterator expansion; a getter that first allowed both files and later
  narrowed the list failed its positive control. The indexed-element
  witness passed.
- **Initial fix:** [run 44210822044](https://github.com/FlareZ123/obfs/actions/runs/44210822044)
  at `23d68ed0aee064b6e3d83d258f8f4aa12cafa21a`
  failed only the first-declaration positive's one-read assertion:
  the late `{...options}` policy copy still invoked the getter twice,
  although the admitted file set had been frozen.
- **Complete fix:** [run 44211101400](https://github.com/FlareZ123/obfs/actions/runs/44211101400)
  at `6f1be99283286a47e5a837821e570c9f27a924aa`
  passed both Ubuntu and Windows SCO authorization jobs, including the
  four new regressions, existing HTTP, partition and batch policy tests,
  manual SCO probes, and both configured JSDoc checks.

The test file is `test/sco-public-allowlist-snapshot.test.js`.
`.github/workflows/manual-sco-authorization.yml` runs it in the existing
manually dispatched two-platform gate. No new dependency or new always-on CI
was added. The change copies the path list during trusted-server handler
initialization and adds no work to any repeated authorized request.

## Remaining boundaries

`publicPaths` only prevents accidental extra files under an independently
reviewed list. It does not inspect arbitrary asset payload content, prove
that approved files are harmless, stop a malicious server administrator,
or prevent authorized clients from relaying server-private results. Other
caller-controlled startup fields and `reviewedOpaqueAssets` have separate
snapshot questions; no universal immutability claim is made for the entire
options object. The measured 2.5× full-application runtime budget is still
unproven; here the only added work occurs during SCO handler setup.
