# Agent 2: preliminary independent review of PR #379

Date: 2026-11-26T08:35Z
Reviewed candidate: `0b282c8de6168a7ba398e3797fc5238c5866f50b`

## Source review

I have not found a false-safe admission in the reviewed `src/properties.js`, `src/core.js`, or `src/cross-properties.js` paths so far.

- The new `privateConsumerArgument` exception is narrower than its name might suggest: the reader must be a unique local function binding, used only as a non-optional direct-call callee, and have exactly one identifier parameter plus a one-member-return body (or a single const member read followed by returning that local). Exported, stored, returned, passed, source-observed, optional, multi-parameter, side-effecting, or otherwise escaped readers do not qualify.
- The exception only suppresses the enclosing callable's source-privacy veto for the owner argument. The existing fixed-point parameter-flow proof still requires every call site to supply the proved owner; a mixed owner/unproved external argument does not establish the reader parameter alias, and the later call-argument gate refuses the root proof. The positive ESM reader fixture and negative mixed-owner/source-observer/escape cases exercise this path.
- Exported function declarations are explicitly excluded from `privateFunctionNodes` via their export ancestry; an `export default function` does not become private merely because the declaration has no ordinary identifier reference.
- Cross-file sibling aliases are grouped only when they import the same named export from the same resolved exporter; every local binding must be unique and all root aliases must resolve in the same scope. Query/fragment/percent/backslash/dynamic imports, attributes, cycles/TDZ, reexports, reflection and escapes remain refusal paths in the resolver/tests.
- The URL pathname guard is wired through the relevant ESM resolvers/graph checks and SCO CLI publication. The HTTP decoder separately rejects decoded C0/DEL segments. The exact-head C0/URL mapping and SCO target-vs-decoy tests are not among the failing tests.

The `closedWorld:true` option remains an integrator claim, not a proof that no external consumers exist. `docs/CLOSED_WORLD_PROPERTY_PROOF.md` explicitly requires inventory of externally callable contracts and warns that unknown consumers of exported object shapes must not rely on original spellings. This is a deployment premise and should not be described as compiler-enforced.

## Exact-head validation

- Candidate full run `45782162524` is complete and failed on Ubuntu and Windows with the same 9 yield assertions; the new reader/path/publication tests are not in the failure list.
- Candidate behavioral suites: Ubuntu 5,454 tests / 9 failed / 25 skipped; Windows 5,454 / 9 failed / 35 skipped. Typechecks, benchmark, paired runtime profiles, and Ubuntu Chromium steps completed; the measured benchmark/profile ratios were within 2.5x.
- The 9 failures are transform-yield expectations in bound-runtime interception (2), factory/interfile (2), private class yield (2), private tuple session (1), SNO bound interception (1), and source-stable bound export (1). They are not reported as native/generated output mismatches.
- The previously cited main baseline `45741180523` at `59828dea` is stale for this comparison: the merge base `642630f` contains intervening production and test changes, including SCO/private-integrity code and additional tests. I dispatched a fresh full baseline on current main: run `45783634716`, head `8db0f4f6ab14c3b1d01a9f45179a07365ebf6a0f`. I will send the differential once it completes.

No code change is proposed at this checkpoint. I am continuing the exact-baseline comparison before issuing a final acceptance recommendation.

— Agent 2
