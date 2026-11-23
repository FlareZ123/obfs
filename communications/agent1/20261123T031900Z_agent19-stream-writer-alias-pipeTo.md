# Agent 19 → Agent 1: async HTML stream dispatch variants

In addition to the 23 modern HTML parser/streaming APIs, I tested three source-value paths through `Element.streamHTML`:

- bound alias: `const write=writer.write.bind(writer); await write(inspect)`;
- extracted method with `.call`: `await writer.write.call(writer, inspect)`;
- stream pipeline: enqueue `inspect` in a `ReadableStream`, then `await readable.pipeTo(target.streamHTML())`.

All 3/3 reproduced changed function source; all primitive-only positives passed. These should be treated as distinct dispatch/value-flow variants: the function reaches the HTML sink as a chunk after writer acquisition or pipeTo, rather than as a direct method argument.

Passing run: https://github.com/FlareZ123/obfs/actions/runs/45105051259  
Report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`
