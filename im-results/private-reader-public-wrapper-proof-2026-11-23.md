# Source-stable exported wrapper with a private helper: bounded field-owner proof

**Agent 9, 23 November 2026. Intermediate reproducible implementation/correctness evidence.** This is not a result proving confidentiality, dynamic tamper resistance, server authorization, or any universal 2.5× overhead guarantee. Project strong-protection release remains **BLOCKED**.

## Distinguish the two source surfaces

At an unmodified source spelling, an exported `calculate` function may have body `return read(owner)+((x*17)&255);`. A caller can inspect `Function.prototype.toString.call(calculate)`, but that public function body does not spell the field `secretAlpha`. The only source spelling of `secretAlpha` occurs inside unexported, uniquely bound `read`, which can be proven to have only private direct calls. The **owner argument** in `read(owner)` is semantically visible to `calculate` but its static source spelling is not altered when only `read`'s private field key changes.

The prior general `proveLocalObject` safety check rejected *every occurrence of an owner alias inside any unproven function body*, including this unchanged one-argument forwarding expression. It correctly rejected public direct member reads but also rejected genuinely private helper-owner reads by a public wrapper. `observesFunctionSource` and `observesDistributedSource` individually returned `false`; the false refusal was at the owner alias/source-boundary gate.

## Implementation boundary

`src/properties.js` now permits one tightly specified **actual argument** inside an otherwise source-visible function:

1. The owner alias identifier is the **entire and only actual argument** to a nonoptional direct `read(owner)` call. The original caller source contains no key spelling to be changed.
2. The callee is a uniquely bound **local function** already proven to be **private direct-call-only** by existing independent escape and source observer checks. Imported or exported callable values do not get this exemption.
3. The callee has exactly one formal identifier; that formal has already been proved an alias of the same root owner by fixed-point callsite analysis. Identity-return forwarding (`forwardIndex >= 0`) is excluded.
4. Every other member, alias, reflection, export, error-source, and function escape check still applies independently. A public `owner.secretAlpha` expression remains declined. This refinement does not create arbitrary interprocedural dataflow or trust a dynamic call.

The property itself is still renamed by direct AST edits only inside private source; there is no interpretation VM or runtime lookup/dispatch penalty in the emitted hot code.

## Stage and real behavior

- [Pre-patch source-stage matrix 45270389294](https://github.com/FlareZ123/obfs/actions/runs/45270389294) at `2de86ea368d7f277b7bbb39aa6621d581b3d1281`: the straight-line private arrow reader and the isolated, two-file, and three-file owner graphs all reported zero local or cross-file field rewrites in all COO/SNO/SCO modes, despite no high-level function/distributed-source scanner indication.
- [Post-patch stage matrix 45270935166](https://github.com/FlareZ123/obfs/actions/runs/45270935166) at `4f55b083c4401134664511ea3a9a5a2524a0e83a`: same inputs and modes now show **one** rewritten private key in the local wrapper, and **two** in each owner-side ESM configuration; zero in unrelated API/entry files and zero cross-file output changes.
- [Existing native ESM + public-only normalization regression 45270918447](https://github.com/FlareZ123/obfs/actions/runs/45270918447), also at `4f55b083c4401134664511ea3a9a5a2524a0e83a`: `test/function-declaration-reader-proof.test.js` green on Node 22 Ubuntu/Windows and strict JSDoc. The original 3-file import graph calculates identical values in real Node and rewrites two fields. The existing seedless `normalizePublicIsland` attack reconstructs a functionally equivalent source clone for the straight-line helper. **This explicitly limits the confidentiality claim**.
- [Additional positive and negative helper-source grid 45271078573](https://github.com/FlareZ123/obfs/actions/runs/45271078573) at `f8ca40dcff0ee5c2f58c492141d208df1b833168`: COO/SNO/SCO public wrapper retains exact `Function.prototype.toString`, name, arity and returned values over seven input probes while rewriting private one/two field keys; exported helpers, direct public property spelling, hostile extra arguments, reflection and other unproved uses decline.
- [Twenty-two escape differential examples 45271499824](https://github.com/FlareZ123/obfs/actions/runs/45271499824) at `9047585acb55f112a405f22f99bb35ccfbacad38`: on both platforms all native/generated comparisons of public source spelling, return values and own keys, exposed reader source and global host leakage passed. The stronger [host-attachment observer 45271749264](https://github.com/FlareZ123/obfs/actions/runs/45271749264) at `1871c079c4f9e1ee637cac29becc7f714ac02119` also passed on both OS, checking keys on exported callable values and any records exposed as their `.host` properties.

This is **focused** evidence and not a universal graph proof or green full integration. The previous full two-platform run [45269716316](https://github.com/FlareZ123/obfs/actions/runs/45269716316), source-pinned **before the helper change**, retained the two safe-reader positive-yield failures among its 15 failures per platform. A new full run at the post-patch source pin has been dispatched and must be checked separately.

## Costs and limitations

The original and transformed code still invoke ordinary native JS functions and directly read the owner's renamed own field. This removes a conservative false refusal but does not add a VM or data-dependent key lookup. [Focused paired CPU run 45271800494](https://github.com/FlareZ123/obfs/actions/runs/45271800494) at `0a1f4a0c549dcd8674802fdbc1efd76c2c60ff11` passed on Node 22 Ubuntu/Windows and strict JSDoc. It executed **11 alternating pairs**, each with **16,000,000 post-initialization direct calls** to original/emitted exported calculate functions. The emitted output rewrote one field; it was 178 bytes versus 174 original bytes. Linux CPU ratio of medians **0.9981×**, largest sampled paired ratio **1.0077×**; Windows ratio of medians **1.0000×**, largest **1.1596×**. No sampled pair exceeded 2.5×. The evaluator excludes compilation, cold initialization, transport, and build cost and is subject to runner noise; no universal ceiling follows from these samples. Node, browser, and attacker-runtime surfaces must remain separately tested. A hostile runtime able to read every loaded source can reconstruct the private helper regardless of source grammar; the obfuscator cannot promise source confidentiality against such control.

Potential follow-up: verify this exemption against additional nontrivial nested closures and source-stable method wrappers, especially cases whose owners can escape inside objects or getter effects; do not relax the grammar without a concrete native/generated differential and source-only attack control.
