# Agent 27 research continuity

Claimed 2026-11-15T15:07:48.731Z under run ID `agent27-20261115150748731`, after a genuine random draw of 5 selected normal mode. Lease is `agents/agent27/.lease.json` and must not be refreshed; after each checkpoint compare current UTC clock with the original timestamp. The 70-minute release threshold is 2026-11-15T16:17:48.731Z. Only then stop research, commit and push all work, delete lease as the final mutation, and verify. All commits prefixed `Agent 27:`. No automatic per-commit Actions workflows.

## Research focus and baseline

Maintainer broadcast at 12:40 UTC requested real advanced obfuscation, before/after artifacts and fewer ceremonial tests. The existing four-module COO public string sharding experiment by Agent31 has a demonstrated 3.6-3.8x Node graph-load cost and zero static confidentiality. Agent27 developed a constrained *existing-edge piggyback* variant: 2 existing ESM modules, no added module, deferred/memoized decode, 2 public shares. It is deliberately outside default compiler because arbitrary external observers, module-namespace reflection, early ESM cycle calls and intrinsic mutation remain unproved.

## Files and reproduction

- `workplace/coo-piggyback-shards.js`: JSDoc-typed opt-in compiler requiring closed-world flag and single no-param string-return function.
- `examples/coo-piggyback/`: genuine deterministic 2-module before/after, builder with atomic+locked writes.
- `sims/coo-piggyback-recover.js`: independent seedless source-only attacker that fully recovers encoded text.
- `test/coo-piggyback-shards.test.js`: 5 focused native ESM differential, import ordering, proof refusal and attack tests.
- `sims/coo-piggyback-profile.js`: 48 paired fresh graph imports and 24 hot samples.
- `jsconfig.piggyback.json`: strict standalone JSDoc checker.
- `im-results/coo-piggyback-layout-2026-11-15.md`: evidence and caveats.

Local Node 22.16.0: 5/5 tests green, strict JSDoc green. Two profile replications: graph-load ratios 1.204x and 1.107x; hot 1.064x and 1.051x, fixture only. Original source bytes 281, changed 1314. Offline attacker succeeded. Next work: run selected GitHub manual CI against exact commit, contrast with four-module on same fixture; add real Chromium graph-load/evaluation-order test; scrutinize external source observers; avoid promoting a trivial recoverable scheme as security improvement.

GitHub connector is the accessible remote write path; shell cannot resolve github.com. The repo was not locally cloned; tests executed from a local scratch mirror of the new files with globally installed Acorn and Node typings.

## Browser and hoisted initialization follow-up (2026-11-15 ~15:45 UTC)

- The original implementation emitted payload/cache declarations at end of the consumer. A native top-level call to a hoisted exported function before its declaration reaches generated helper variables in their temporal dead zone. Repaired by inserting the declarations after initial directives/hashbang and before ordinary module evaluation, leaving decoder function declaration hoisted. Added real-ESM regression for `"use client"` followed by early call; all 6 focused tests and strict JSDoc pass. Rebuilt byte-exact sample; Node 22.16.0 paired profile 1.113x cold and 1.015x hot for small fixture. This is a tangible semantic correctness repair, not a stronger security claim.
- Introduced standalone real Chrome harness `test/coo-piggyback-browser.js`, manually dispatched through existing `.github/workflows/manual-browser.yml` alongside strict piggyback types; local Debian 13 Chromium 144 could not render even a minimal `data:` page in this container. Remote Chrome 157 integration runs 43730988714 at 766af3d6 and 43731123308 at 2ae3983e both failed with Chrome SIGILL when our new harness attempted to run, while the preexisting browser integration steps passed earlier. Await enhanced logging to identify whether before or after fixture crashes; do not claim successful real-browser compatibility or erase the red evidence.
- Source-initialization patch and enhanced logging need to be pushed before final validation; when pushing, keep generated sample after/app.mjs in sync. CI sources are moving concurrently; pin exact head SHAs and log scopes. Normal mode lease remains claimed_at 15:07:48.731Z, so only self-release after measured 16:17:48.731Z or later, with final lease deletion as last mutation.

## 2026-11-18 incarnation: semantic parity and first-use budget veto

Current lease `agents/agent27/.lease.json` claimed at
`2026-11-18T06:07:05.628810Z`, run_id
`f2044220-fce4-49d6-9d14-0ed900c25b12`. **No self-release before
07:17:05.628810Z UTC**; after every checkpoint compute actual wall
clock and follow mandatory orderly release at >=70 minutes.

- Repaired the experimental piggyback decoder's spread-on-array
  dependency. `Array.prototype[Symbol.iterator]` can be mutated by
  app code, causing `String.fromCharCode(...units)` to return a
  different value than a native literal; generated code now constructs
  a primitive string per code unit. Added real two-module ESM
  monkeypatch differential including NUL and lone surrogate, refreshed
  `examples/coo-piggyback/after/app.mjs`.
- Integrated targeted cross-platform CI into the already-existing
  `.github/workflows/manual-coo-shards.yml`, without adding an
  automatic or new expensive workflow. Green [44250113555](https://github.com/FlareZ123/obfs/actions/runs/44250113555)
  pinned 7/7 tests on Ubuntu and Windows, generated snapshots and JSDoc.
- A full-AST generic `observesFunctionSource` gate overrefused
  original positive compilations: red
  [44250715167](https://github.com/FlareZ123/obfs/actions/runs/44250715167)
  5/8 per OS. Replaced it with a selected-function alias/array-carrier
  refusal for `Array#join` implicit source coercion; the independent
  negative plus all positive cases passed 8/8 per OS at
  [44251072708](https://github.com/FlareZ123/obfs/actions/runs/44251072708).
  This bounded scanner still assumes external observers absent;
  this is not a general interprocedural proof.
- Added `sims/coo-piggyback-firstuse-curve.js` for
  48 native/emitted fresh ESM graph pairs at 52, 512 and 4096 UTF-16
  code units. Prior full graph cold+cached ratios ~1.2x masked
  an *isolated first-call* >2.5x veto: **142/144 Ubuntu,
  144/144 Windows** over budget on selected paired first calls.
  Successful reproducible run:
  [44252007719](https://github.com/FlareZ123/obfs/actions/runs/44252007719)
  SHA `316e0545829609551d03a57cb01c9a8bc24b858d`. A
  preceding red setup run 44251766266 had invalid string escapes;
  fixed and green on both OS. Source-only seedless attacker still
  recovers all published strings, so backend has *both* security and
  selected first-call release vetoes. **Keep opt-in/off by default;
  do not spend effort optimizing a defeated source-public layout
  absent a new independent attacker-cost hypothesis.**
- Full reports:
  `im-results/coo-piggyback-array-iterator-parity-2026-11-18.md`
  and
  `im-results/coo-piggyback-firstuse-budget-veto-2026-11-18.md`.
  Broadcast to other identities:
  `communications/broadcast/2026-11-18T0634Z_agent27_coo-firstuse-budget-veto.md`.
- Whole-system primary objective remains blocked by strict
  sampled 2.5x breaches, public code recovery and controlled runtime
  tampering in COO/SNO; SCO private service retains a distinct
  trusted-server boundary but can be relayed by a legitimate attacker.
  Current release index and Critic instructions discourage
  security-performance claims without a matched minifier attack
  control and strict full-workload CPU samples.

Further work should target a *different* candidate with a predeclared
independent static/dynamic attacker and strict selected/cold/hot
performance boundaries, or a real flaw in the established mainline
compiler. Avoid claiming browser compatibility from the native ESM CI:
  prior local/remote Chromium SIGILL is unresolved.

## 18 November 2026 follow-up: MAINLINE DOM global String alias correctness

A higher-impact **mainline** semantic bug was found after the
experimental COO veto. Browser `document.defaultView` is the
document's active `WindowProxy`. `src/core.js::isGlobal` recognized
`window`/ `globalThis` identifiers but not this equivalent realm
route. Earlier supplied modules can replace the decoder's
`String.fromCharCode` through that route, so original literals
return `protected-literal-value` but emitted literals return a
string of 23 question marks.

- Added three cross-file Node CJS cases in
  `test/ambient-string-alias.test.js`:
  `document.defaultView`, `globalThis.document.defaultView`,
  `window.document.defaultView`, with synthetic
  `document.defaultView=globalThis` to model the WindowProxy alias.
- **Red** actual emitted/native output difference on Ubuntu and
  Windows at SHA `0d3423a76757243c873ac37cce06af31049bd3f3`
  run [44253730960](https://github.com/FlareZ123/obfs/actions/runs/44253730960):
  3 semantic failures per OS, not just a positive-count failure.
- Patched `src/core.js::isGlobal` with conservative recursion through
  `document.defaultView`, `window/globalThis.document.defaultView`
  and self/window member paths. This is build-time admission only;
  accepted output runtime is unchanged. An unrelated
  `document.defaultView.Number` write remains a positive literal
  encoding control.
- **Green** 114/114 tests each OS, production JSDoc, and nine real
  Chromium fixtures at SHA
  `26ab680acbe50df82e13210e90d840fd6b051b69`,
  [run 44254152077](https://github.com/FlareZ123/obfs/actions/runs/44254152077).
  Two added browser cases actually execute same-site CSP native,
  protected and recovered ESM graphs; hostile String mutation yields
  zero encoded literals, unrelated Number mutation one, both exact
  `{first:65,last:90,length:2049}` output.
- Extended existing small workflow
  `.github/workflows/manual-captured-read-proof.yml` rather than
  adding a new workflow. Report:
  `im-results/document-defaultview-intrinsic-semantic-parity-2026-11-18.md`.
  Sent direct note to `communications/agent10/2026-11-18T0651Z_agent27_defaultview-intrinsic-redgreen.md`
  to coordinate with their ambient-alias track.

The source scanner is intentionally not a complete browser realm
provenance proof. Shadowed/detached documents may overrefuse. Unknown
external preloads remain outside the supplied graph. This is bounded
compatibility, not a confidentiality or 2.5x-runtime advancement.

## 18 November 2026 continued: fixed-point + imported Document aliases

Further source-visible tests expanded the mainline Document.defaultView
parity repair from its three initial syntactic cases to true alias
analysis with declaration destructuring, assignment destructuring,
CJS require and ESM imported bindings:

- Added three local binding cases and real Chromium equivalents.
  Red [44254798329](https://github.com/FlareZ123/obfs/actions/runs/44254798329)
  at `edc12bf16b62dd88926a593779671a341ba3a9fa` was **114/117**
  on each OS with three actual native/emitted source-output mismatches.
  `src/core.js` now has `documentNames`, `isDocumentValue`, and
  propagates global/document aliases through the existing monotonic
  fixed-point VariableDeclarator and destructuring logic.
  Green [44254995341](https://github.com/FlareZ123/obfs/actions/runs/44254995341)
  source `58ebd17ed535a108b2d32889ab63ae6d5721fd35`,
  117/117 Node tests each OS and 13 real Chromium fixtures.
- Object-pattern `AssignmentExpression` was a separate real hole.
  Red [44255248526](https://github.com/FlareZ123/obfs/actions/runs/44255248526)
  source `c99d6af3a3457da3d1cfe7127342fdbd99b5d4f8` was
  **117/119** per OS with two runtime discrepancies. Shared
  `recordDocumentPattern` inside `src/core.js` handles patterns
  in declarations and assignments, including existing target
  identifiers. Green [44255415512](https://github.com/FlareZ123/obfs/actions/runs/44255415512)
  source `c03a77cf5cfb5003f6fdc04baba2937c9adf246c` had
  119/119 Node tests each OS, JSDoc and 16 browser fixtures.
- Cross-module `require('./owner.cjs')` opaque result can carry
  the Document, then `Doc.defaultView.String.fromCharCode=...`
  before a target literal initializes. Red
  [44255769510](https://github.com/FlareZ123/obfs/actions/runs/44255769510)
  source `9cb319e9684014f260f84360e2390ffe35f8e79f`
  measured `???????????????????????` versus native
  `protected-literal-value` on Ubuntu+Windows, 119/120 tests.
  `src/core.js` now conservatively seeds document aliases from
  unproved CommonJS require results and all ESM imported local
  identifiers. Same fixed-point collector handles chained aliases.
  Standalone ESM imported-Document negative+positive cases were
  added to `test/ambient-string-intrinsic.test.js` and its workflow.
  Green [44256040665](https://github.com/FlareZ123/obfs/actions/runs/44256040665)
  at `40966c4af2f462b016d8d1110f5d2958bcaf8abc` ran 132/132
  tests per OS plus real Chromium.
- The latest source-pinned targeted
  [green 44256257798](https://github.com/FlareZ123/obfs/actions/runs/44256257798)
  at `9142e64bdd9de4f0c2ae5318b026d37100c75668`
  covers **132/132 Node tests per OS**, production JSDoc,
  and **21 real Chromium fixtures**, including imported
  `owner.mjs` document source (unsafe String refusal)
  and unrelated Number write (one protected literal retained,
  the independent source-only attacker recovers it).
  Final full integration was manually dispatched as
  [run 44256264367](https://github.com/FlareZ123/obfs/actions/runs/44256264367)
  against the exact same SHA, was in progress as of ~07:08 UTC;
  check verdict before release. An earlier full
  [44254480016](https://github.com/FlareZ123/obfs/actions/runs/44254480016)
  passed but predates these alias extensions.
- Intermediate source-pinned report was extended in place:
  `im-results/document-defaultview-intrinsic-semantic-parity-2026-11-18.md`.
  Existing cross-platform targeted workflow
  `.github/workflows/manual-captured-read-proof.yml` now tests CJS,
  ESM and genuine Chromium graphs.

All measures are conservative admission and behavioral parity,
not proven anti-reconstruction advantage. False refusal may occur
for unrelated imported objects shaped like Documents, but positive
unrelated Number cases stay enabled. Source-visible arbitrary
factories, proxies and external untracked code remain unproved.
Stronger security claims and universal 2.5x runtime remain blocked.

When the original claim at 06:07:05.628810 UTC reaches >=70min
(07:17:05.628810 UTC) **at an actual checked checkpoint**, perform
the orderly release with current memory, push all data first, then
delete `agents/agent27/.lease.json` as the very last repository
mutation, and verify remote deletion. Do not voluntarily leave earlier.

### Full-suite source-coincident caveat (07:11 UTC)

The full integration [44256264367](https://github.com/FlareZ123/obfs/actions/runs/44256264367)
at final targeted-green source
`9142e64bdd9de4f0c2ae5318b026d37100c75668`
**failed** two independently authored
`overridden Reflect.get invalidates numeric proof` SNO/COO
tests per platform. Ubuntu was 2953 pass/2 fail/1 skip of
2956 Node tests; Windows was 2951 pass/2 fail/3 skip.
These `test/decoder-opaque-prototype-source.test.js` cases were
added by **Agent 10** at commit `0d8ede5cf502b8fe141f2dc910465dc50e8e3748`.
They are source-visible distinct aliases of `String`
by replacing `Reflect.get` and are unrelated to our Document
alias scanner. We sent direct note
`communications/agent10/2026-11-18T0710Z_agent27_reflect-get-full-CI-failure.md`
and should not duplicate their ongoing repair.

Final targeted-green browser+Node gate **44256257798** remains valid
at that exact same source pin. It proves only the scoped Document
cases, not full mainline regression freedom. The intermediate
`Document.defaultView` report has been amended accordingly.

### Peer resolution of full-suite Reflect.get red (07:13 UTC)

Agent 10 replied in
`communications/agent27/2026-11-18T0713Z_agent10_reflect-get-proof-fixed.md`:
the two source-visible `Reflect.set(Reflect,'get',...)`
intrinsic replacement failures reported from our stale
full-run pin were repaired in `src/core.js` at commit
`16ccd0f4c01793a4c18f445cfd9d11834e52be30`.
Their targeted two-OS/JSDoc and Ubuntu Chromium
[run 44256364517](https://github.com/FlareZ123/obfs/actions/runs/44256364517)
was **green** at `e520b6deb76e7a706e83531d4b4558132f6d96a8`.
Their subsequent full
[run 44256986721](https://github.com/FlareZ123/obfs/actions/runs/44256986721)
is pinned to `7f36a99738e8191f856c7327fcdc647fbbdbae2b`
and was in progress at this memory update. The former failure
now has a separate author-owned fix; check the latest full
verdict before orderly lease release.
