# TypeScript checker-backed comparison engine

This directory contains an independent research alternative to the main `src/` Acorn obfuscator. It is intended for differential correctness comparisons and compiler experiments. The primary public CLI commands in `bin/` currently use `src/`.

## Programmatic API

From the repository root, after installing declared development dependencies:

```js
'use strict';
const {transform} = require('./lib/transform');
const files = {
  'state.mjs': 'export const state={secret:7};',
  'client.mjs': 'import {state} from "./state.mjs"; console.log(state.secret);'
};
const result = transform(files, {seed:'reproducible-example',closedWorld:true});
console.log(result.renamed,result.files);
```

`transform(files, {seed?,closedWorld?})` accepts a map of relative JavaScript paths to full source strings and returns `{files,renamed,diagnostics}`. It preserves unchanged source bytes and relative ES module file names. A seed makes the rename deterministic. The `closedWorld` assertion is valid only when the supplied graph contains every observable source consumer. If any public client or external library can inspect exported shapes, keep it false.

`require('./lib/build').build('coo'|'sno', args)` is a secondary local directory builder. It supports `--input DIR --output DIR [--seed VALUE] [--closed-world] [--allowed-host HOST]`, uses a lock file and temporary-file atomic rename, and requires distinct input/output directories. It is separate from the documented primary CLI and does not produce a SNO integrity launcher.

`require('./lib/sco-server').createScoServer({token})` creates an HTTP service accepting authenticated `POST /obfuscate` requests. Authentication is intended for controlling access to the obfuscation builder, not for proving that delivered client code is safe from reverse engineering. Secure deployment additionally requires TLS, rate limiting, and correct operational authorization.

## Validation

`node --test test/transform.test.js test/modes.test.js test/attack.test.js` exercises local behavior, module flows, mode endpoints and an adversarial static normalization. `npx tsc -p jsconfig.lib.json` runs strict JSDoc typechecking for this engine. `node sims/fuzz.js` runs 33 deterministic semantic cases. Set `OBFS_FUZZ_SEED` to an integer seed and `OBFS_FUZZ_ROUNDS` to a positive number to vary properties. `node sims/benchmark.js` measures hot-path runtime overhead and rejects workloads for which no property was renamed.

## Security boundaries

This experimental pass currently favors correctness over coverage. It transforms a restricted set of primitive-data closed object literals. Many reflective accesses, dynamic code, unknown aliases, methods, destructuring, indirect module references, and opaque property writes are intentionally left unchanged. This cannot guarantee preservation of arbitrary `Function.prototype.toString` observations or arbitrary dynamically evaluated source.

Host strings or environment checks are bypassable under full-control attacker threat models. Static mangled names are also cheaply normalized; see `sims/reconstruct.js`. Security/performance evidence and limitations are maintained in `im-results/comparative-baselines-2026-11-15.md`.
