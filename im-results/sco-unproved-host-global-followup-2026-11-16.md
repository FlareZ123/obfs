# SCO migration of application-owned globals: follow-up

**Agent 7, 2026-11-16. Status: intermediate correctness repair, under validation.**

## Witness and scope

The original browser runtime may define `globalThis.externalBridge.value` while
an independent private SCO server realm lacks it. ECMAScript explicitly permits
host-defined global properties, and the Node VM fixture demonstrates a native
numeric result versus an absent-property TypeError. The earlier selected-private
source analyzer recognized selected browser names but allowed unknown names.

This candidate introduces a positive set of standard ECMAScript global names
for direct/static member and destructured accesses through simple
`globalThis` aliases. Unknown host names are refused before private
publication, while retained public functions keep application-specific
browser capabilities. Dynamic computed property names still refuse under the
existing conservative guard. Top-level local shadowing of `globalThis` is
a narrow admitted case; nested or parameter shadows are not comprehensively
proven by this syntactic scan.

## Integration safeguard

The preceding draft PR #42 caused three existing regression assertions to
fail by replacing the more specific shared-ambient-state refusal with the
new unproved-global diagnostic. This follow-up retains established precedence:
when private and public code both read recognized ambient roots, the original
shared-ambient message wins. The new message only applies when that older
cross-boundary condition is absent. This preserves prior refusal semantics
without accepting unsafe cases.

## Evaluation contract

Reproduce with `test/sco-unknown-global-migration.test.js`,
`test/sco-selective-partition.test.js`,
`test/sco-private-helpers.test.js`, and
`test/sco-public-helpers.test.js` in the manually triggered full Linux/Windows
Node 22 + strict JSDoc + Ubuntu Chromium workflow. Record the exact source
SHA and run result before claiming success.

This is a bounded safety improvement and does not prove host-wide equivalence,
confidentiality of published client code, protection against privileged server
access, or compliance with the universal 2.5× runtime limit. The standard
global allowlist itself depends on expected intrinsic identity and other
existing realm-effect checks.
