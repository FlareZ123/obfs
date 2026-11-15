# COO multi-file UTF-16 sharding sample

The plain ESM source is [before/main.mjs](before/main.mjs). The four files in
[after/](after/) are actual deterministic output of the opt-in
[`shardTopLevelStrings`](../../workplace/coo-shard-strings.js) experiment.
Two ESM files contain independently permuted numeric shares, a third
contains a decoder, and the original top-level `const` declarations
call the decoder. The generated ESM export names and function behavior
stay the same.

Reproduce on Windows 11 with Node.js 22 and dependencies installed:

```powershell
node examples/coo-shards/build.cjs --check
node --test test/coo-shard-strings.test.js
```

Use `--write` to atomically regenerate the checked-in four emitted files.

This sample deliberately publishes **all** code and all data. An adversary
with the complete COO file group can reverse its XOR/permutation and execute
or copy the implementation. The offset tables and key share are available
without authentication. There is no legitimate cryptographic secret, runtime
integrity anchor, or tamper-resistant domain lock. The measured practical
tradeoff is extra module loading and one-time decode work for reduced
immediate readability of the selected const string initializers.

The transform is experimental and opt-in. It currently supports explicitly
named, nonempty top-level `const` string literals in a single `.mjs` file.
It requires external guarantees about untouched String intrinsics,
unobserved original source spellings, generated path collisions and module
graph loading. It does not claim general semantic equivalence or the 2.5×
whole-program compute bound. See
[`im-results/coo-shard-layout-2026-11-15.md`](../../im-results/coo-shard-layout-2026-11-15.md).
