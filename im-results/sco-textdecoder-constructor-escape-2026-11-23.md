# SCO TextDecoder constructor-recovery source-admission escape (23 November 2026)

## Scope and boundary

This record documents a compiler correctness/admission counterexample in selected **SCO** private code. It is an intermediate result. It does not measure attacker-cost advantage, code secrecy, or universal 2.5× runtime compliance.

Source under review: `src/sco-selective-partition.js::usesUnprovedRelocatedTextDecoder`.

## Concrete pre-fix witness

A selected private export could construct an allowed UTF-8 decoder, recover its native host constructor through `.constructor`, and then construct a legacy decoder with an unapproved label:

```js
export async function protectedOp(){
  const Decoder=(new TextDecoder('utf-8')).constructor;
  return new Decoder('windows-1252').decode(Uint8Array.of(0x80));
}
export function visible(){return 7;}
```

The pre-fix compiler admitted this source even though it refused the direct `new TextDecoder('windows-1252')` spelling. A second variant assigned the initial UTF-8 instance to a local variable before reading its constructor. The original selected client code and relocated Node server would observe different decoder tables on Node 22.16.0 and Chromium 157. The observed legacy bytes are detailed below.

The negative test was added on branch `agent36/sco-textdecoder-instance-escape-20261123` at immutable commit `17475aae43400b0fd45278bee791212b53b0ff6d`. [Manual two-platform graph run 45107965389](https://github.com/FlareZ123/obfs/actions/runs/45107965389) produced **one expected assertion failure per OS**: `Missing expected exception` for the direct `.constructor` recovery. The remaining 87 graph tests passed on each platform. This is the red witness, not a build/environment failure.

## Conservative fix

Commit `c4d4c8cb13d2a64a3745208083ff639bcbdc4bf7` extended the selector's TextDecoder admission scanner:

- Recognize direct `new TextDecoder` instances and propagate aliases only through uniquely bound `const` declarators.
- Admit an instance only as the receiver of a directly invoked `.decode(...)`, including through the proved local aliases.
- Decline `.constructor`, unknown/computed instance properties, first-class escape to reflection/containers/callbacks, and other instance usages without a cross-host provenance proof.
- Preserve existing direct-constructor literal UTF-8 admission and legacy-label refusal.

This is deliberately a bounded conservative refusal, with some harmless instance usages declined until supported by stronger analysis. It does not prove that arbitrary monkeypatched globals, streaming semantics, wire-serialized arguments or host-specific non-default decoder options are equivalent.

The first narrow fix passed 88/88 graph tests and JSDoc on Ubuntu and Windows in [run 45108193379](https://github.com/FlareZ123/obfs/actions/runs/45108193379), pinned at `c4d4c8cb13d2a64a3745208083ff639bcbdc4bf7`.

The regression suite then added reflected/prototype/container escape cases and two positive `const`-alias decode controls. Its intermediate [run 45108323396](https://github.com/FlareZ123/obfs/actions/runs/45108323396) failed only because the preexisting static-graph guard emitted `realm-local prototype access` rather than the new selector diagnostic; static graph had already rejected that input. The assertion now accepts either relevant refusal while retaining the selected-export diagnostic requirement.

The expanded graph regression is fully green in [run 45108424327](https://github.com/FlareZ123/obfs/actions/runs/45108424327), pinned at `1ad859a91fd9df3bcd7a31b01a36f9208a49bebe`, on Ubuntu and Windows with strict `jsconfig.sco-graph.json` JSDoc checks.

## Actual native-browser reproduction

`test/sco-textdecoder-realm-browser.js` now also executes the legacy labels through the extracted `(new TextDecoder('utf-8')).constructor`, alongside the original direct constructor comparisons.

[Native Node/Chromium run 45108372710](https://github.com/FlareZ123/obfs/actions/runs/45108372710) passed at exact source `e62c0517ef2fadfde09110ee6d7a3931c2efd69c`, with Chrome 157.0.8103.78 and both Node 22.16.0 and 22.23.5. It compared 280 decoder cases, including the previous 276 direct UTF-8 cases.

On Node 22.16.0, both directly constructed and recovered constructors differed from Chromium for:

| Label and byte | Node 22.16.0 | Chrome 157 |
| --- | --- | --- |
| windows-1252, 0x80 | U+0080 | U+20AC |
| gbk, 0xff | U+F8F5 | U+FFFD |

Node 22.23.5 matched Chrome on these four direct/recovered legacy calls and all sampled UTF-8 cases. No source-wide browser parity follows from this finite corpus.

## Deployment implications

The change affects compile-time admission only. It adds no output-time interpreter, no runtime wrapper, and no new overhead to the JavaScript emitted for programs still accepted by the selector. The stricter scanner may reject previously accepted code that creates or passes around TextDecoder objects; this is intentional until a bounded semantic proof is available. Source identity, debug tooling, server secrets, RPC authorization, and the project-wide release-blocked decision remain separate questions.

## Second red/green: lexical alias proof must respect scope

A follow-up independent test identified a new false admission in the first instance-escape fix. It used a uniquely named `const decoder=new TextDecoder('utf-8')` **inside an unrelated nested function**, then referenced a free `decoder.decode(...)` outside that function:

```js
function unrelated(){
  const decoder=new TextDecoder('utf-8');
  return decoder.decode(Uint8Array.of(65));
}
return decoder.decode(Uint8Array.of(66));
```

The first implementation treated the nested unique binding as proof for the disconnected outer reference. That was unsound because the outer `decoder` is outside the nested function's lexical environment. [Red run 45108950431](https://github.com/FlareZ123/obfs/actions/runs/45108950431) at `7c4f2f2d5350e2d706d925c20fc29a86dcc57bb4` failed the new missing-exception assertion on both OSs. The preceding all-green run on the earlier, narrower suite remains valid for its stated scope.

The fix now associates each admitted unique `const` alias with its actual immediate lexical `BlockStatement` or `Program` owner. It propagates a source alias only if its use appears inside that source's owner scope, and rejects identically spelled references elsewhere. Other syntactic declaration containers, including for-head environments, are conservatively refused. [Two-platform green run 45109104465](https://github.com/FlareZ123/obfs/actions/runs/45109104465) at commit `296316f09a22766fe176c15e55653f77260e376b` included targeted SCO graph correctness and strict JSDoc.

Further positive tests confirm unique `const` aliases are admitted within nested functions and nested lexical blocks when the references really occur in their defining scope. Negative tests cover an unrelated nested function and a disconnected sibling block. [Expanded two-platform green run 45109203796](https://github.com/FlareZ123/obfs/actions/runs/45109203796) at `02b0b1674f2ff2d014e8c6f42ce55e3372f4e58d` passed the target suite and strict JSDoc. These scope conditions do **not** prove arbitrary JavaScript free-binding safety; they only close this particular decoder-alias proof mistake.

## Further native streaming parity

[Run 45108889681](https://github.com/FlareZ123/obfs/actions/runs/45108889681) at `bc468f406873194b9e42e88ea5a7fd8d361226e0` extended the direct/recovered 280-case native browser comparison with 12 extra UTF-8 **streaming** vectors: multibyte splits, truncated sequences, invalid lead bytes, split and repeated BOM, `ignoreBOM:true`, null/ASCII chunks, and the maximum Unicode scalar. Total **292 cases** with **288 UTF-8 cases**. Node 22.16.0 and 22.23.5 matched Chrome 157 on all 288 sampled UTF-8 cases, with the four known direct/recovered legacy mismatches present only on Node 22.16.0. This is still finite cross-runtime test evidence; streaming input variants, mutable global bindings, abnormal receiver objects, and arbitrary options remain outside a general equivalence claim.

## Full integration baseline

[Full Linux/Windows manual validation 45108507085](https://github.com/FlareZ123/obfs/actions/runs/45108507085) passed at earlier immutable code commit `1ad859a91fd9df3bcd7a31b01a36f9208a49bebe`, **before** the additional lexical alias proof and streaming test. Windows recorded 4,801 Node tests (4,792 passing, nine skipped, zero failed); Ubuntu also passed its full job. This pin demonstrates that the narrower earlier fix integrated successfully, not that the subsequent scope change passed a full-source suite. A later full pin is required for that stronger claim.
