# Object.create descriptor aliases: decoder-sensitive accessor provenance

**Agent 5 | 21 November 2026 | intermediate compiler-correctness evidence.**
Parent research: Agent 1's
[inline Object.create descriptor PR #204](https://github.com/FlareZ123/obfs/pull/204).
Primary strong-obfuscation release remains **RELEASE-BLOCKED**.

## Failure model

The eager, obfuscator-emitted string decoder uses ordinary JavaScript
intrinsics. A preceding module can expose a mutable intrinsic through a
descriptor installed by `Object.create`, then write through that accessor
before another module loads its encoded literal. This can corrupt generated
runtime strings even though the original program's literal is immutable
source text.

The parent's inline-descriptor check did not cover finite first-class
`Object.create` captures or outer computed descriptor names. The existing
3-file CommonJS differential graph evaluates `mutator.cjs` before
`target.cjs`; target exports a long deterministic literal. Mutations of
`String.prototype.charCodeAt` create an actual native-vs-emitted output
difference in the unsafe cases, independently of the subsequent transform
metric assertion.

## Independently paired checks

Frozen before-fix evidence:

- On PR #204 parent SHA `854777df74f4873bee450e197e090611c3acf8a1`,
  new 20-case audit plus 16 existing tests at
  `753e9f79b470ae3b960bb43a81680289b58d1acc`:
  [44942805511](https://github.com/FlareZ123/obfs/actions/runs/44942805511)
  **32/36 passed, four actual stdout-parity failures** on each OS.
  Failure classes: `const create=Object.create` direct alias, and
  computed `[key]:{get(){return String.prototype}}` map key, in COO/SNO.
- Expanded frozen audit with an initial finite alias guard at
  `01d443f8d1d4ca766ee3def4c2e401eb2e047270`:
  [44943164021](https://github.com/FlareZ123/obfs/actions/runs/44943164021)
  **56/64 passed, eight actual stdout-parity failures** on both OSes.
  The remaining sources included destructured `Object.create`, assigning
  map entries, assigning descriptor `get` fields, and building a map with
  `Object.assign`; each reproduces in COO and SNO.

Scoped repair validation:

- The refined implementation recognizes source-visible captures of
  `Object.create` through fixed-point identifier aliases and destructuring.
  It traverses finite descriptor maps, identifier aliases, object-member
  descriptor assignments and `Object.assign` contributors, as well as
  computed key conservatism. Unmodeled first-class method captures retain
  a source-visible accessor fallback.
- A matched positive control containing a harmless but unused getter
  returning `String.prototype`, together with an independent empty
  `Object.create(null,{})`, **must retain one encoded literal**. An
  early overbroad fallback failed this precision test in
  [44943499894](https://github.com/FlareZ123/obfs/actions/runs/44943499894);
  the refined dataflow accepts it.
- The final targeted source at
  `34e91848bad7eb3df3b90f47cee64ddf1345fcec` passed the
  [Ubuntu/Windows Node 22 gate 44943761081](https://github.com/FlareZ123/obfs/actions/runs/44943761081)
  with **89 native/emitted and transform-yield tests per platform**
  and strict JSDoc typechecking. Four real Chromium ESM differential
  fixtures in `test/decoder-object-create-aliased-browser.js` also passed
  the Ubuntu gate. They cover an Object.create capture, computed descriptor,
  map-entry assignment and an unrelated-getter positive case.
- The expanded tests cover SCO, COO and SNO through the direct
  `obfuscateFiles` API; the independent Chromium page covers COO ESM in a
  live browser. These runs are bounded observations on frozen source
  programs, not a general conformance proof.

## Additional independent call-shape challenge

The follow-up source at `23fe241c50c4bc072b0e06717ac8816de687abe1`
[44944002109](https://github.com/FlareZ123/obfs/actions/runs/44944002109)
ran 131 Node tests and four Chromium cases against seven additional
call/descriptor factory spellings on both OSes. It was **122/131
passing** per OS. Six of the nine failures were actual native-vs-emitted
runtime divergence from `let create;({create}=Object)` and
`(0,create)(null,descriptors)`, three cases across SCO/COO/SNO each.
The remaining three computed-key destructure **Number positive**
failures showed zero transform yield rather than different runtime
output; the broader scanner conservatively declined this unproved
dynamic capture.

The incremental guard now recognizes assignment destructuring and
sequence-expression final callees. The computed destructuring positive
test explicitly expects zero encoded literals while retaining native
output equivalence. Source
`51c7bbfa05b0ead33172ce330259a3b6e32045b7` passed
[44944153579](https://github.com/FlareZ123/obfs/actions/runs/44944153579):
**131/131 targeted Node parity/yield tests**, strict JSDoc on Ubuntu
and Windows, plus four Chromium ESM live fixtures on Ubuntu.
The separate alternative call-shape analysis on Agent 1's
`agent1/object-create-alias-red-20261121` branch overlaps this work;
reviewer integration should prefer the narrowest complete proof, and
avoid duplicating independent workflow families.

## Method and replay

The differential test is
`test/decoder-object-create-aliased-map.test.js`, alongside the parent's
`test/decoder-object-create.test.js`.
It compiles with `strings:true, properties:false, identifiers:false`;
executes native and emitted output in isolated Node child processes;
compares full exit status/stdout/stderr before inspecting transform yield;
and pairs each String-prototype unsafe case with a benign Number-prototype
case. Input graph order, deterministic seeds, source versions and CI links
are recorded.

For a local Node 22 reproduction, run
`node --test test/decoder-object-create-aliased-map.test.js test/decoder-object-create.test.js`.
With real Chromium available, run
`node test/decoder-object-create-aliased-browser.js` using
`CHROMIUM_BIN` to select the browser.

## Boundaries and pending validation

The guard is a conservative finite source analysis. It does **not** model
arbitrary mutation via proxies, imported opaque functions, unknown runtime
getters, arbitrary `Reflect.apply` chains, prototype shadowing or
source-level `eval` with a complete interprocedural proof. Different
source spellings can still be unproved and require differential testing.
Literal-transform yield is deliberately forfeited where safety is
uncertain; the positive case catches one gratuitous refusal.

The implementation adds compile-time analysis and no new emitted decoder
instructions for this guard. It does not establish a universal 2.5x
application budget, static reconstruction resistance or dynamic
instrumentation resistance.

The wider `manual-validation.yml` run
[44943116581](https://github.com/FlareZ123/obfs/actions/runs/44943116581)
of an earlier candidate on the older Agent 1 parent branch was **red**
from existing broader suite/legacy assertion failures, followed by a
missing blind-audit artifact. It does not validate the final candidate
and must not be represented as a green full suite. The parent branch
needs reconciliation with mainline's later correctness repairs before
a release-level integration claim or merge.

Next useful research: independent shadowed-scope and mutable descriptor
alias challenges, a current-main source-pinned full suite after upstream
integration, and a compiler-time complexity profile against large
source inventories. This result belongs in `im-results/`.
