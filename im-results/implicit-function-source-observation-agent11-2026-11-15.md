# Implicit function-source coercion in JavaScript: reproducible compatibility boundaries

**Date:** 2026-11-15. **Contributor:** Agent 11. **Status:** intermediate experimental evidence, not a universal preservation theorem.

## Motivation

A native JavaScript function's text can be observed without spelling `Function.prototype.toString()`. Therefore, an AST transformation that otherwise preserves ordinary return values can change the output of a surrounding program by rewriting a function body, a local binding, a property key, or a literal. The JavaScript 2026 language specification defines `ToPropertyKey(argument)` via `ToPrimitive(argument, string)`, then `ToString` for nonsymbol primitives: https://tc39.es/ecma262/2026/multipage/abstract-operations.html .

The experiments used Node.js 22 and native ESM/CommonJS loaders, differential executions of exact input/output source, and explicit positive controls. They reveal distinct source-observation sinks:

| Sink | Mechanism | Regression file |
| --- | --- | --- |
| `RegExp(fn)`, `Symbol(fn)`, `Symbol.for(fn)`, URI codecs, and aliases | standard conversion to string exposes a native function's spelling | `test/builtin-source-coercion.test.js` |
| `target[fn]`, `{[fn]:value}`, computed class method keys, `fn in target`, `Reflect.set/get`, `Object.defineProperty` | a property key coerces a function into a string | `test/property-key-source-observation.test.js` |
| Imported ESM named or namespace functions and required CommonJS exports used as property keys | a source observer in the consumer can reveal rewritten source in a different supplied file | `test/cross-file-key-source-observation.test.js` |
| `Error(fn).message`, `new TypeError(fn)`, `new AggregateError([],fn)`, aliases/call/apply | error constructors stringify the message argument (second argument for AggregateError) | `test/error-source-coercion.test.js` |
| `fn == exactOriginalSource`, `fn >= exactOriginalSource`, aliased/reversed forms | loose comparison invokes `ToPrimitive`; strict equality does not | `test/implicit-comparison-source.test.js` |

## Fix and scope

`src/ast.js` now conservatively recognizes these known source sinks in `observesFunctionSource(ast)`. It collects local function and class identifiers, direct aliases, imported ESM bindings, namespace member uses, simple CommonJS require aliases, native constructor aliases, and static string aliases before scanning for source observers. The presence of a syntactically recognized observer declines source-spelling transforms in the affected file. A multi-file group currently declines all local and cross-file source-spelling transforms if an observer occurs in any supplied file because arbitrary function provenance is not fully traced.

The changes are compile-time gating. They add no interpreter, decoder, or branch in the generated program. Positive controls retain a local rename when computed property keys are primitive-only, strict equality is used, or constructors take literal message strings.

Commits:
- `e8d7310` test and `aa77b665` builtin coercion fix.
- `6524bff` test and `f276318` computed-key fix.
- `2a1bf696` cross-module test and `3629fac` import/require observer fix.
- `211a6f` error test and `98a34a8` error constructor fix.
- `327f8de` comparison test and `c86efeb` comparison fix.

## Before and after empirical checks

All tests are part of the repository's manually dispatched `manual-validation.yml` on Node.js 22 Linux and Windows. Pre-fix failure logs establish the defects; post-fix logs establish that the new cases pass. Full-suite status is assessed independently because multiple agents add new tests while other work remains in progress.

| Program | Pre-fix failing targeted cases (both platforms) | Post-fix targeted cases |
| --- | --- | --- |
| Builtin coercion | [43688974424](https://github.com/FlareZ123/obfs/actions/runs/43688974424) | 20/20 pass in [43689044634](https://github.com/FlareZ123/obfs/actions/runs/43689044634) |
| Computed keys | 11 failures in [43689603744](https://github.com/FlareZ123/obfs/actions/runs/43689603744) | 13/13 pass in [43689674747](https://github.com/FlareZ123/obfs/actions/runs/43689674747) |
| Cross-module keys | 4 failures in [43689926520](https://github.com/FlareZ123/obfs/actions/runs/43689926520) | 4/4 pass in [43690075505](https://github.com/FlareZ123/obfs/actions/runs/43690075505) |
| Error constructors | 14 failures in [43690240843](https://github.com/FlareZ123/obfs/actions/runs/43690240843) | 15/15 pass in [43690314525](https://github.com/FlareZ123/obfs/actions/runs/43690314525) |
| Loose/relational comparisons | 6 failures in [43690521671](https://github.com/FlareZ123/obfs/actions/runs/43690521671) | 7/7 pass in [43690551102](https://github.com/FlareZ123/obfs/actions/runs/43690551102) |

The latest comparison CI has one additional existing `test/interfile.test.js` positive-coverage expectation failure, `crossFile.objects=0` instead of 1. Native program output remains correct. The import-aware source guard conservatively treats ESM `partial as a,b` as potentially functions when those values appear in `a+b`; their numeric nature is not yet proved. This is a meaningful **obfuscation coverage regression** from the soundness guard. Agent 7 was informed by `communications/agent7/2026-11-15T0739Z_agent11_interfile-source-guard.md`. Recovering this case safely requires a strong cross-file non-function proof, not merely removing the guard.

## Threat model and limitations

- The observed compatibility boundary concerns preservation of JavaScript's native source text. Many additional source-sinks and reflective patterns remain: arbitrary `@@toPrimitive`, dynamic or monkey-patched methods, runtime-generated code, exotic host APIs, escaped function aliases, and external consumers not provided to the compiler.
- Monotone alias sets are syntactic and not complete lexical scope/assignment analysis. They can cause conservative false positives. A malicious program could also exploit untracked alias shapes that cause false negatives. This guard must not be sold as a complete semantics proof.
- Whole-program source preservation reduces transformations, potentially substantially. The current experiments do not quantify a general obfuscation/security-strength improvement, nor demonstrate arbitrary-program equivalence.
- COO and fully compromised SNO cannot enforce tamper resistance against attackers controlling the execution environment. SCO can keep protected implementations on the authorized server, subject to authentication and oracle leakage.
- No universal 2.5× CPU bound is established. These static guards add no generated runtime overhead, but total pipeline behavior and attack resistance require independent benchmarking and red-team evaluation.

## Follow-up

Develop an intermodule, interprocedural summary that can prove imported values are definitely nonfunctions, and use it to avoid blocking safe numeric dataflow without reintroducing the native-source discrepancy. Continue differential testing against new ToPrimitive sinks and reflective prototype access. Material belongs in `im-results/` until evidence supports a genuinely novel, externally reproducible academic conclusion.
