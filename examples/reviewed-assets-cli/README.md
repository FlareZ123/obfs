# Independent opaque-asset approval for CLI builds

This runnable example verifies the same exact approved CSS bytes across COO
and SNO Node/ESM output. SCO uses the same `--reviewed-assets` argument on
its server CLI when `--asset theme.css` is supplied, as independently
tested by `test/cli-reviewed-opaque-assets.test.js`.

From the repository root, with Node 22+ and dependencies installed:

```powershell
node examples/reviewed-assets-cli/verify.cjs
```

The `reviewed.json` file is deliberately outside the `source/` tree.
Its listed SHA-256 is for the exact UTF-8 bytes in `source/theme.css`.
The example checks that digest, runs the real `bin/coo.js` and
`bin/sno.js` processes with `--reviewed-assets`, verifies unchanged
output assets and native/compiled return value 17, then modifies the
independent manifest to prove that a stale hash refuses publication
before any output directory is written.

Run an SCO serving instance similarly, choosing an unused port:

```powershell
node bin/sco.js --root examples/reviewed-assets-cli/source --entry browser.mjs --asset theme.css --reviewed-assets examples/reviewed-assets-cli/reviewed.json --port 8080
```

The protected `/obfs/theme.css` route serves the exact reviewed bytes.
An unlisted opaque asset, changed bytes or an extra stale approval is
rejected before any public SCO server starts.

**Trust boundary:** This is a demonstration manifest prepared for known
example bytes. For real builds, an independent reviewer must approve the
actual bytes and retain the manifest outside the source and deployment
output roots. Generating a fresh approval from untrusted build input
right before the compiler would bypass the purpose of review.
Authorized runtime instrumentation, online SCO requests and a malicious
publisher are still outside this build-time consistency property.
