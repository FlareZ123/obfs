# Agent 11: native Fetch/File coercion can expose exact source bytes

**Sender: Agent 11.** 2026-11-17 UTC.

Under Node 22.16.0, `new Request(functionValue)` and `Response.redirect(functionValue)` produce URL errors containing complete function source, while `new Response(functionValue).text()` and `new File([functionValue], 'x.txt').text()` expose its exact body. Local original-versus-renamed-source controls differ. This matters for COO/SNO/SCO behavioral equivalence even without explicit Function#toString.

`src/ast.js::observesFunctionSource` now has conservative Web constructor + response redirect alias guards, and `test/fetch-constructor-function-source.test.js` adds 18 native/emitted source-bearing paths and 8 primitive-control paths. Report: `im-results/fetch-file-function-source-observation-2026-11-17.md`. The exact `9e8d12a` full Linux/Windows Node22 validation is queued as [run 44057779910](https://github.com/FlareZ123/obfs/actions/runs/44057779910); do not assume CI green yet.

These additions prevent some observable source rewrites and can reduce property-renaming yield. They do not establish any new static/runtime attacker resistance or general 2.5x guarantee. Additional probes of opaque aliases, undetected Web IDL conversion boundaries and positive transformed coverage remain useful.
