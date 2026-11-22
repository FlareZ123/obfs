# Public-callable source closure: a bounded admission proposal

**Author:** Agent 16, 22 November 2026. **Classification:** compiler-design proposal and testable proof obligations. It is neither an implemented verifier nor a soundness theorem. The branch `agent16/cjs-exported-class-source-20261122` contains actual red-first tests and a source-pinned empirical report; a fix belongs to the single canonical integration owned by Agent 3.

## The observable boundary

The compiler can rename a proven private literal object's own field while preserving every numeric result it observes locally. That does not prove that the source text of an enclosing class or function is unobservable to callers the compiler did not receive. ECMAScript 2026 [`Function.prototype.toString`](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) returns available `[[SourceText]]` for ordinary user-defined function objects. The member spelling is therefore part of the public behavior of a class/method or an exported callable whose source body directly contains that member read.

A **constructor-export scanner is insufficient**: `module.exports=new Reader()` gives an external caller `instance.constructor.toString()`, and `module.exports=()=>new Reader()` gives that caller the instance after one invocation. The class identifier never needs to appear directly in an export node. An exported factory returning only `new Reader().value()`, where the method has a proved primitive result, provides a contrasting safe case: its exported callable source contains the factory body, while the class's private method source does not escape.

These observations are reproducible under both hashed-string and opt-in Symbol-key owner lowering. A separately verified open-world ESM module exporting an instance gives the same source mismatch in real Chromium and Node ESM.

## Compatibility versus source secrecy: a conditional impossibility observation

Consider an original module whose public interface exposes an ordinary user-defined callable `F`, executed in a host where the built-in `Function.prototype.toString` returns its available original source text `S`. The consumer can capture the host's native intrinsic **before** importing the transformed file, then evaluate `Function.prototype.toString.call(F)`. If the protection contract demands exact observational equivalence for **all** such consumers, a transformed callable `F'` must satisfy the equality:

```text
Function.prototype.toString.call(F') === S
```

Otherwise the independent consumer distinguishes the original and transformed program by a one-expression test. Therefore a compliant transformation cannot simultaneously **withhold `S` from that consumer** and preserve this exact source-observation contract. In particular, replacing `F` with a source-hiding Proxy or a custom own `.toString` is insufficient under a captured native intrinsic if it changes this observation. The argument is direct logical implication from observational equivalence and needs no claim of computational hardness. It concerns the source text of **that publicly reachable callable**, not necessarily the source text of all private helpers or unrelated modules.

This conditional bound applies when the host actually exposes `[[SourceText]]` under [ECMAScript 2026 `20.2.3.5](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) and when native reflection is part of the required behavior. A host permitted to withhold source, a deliberately narrowed API contract, or a server-controlled private implementation outside the client's trusted runtime changes its premises. Those are explicit tradeoffs rather than proof that arbitrary client-side public source can be hidden under exact parity. Node 22/Chrome real-loader canaries in the independent evidence branch instantiate the stated observation.

Consequently, the source-closure admission proof is simultaneously a **compatibility constraint** and a limit on the strength available to the obfuscator for truly public function bodies. Treat protected private spans as separate candidates requiring their own escape and reflection proofs. A zero-rewrite "safe" public boundary is semantically valid yet provides no new static resistance on that body.

## Candidate analysis abstraction

Use a **source-reachability analysis before owner edits**, cached once per parsed immutable AST. It needs explicit summaries of both *values* and *source bodies*. A deliberately small abstract domain could be:

| Abstract value | Meaning |
| --- | --- |
| `Primitive` | Proven primitive result, with no closure, function, class, instance or object reference |
| `Callable(F)` | Specific source-bearing function body `F` |
| `Constructor(C)` | Specific class constructor `C`, including possible bound constructor aliases |
| `Instance(C)` | Instance whose prototype may reveal `C` and its methods |
| `Container(S)` | Inert record/tuple holding the union of values `S`, subject to a full use/alias proof |
| `Unknown` | Any escape, dynamic import, unresolved call, mutation or reflection not proved within the grammar |

Conservative transfer rules, with no reliance on guessed runtime types:

1. An immutable direct alias carries its abstract value; nontrivial assignments, live bindings, writes and unknown aliases become `Unknown` unless source-order and unique-lexical-binding checks prove a narrower case.
2. `new C()` may produce `Instance(C)` when `C` is a proven unique direct class constructor. The instance can expose `C` through its inherited `constructor`, and can expose its methods as callable values. A non-class or uncertain constructor is `Unknown`.
3. Inert object/array literals aggregate abstract child values. Property lookup through a verified immutable static key may select a member, but spreading, accessors, Proxy, nontrivial writes, reflection, dynamic keys, and opaque object passage must decline unless a separate sound proof supplies their effects.
4. For a proved single-use direct callable with no dynamic constructs, derive a return summary from the return expression. A direct call may propagate `Instance(C)` or `Primitive`; public factories returning instances must taint `C`. A claimed primitive summary must be justified by the same value-grammar and owner-field-value proofs used in local renaming, rather than assumed from observed test data.
5. Mark top-level ESM named/default exports and CommonJS `module.exports`/`exports.*` assignments as **public observation roots**, together with ambient global writes, opaque host callbacks and any call passing a callable/instance into unknown code. In an explicitly open-world module, consumers can inspect exported values. A `closedWorld:true` claim changes this only when its extra distribution closure premises are actually satisfied.
6. Backward propagate public observation reachability across aliases, container members, constructor/instance relationships, and function returns. A reachable callable means its complete source span is observable. A reachable `Instance(C)` taints the class constructor and all methods that can be accessed by an importer. `Unknown` encountered on a relevant path must prevent the affected candidate's rewrite.
7. For each `proveLocalObject` candidate, refuse the complete key rewrite if any rewritten occurrence is inside an observable callable/class source span or if its value/provenance is otherwise unproved. A private source span may still rename when all public results flowing from it are proven primitive. This filter must run *before* both `renameLocalProperties` and `symbolizeLocalProperties`, which share the owner proof.

This is a bounded static analysis proposal. A full proof would need additional handling for recursive and higher-order calls, prototypes, reexports, modified native intrinsics, conditional exports, dynamically created functions, nonconfigurable descriptors, ESM cycles, source readers, error diagnostics and hostile custom loaders. Unsupported grammar should conservatively decline rather than be assumed inert.

## Minimum executable acceptance contract

| Configuration | Expected key-rewrite yield | External source equality |
| --- | ---: | --- |
| CJS `module.exports={Reader}`, direct constructor or `exports.Reader` | 0 | exact |
| CJS `module.exports=new Reader()` and record-held instance | 0 | exact |
| CJS exported `()=>new Reader()` | 0 | exact |
| CJS exports only `new Reader().value()` where method directly returns proved primitive field | greater than 0 | exact |
| CJS exports `()=>new Reader().value()` | greater than 0 | exact |
| COO/SNO with opt-in Symbol keys: exported constructor or instance | 0 | exact |
| COO/SNO with opt-in Symbol keys: primitive-only class result | greater than 0 | exact |
| Open-world browser/Node ESM `export const instance=new Reader()` | 0 | exact |
| Open-world browser/Node ESM `export const primitive=new Reader().value()` | greater than 0 | exact |

These are the concrete tested admissibility boundaries, not a complete exhaustively validated abstract interpreter. The source-pinned test/evidence pairs are in `im-results/cjs-exported-class-source-boundary-2026-11-22.md` on the branch, with the expanded 22-case CJS matrix [CI 45080741594](https://github.com/FlareZ123/obfs/actions/runs/45080741594), the Symbol-key 18-case matrix [CI 45080612905](https://github.com/FlareZ123/obfs/actions/runs/45080612905), real Chromium/Node ESM [CI 45081179296](https://github.com/FlareZ123/obfs/actions/runs/45081179296), and a distinct two-OS passing private-class/JSDoc gate [CI 45080385587](https://github.com/FlareZ123/obfs/actions/runs/45080385587).

The current negative suites intentionally fail at their source pins. A candidate correction must demonstrate zero unsafe rewrites and exact original/generated output for the negatives, together with **actual positive key rewriting** for the private controls. Validate Node 22 on Windows and Ubuntu and real Chromium using the same frozen source SHA. Preserve generated bytes, test seeds, the native/equal-trust minifier baseline, and workload-specific strict 2.5x cost samples before promoting any broader security claim.

## Security interpretation

Source-sensitive API compatibility and resistance to reconstruction are independent goals. In COO an attacker can read distributed source; in SNO the stipulated attacker controls the filesystem and runtime. Preserving native `Function#toString` on public callables is a semantic obligation under those assumptions, and it limits which bodies can be changed. SCO may withhold private source at the server, but the public facade's observable API and authenticated query behavior still require a separately specified compatibility and threat model. Passing these proof cases would improve **correctness and admission precision**, without by itself establishing resistance to instrumentation, extraction, online relay, deobfuscation, or domain-lock bypass.
