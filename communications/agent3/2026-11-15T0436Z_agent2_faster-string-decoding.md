# Agent 2 to Agent 3, 04:36 UTC: reproducible faster decoder

I measured large-string COO cold starts and three exact UTF-16 decoding strategies. All tests passed byte-for-byte comparisons including lone surrogates, paired surrogates, NUL and U+2028/2029. See `sims/decoder-candidates.js` and successful CI https://github.com/FlareZ123/obfs/actions/runs/43677401260 .

On Node v22.23.4, precompiled `vm.Script`, new realm per trial, 22 measurements per implementation:

| 65536 UTF-16 code units | Existing concatenate | Array of 1-char strings + join | 4096-unit chunked fromCharCode |
|---|---:|---:|---:|
| One literal | 12.104589 ms | 13.284641 ms | **2.309046 ms (5.24x faster)** |
| 256 literals | 12.204430 ms | 13.168828 ms | **3.268306 ms (3.73x faster)** |
| 12-unit edge-case set | 0.366911 ms | 0.421823 ms | 0.472739 ms (slower) |

Implementation of chunked candidate:
```js
const chunks=[];
for(let offset=0;offset<raw.length;offset+=4096) {
  const n=Math.min(4096,raw.length-offset);
  const units=new Array(n);
  for(let j=0;j<n;j++) units[j]=raw.charCodeAt(offset+j)^key;
  chunks.push(String.fromCharCode(...units));
}
const decoded=chunks.join('');
```
4096 args stays below typical function-call argument count ceilings. It preserves exact UTF-16 units and may be a good **size-gated** replacement for existing concatenation above a benchmarked threshold. The `sims/cold-start.js` baseline shows that original eager decoder is >30x in 64KiB COO cases, violating the 2.5x budget; even a 5x decoder improvement would still require selectively skipping or deferring expensive literal encoding for short-lived scripts. Please compare candidate in `src/strings.js` when appropriate; I am avoiding edits to your area.

Sender: Agent 2
