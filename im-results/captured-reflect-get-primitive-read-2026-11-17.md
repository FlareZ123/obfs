# Safe captured Reflect.get precision: a bounded source-graph encoding coverage result

**Status:** intermediate JavaScript compatibility/compiler-precision result; 17 November 2026. **Pinned fully green validation:** [manual-captured-read-proof run 44006012276](https://github.com/FlareZ123/obfs/actions/runs/44006012276), exact source `ba5de9c0155e31347fb3eefde9812d5765bdc4c8`. At that commit Ubuntu Node 22 and Windows Node 22 both passed **75/75** selected source-observation and intrinsic-safety tests, plus strict production JSDoc type checks. Additional independent static attacker parity assertions were added immediately afterward (unverified in the cited run; run the gate again).

## Original positive coverage failure

Agent48 supplied `const get=Reflect.get; const value=get({known:2},'known');` as a witness: a detached read-only reference to `Reflect.get` caused `src/core.js::mutatesDecoderIntrinsic` to classify it as a possible hostile intrinsic mutator and suppress **all** string encoding. The equivalent direct `Reflect.get({known:2},'known')` allowed encoding. This conservative refusal remained behavior-preserving, but wasted otherwise admissible obfuscation work.

The companion negative risk is real: an escaped `Reflect.get` can later be called on `globalThis`, `Array`, `String` or a mutable prototype, returning an intrinsic that another part of the program modifies before a dependent decoder initializes. Permitting every detached read simply because it is a getter would therefore be unsound.

## Implementation and proof contract

The new independent `src/decoder-safe-reads.js::provenLocalReflectGetCaptures(ast)` returns original AST member-reference nodes for a **small, syntactically provable subset** of detached reads. Its AST proof requires:

1. A top-level `const get=Reflect.get` (including constant computed string member name) and no other `Reflect` identifier/global-Reflect reference that might hide lexical or global receiver substitution in the same parsed file.
2. Every use of the capture variable is an immediate unbound call with two arguments, `get(objectLiteral,stringLiteralKey)`, and no other identifier reference, assignment, binding shadow, pass, `.call/.apply/.bind`, or escape.
3. The receiver is a fresh object literal with **only own, noncomputed, ordinary data fields whose values are primitive literal AST nodes**; no method, accessor, `__proto__` mutation literal, spread, dynamic value or nested object. The requested key is a static string literal that names one of those own fields.
4. The surrounding existing `mutatesDecoderIntrinsic` scanner still refuses every ordinary intrinsic mutation and dynamic code compiler as before. Only the already-proven captured `Reflect.get` member node is excused from the first-class sensitive read refusal.

On the standard native `Reflect.get`, these local reads return only unboxed primitive data values. Thus they cannot directly disclose a mutable String or Array constructor/prototype through that call. The program is still assumed to use the ordinary ECMAScript built-ins at evaluation; a hostile runtime can patch intrinsics from outside the compiler's source corpus. No strong hostile-runtime guarantee follows, nor does this syntactic subset aim to exhaust all valid safe reads.

## Reproduction

`test/decoder-safe-captured-read.test.js` proves AST acceptance for safe primitive captures (including multiple calls and a nested use), and refusal for opaque global/array targets, primitive-ownership failure, dynamic keys, accessors, spreads, `__proto__`, method detachment, escape, local shadow, and local/global `Reflect` substitution. It then compiles each of **SNO, COO, SCO** with string encoding explicitly requested, asserts encoded-literal coverage increases for a bounded safe capture and that runtime output exactly matches source. The corresponding unsafe capture is refused, and runtime behavior matches native.

Pooled with `test/ambient-string-reflective-alias.test.js` and `test/string-method-source-observation.test.js` on pinned source, **75/75** tests passed per platform and `npm run typecheck` succeeded. The explicit independent public XOR static-source recovery assertion was added after this green run; it demonstrates that increased string coverage does not produce a new confidentiality barrier (re-run gate for pinned success).

## Limits and next steps

- The proof checks a *single supplied parsed source file*; a preceding opaque module or attacker-replaced global `Reflect.get` can invalidate the native-intrinsic assumption. Source-visible cross-file patches remain subject to the separate existing graph-level intrinsic mutation guard; the full threat model includes more dynamic behavior than this syntactic proof.
- The accepted subset is intentionally small. Direct `Object.getOwnPropertyDescriptor` capture and arbitrary detached call target flow require a separate proof.
- Source-only XOR recovery is complete; do not present this as static deobfuscation resistance. It preserves one more safe group of strings under a targeted opt-in `strings:true` mode.
- This work is a compatibility/protected-work improvement in `im-results/`. It should be challenged using cross-file and reflective mutation canaries before broadening, and is not an academic conclusion that obfuscation is robust.

Related communication: `communications/agent48/2026-11-17T0251Z_agent46_detached-reflect-get-proof-review.md` requests adversarial review. Historical failed run [44005753439](https://github.com/FlareZ123/obfs/actions/runs/44005753439) had **73 green tests**, then a trivial TypeScript non-nullability error, corrected in the next revision and verified by pinned successful [44006012276](https://github.com/FlareZ123/obfs/actions/runs/44006012276).
