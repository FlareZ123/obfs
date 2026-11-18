# SCO request-policy initialization: first-read authority consistency

**Agent 5, 18 November 2026. Classification:** intermediate, reproducible
server-side configuration-consistency result. This is a deployment-safety
control, not a demonstrated new obfuscation architecture.

## Counterexamples

Before the fix, `createScoHandler(sourceFiles,options)` validated some
caller-owned `options` properties and read them again into its runtime
request policy. A stateful getter could return an initially reviewed
restriction and then a more permissive value during handler construction:

- `authorizeRpc`: first callback refused every request, later callback
  allowed them; an actual localhost POST then invoked a server-only
  operation despite the first configured denial.
- `remoteMethods`: initial method map contained only `publicValue`,
  while a later getter introduced `privateValue`; the latter was accepted
  through the HTTP RPC handler.
- `authorizeRead`: first callback denied file reads, later callback
  allowed them; a real GET returned the asset.
- `allowedHosts`: the later array contained an additional Host value;
  HTTP GET with that unapproved Host was accepted. Host filtering is
  routing only and cannot authenticate clients against forged headers.
- `maxRpcBytes`: first cap was 1 byte, later cap was 65,536 bytes;
  a POST larger than the first cap was accepted.
- `closedWorld`: the analysis and transformation branches could
  observe different getter values within the same compiler invocation.

These are trust-boundary consistency witnesses involving a **caller-managed
startup configuration**. They are not remotely exploitable conditions
against a correctly configured handler simply because a hostile HTTP
client sends requests. A fully malicious trusted-server integrator can
bypass the handler and publish secrets directly.

## Implementation

`src/sco.js` captures the first configured remote registry, authorizer
functions, byte cap, host array and closed-world selector during handler
construction. The supplied host array is copied through indexed values
and checked as string entries; the method registry is copied once while
preserving each original function reference, including its private batch
metadata. All admission validation uses the same owned values later stored
in the handler's request policy. Authorization callback *closure state*
remains live for ordinary credential rotation, as established by the
prior configuration-state tests.

This also closes the remaining multi-read risk around `closedWorld`
when computing imported-key proofs versus transforming the served
sources. The runtime behavior of valid ordinary configurations and the
body of each repeated request handler remain unchanged. Only trusted
SCO setup does additional snapshot work.

## Source-pinned red/green reproduction

- **Red:** [manual Linux/Windows SCO gate 44211909581](https://github.com/FlareZ123/obfs/actions/runs/44211909581)
  at exact source `50f6a4a52901bcfd71b77375872feb1b4a31c8e5`.
  All **six** new tests failed on each platform, establishing the
  old configuration drift in the actual handler; the focused suite
  collected 235 tests per platform.
- **Green:** [manual Linux/Windows SCO gate 44212054003](https://github.com/FlareZ123/obfs/actions/runs/44212054003)
  at exact source `6e8adbe1b752bc527ad1ed3f0de8c650ae1b75f8`.
  Both operating-system jobs passed all configured SCO authorization,
  HTTP, partition, selected-graph, probe and JSDoc steps, including all
  six new cases.

The new regression is
`test/sco-request-policy-initial-snapshot.test.js` and is included in
the existing manual-only SCO workflow. The earlier publication allowlist
snapshot fix is independently documented in
`sco-public-allowlist-snapshot-2026-11-18.md`.

## Limits and next questions

A proper server deployment must use real account/session authorization;
Host headers are forgeable, and this fix does not create domain-locking
against a full-control client. Caller-supplied getters still have
side effects when read once, and arbitrary server administrators
can deliberately choose permissive policies. Nontrivial authorization
correctness for batched and concurrent operations remains governed by
the project's independent isolation and inner-operation policy tests.
No general source secrecy or tamper-resistant-execution claim follows.

No repeated-request runtime work was added, so there is no new
per-call compute overhead from the snapshots; a universal 2.5×
end-to-end budget still requires separate workload measurements.
