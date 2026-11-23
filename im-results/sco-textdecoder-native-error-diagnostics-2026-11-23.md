# SCO TextDecoder native error-message relocation witness (23 November 2026)

## Source pins, status, and observed boundary

This is **intermediate cross-host JavaScript behavior evidence** for selected server-controlled obfuscation (SCO). It concerns the exact native TypeError `.message` returned by decoding errors when selected code migrates from Chromium to Node. It establishes no novel secrecy, hostile-runtime anti-debugging protection, environment admission guarantee, or 2.5× application CPU compliance.

- Browser comparison reproducer: `test/sco-textdecoder-fatal-diagnostics-browser.js` on `agent36/sco-textdecoder-fatal-diagnostics-20261123` at `e987ccf2aaecdade5feec9d9b2aec2737dad3ee1`.
- Exact two-platform [manual native CI 45110937635](https://github.com/FlareZ123/obfs/actions/runs/45110937635) passed against real Chrome 157.0.8103.78 and Node `22.16.0`/`22.23.5`. The CI job passed because it records and asserts observable test structure, **not** because all messages matched.
- Compiler counterexample red: `test/sco-private-host-effect-closure.test.js` at `b195c30680829b856bf87f260a3b0db2e5e2b870`, [graph run 45111301949](https://github.com/FlareZ123/obfs/actions/runs/45111301949), deliberately failed the `assert.throws` negative admission assertion on Linux and Windows. The selected compiler admitted the unsafe source shown below.
- Related SCO hardening: draft [PR #324](https://github.com/FlareZ123/obfs/pull/324). The independent native repro resides on a separate experimental branch to keep the compiler change isolated.

## Concrete witness

```js
export async function protectedOp() {
  try {
    return new TextDecoder('utf-8', { fatal: true })
      .decode(Uint8Array.of(0x80));
  } catch (error) {
    return error.message;
  }
}
export function visible() { return 7; }
```

A native malformed-UTF-8 failure exists in both hosts, but the observable `TypeError.message` differs. Node 22.16.0 and 22.23.5 gave `The encoded data was not valid for encoding utf-8`. Chrome 157 gave `Failed to execute 'decode' on 'TextDecoder': The encoded data was not valid.`.

A second witness `new TextDecoder('utf-8').decode('bad')` fails with a host-specific native TypeError message due to an invalid input type, irrespective of `fatal`.

## Differential corpus

The 13 sample source calls include one valid fatal ASCII decoding control, seven malformed/truncated/fatally decoded UTF-8 vectors (including streaming splits), one BOM-handling valid case, and four invalid argument type cases (string, object, number, null). **11/13** resulting `{ok,name,message}` tuples differed between native Node and Chromium on each tested Node version.

| Failure family | Cases mismatched | Node 22.16.0 / 22.23.5 message | Chromium 157 message |
| --- | ---: | --- | --- |
| Malformed UTF-8 with `fatal:true`, including streaming | 7 | `The encoded data was not valid for encoding utf-8` | `Failed to execute 'decode' on 'TextDecoder': The encoded data was not valid.` |
| Invalid `decode` arguments | 4 | `The "list" argument must be an instance of SharedArrayBuffer, ArrayBuffer or ArrayBufferView.` | `Failed to execute 'decode' on 'TextDecoder': parameter 1 is not of type 'ArrayBuffer'.` |

Both hosts threw `TypeError` for these tested cases. Equality of `error.name` therefore does **not** imply equality of externally observable `error.message`, `error.stack`, or serialized RPC failures.

## Conservative admission strategy

The follow-up compiler guard in `src/sco-selective-partition.js::usesUnprovedRelocatedTextDecoder` declines bodies that both construct a native TextDecoder and include a catch clause, without claiming interprocedural exception provenance. It also declines direct decode calls whose literal/array/object argument is clearly not an `ArrayBuffer` or view. These guards intentionally overapproximate; they do not prove arbitrary decoded bytes, callbacks, stream boundaries, other WebIDL native error surfaces, or monkeypatched globals preserve all error behavior.

The exact scope and CI state of the compiler correction must be stated with its own final source pin after validation. Browser comparison data does not automatically validate compiler admission.

## Reproduction

Checkout the immutable native test revision `e987ccf2aaecdade5feec9d9b2aec2737dad3ee1` and run `test/sco-textdecoder-fatal-diagnostics-browser.js` in the existing `manual-sco-textdecoder-compat.yml` matrix. The script invokes installed Chrome through the pinned CI runner and compares native Node results; it uses only standard Node modules and explicitly exported browser DOM data. Inspect the logged `mismatches` field, which captures exact Unicode strings and messages. For compiler admission, execute the two-platform `manual-sco-graph.yml` workflow on the negative test pin above.
