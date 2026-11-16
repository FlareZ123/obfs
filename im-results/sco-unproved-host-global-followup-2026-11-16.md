# SCO migration of application-owned globals: follow-up

**Agent 7, 2026-11-16. Status: reproducible bounded compiler-safety improvement.**

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

## Pinned red/green evidence

- **Initial no-escape witness:** the prior draft #42 failed three existing
  shared-ambient diagnostics on both CI platforms. Revision #43 preserved
  their previous precedence; all 1,776 behavioral tests passed at SHA
  `92cfa8c00dfb24898868d5784187706da17a3ca9` but strict checking failed
  due to a separate JSDoc attachment error in the import verifier.
- **Nested self-alias red control:** [manual run 43944152286](https://github.com/FlareZ123/obfs/actions/runs/43944152286)
  at exact source `20ef2a5b4b59419b15e18ab31a71bcf197e30e04` failed
  one newly added test on each operating system. The previously admitted
  `return globalThis.globalThis.externalBridge.value;` produced **no
  exception** from the source selector. Other passing cases do not establish
  that every unlisted alias path is blocked.
- **Corrected full run:** [manual run 43944238479](https://github.com/FlareZ123/obfs/actions/runs/43944238479)
  at exact source `00bfd4dc07035c9f148b59f5eaa40a61648d9377`
  passed Ubuntu **1,776 / 1,777** tests (one skip, zero failures) and Windows
  **1,775 / 1,777** (two skips, zero failures); both strict JSDoc checks,
  external checks, sampled benchmarks, and four paired six-module workloads
  passed. Ubuntu passed 15 primary real-Chromium fixtures plus the
  separate 64-case real-browser parity check. This source removes
  `globalThis` from the migratable-global-property allowlist because the
  self-reference exposes a separate host object, whose identity can be
  forwarded to an unknown application capability. The error now occurs
  before server-side publication.
- A separate misplaced JSDoc declaration for `verifyPrivateImport`
  in `src/sco-graph.js` was corrected within the validated branch to
  restore strict checker compatibility. It has no intended runtime effect.

The standards basis is [ECMA-262, the Global Object](https://tc39.es/ecma262/#sec-global-object)
and [MDN globalThis](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis):
hosts can add their own properties and the globalThis binding is mutable.
The selected-private whitelist intentionally preserves the existing
fail-closed philosophy. It is **not** a whole-program lexical provenance proof;
derived or opaque host-object aliases, node/browser version differences,
and transitive dependency host contracts still warrant separate review.

The 2.5× target cannot be inferred from compiler admission tests. The paired
six-module benchmark profiles cover separate compatible programs, and their
green status must not be misreported as a proof for migrated arbitrary SCO RPC
granularity or production network latency.
