# CommonJS class source reaches undeclared importers (22 November 2026)

**Author:** Agent 16. **Classification:** independently reproduced compiler semantic-parity counterexample. The compiler source was unchanged in this witness branch. This is not an obfuscation-confidentiality theorem, a new backend, or a release candidate.

## Tested compiler, execution boundary, and protected work

The exact source `c2d22fa77fe0557cf36c9b07efc358fa2c103a45` introduced `test/cjs-exported-class-source.test.js` on the branch `agent16/cjs-exported-class-source-20261122`. The focused [Ubuntu and Windows run 45080021563](https://github.com/FlareZ123/obfs/actions/runs/45080021563) exercised six negative export shapes (three direct-class exports in both COO and SNO) and two genuinely private positive controls: **six failures, two passes on each OS**.

The subsequent exact source `5b17a6039092483a667f1e6ad26fbd8e3818d176` expanded the same test with two exported-instance shapes per mode. Focused [Ubuntu and Windows run 45080216395](https://github.com/FlareZ123/obfs/actions/runs/45080216395): **12 tests per OS, 10 failures, two passes**. Both runs executed Node 22.23.4, using the actual CommonJS loader and separate Node processes for an importer that the obfuscator did not receive as a source file. The workflow result is intentionally **red** because the semantic contract is violated; later workflow steps after the failed test are not certified by these runs.

## Minimal counterexample

Original `entry.cjs`:

```js
const owner={privateField:7};
class Reader{value(){return owner.privateField;}}
module.exports={Reader};
```

The independent external consumer loads the file and reads:

```js
const {Reader}=require('./entry.cjs');
const observed={
  result:new Reader().value(),
  classSource:Reader.toString(),
  methodSource:Reader.prototype.value.toString()
};
```

The numeric result is always 7. The compiler renames exactly **one** private own field in both modes. Under COO, the importer observes `owner._p6eef486119` inside the class and method source; under SNO, `owner._pdfebd45027`. Native input instead exposes `owner.privateField`. Thus source-observable behavior differs despite equal numeric behavior.

The six initial failing shapes cover `module.exports={Reader}`, `module.exports=Reader`, and `exports.Reader=Reader` in both modes. The four additional failures cover `module.exports=new Reader()` and `module.exports={reader:new Reader()}` in both modes: an importer obtains the escaped instance, then reads `instance.constructor.toString()` and `instance.value.toString()`. The latter is important because **the class itself need not appear in the module's export syntax**.

The positive controls export only `new Reader().value()`, a primitive numeric result. Their source remains behaviorally identical after the same one-field obfuscation, and `metrics.properties > 0` in both COO and SNO. This ensures that global blanket disabling of all class-contained fields is not an adequate regression fix.

## Same source-observation defect in the opt-in Symbol-key backend

The distinct experimental `experimentalSymbolKeys:true` backend reuses `proveLocalObject` through `src/symbol-properties.js`, but emits computed Symbol-key references instead of hashed string-key references. Exact branch source `d8796d2b8db684dc05e35ac38ef8e6548c4b2e22` adds four external observer negatives (public class and public instance in COO/SNO), plus two genuine private Symbol-key positive controls. [Ubuntu/Windows focused run 45080612905](https://github.com/FlareZ123/obfs/actions/runs/45080612905) observed **18 tests, 14 semantic failures and four private positive passes per OS** for both backends combined. The four new public Symbol-key negatives fail class/method source equivalence even though numeric behavior agrees; each private positive still transforms a real own key. Thus a narrow fix to ordinary hashed-string property editing alone would leave the experimental Symbol transform's shared source-reachability defect.

## Interprocedural exported-factory boundary

At source SHA `5c6c75a3e6e0a97866782832f0daa1f61d0c191a`, [Ubuntu/Windows run 45080741594](https://github.com/FlareZ123/obfs/actions/runs/45080741594) added a public factory returning a class **instance**, which remains source-observable outside the compiler group, and a factory returning only `new Reader().value()`, a primitive **number**. The former fails native/emitted source equivalence in COO and SNO. The latter passes exact external importer result/source equality **and retains a nonzero private-field rename** in each mode.

The expanded combined suite has **22 tests per OS, 16 source parity failures and six private positive controls**. It is insufficient merely to scan for directly exported `Reader` class identifiers or for all exported factory functions indiscriminately: the instance-return path leaks constructor source, while the primitive-only return path demonstrates useful safe protection.

## Separate green build-quality and private-yield control

The focused [Ubuntu/Windows run 45080385587](https://github.com/FlareZ123/obfs/actions/runs/45080385587), source SHA `6e4a681da3982b116d3e99fb1b846635617d8903`, used `test/private-class-source-yield.test.js` as the passing focused selection. **Both OS jobs passed** the positive private-class fixture, strict project JSDoc and strict external-tool JSDoc. This certifies that the added files typecheck within the checked configurations. The red 12-case class-source suite was not selected in this run and remains 10/12 failing at its separate `5b17a603` pin. The positive check does not repair or supersede the red proof.

## Language-standard support for the observation contract

ECMAScript 2026 §20.2.3.5 [`Function.prototype.toString`](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) specifies returning available source text for callable objects carrying a `[[SourceText]]` slot. The negative fixtures observe the source of real Node-defined class and method objects in the same host before and after compilation. Since the emitted `[[SourceText]]` changes under either private-key backend, external importers can distinguish the variants through that standard language operation. The spec permits host source unavailability, so the **measured** finding is stated for Node 22.23.4 on Ubuntu/Windows, rather than asserting every browser/host must reveal the same bytes.

## Proof obligation and bounded interpretation

The current local owner alias proof in `src/properties.js` sees a class-method read of a private literal owner but cannot establish whether the method's **callable source text** is externally observable. A CommonJS module may export a class, an instance, a bound constructor, or another alias that exposes that body. An undeclared importer may use `Function.prototype.toString` without any `.toString` token inside the compiler's input set.

A conservative correction should prove that the callable object and any instance constructor source are unobservable outside the stated compilation boundary before rewriting property references inside their bodies. Failing that, preserve those references and their enclosing source spellings. Preserve separate genuine positive-yield cases such as privately constructed classes whose result is only a primitive.

This test does not establish all possible external reachability paths or guarantee that the same fix covers custom loader and reflection routes. It does not test strong attacker resistance, source secrecy, a 2.5× runtime budget, browser ESM, or the SCO private partition. An external observer already controls and can read its CJS file under the SNO threat model, which is a separate security question.

The source-pinned findings were sent to Agent 3, the canonical source-observer integrator, at `communications/agent3/20261122T2253Z_agent16_cjs-exported-class-source.md`. Keep this branch as a deterministic **red-first** evidence target until a single integrated current-main-based fix and its independent positive control have passed on the same source commit.
