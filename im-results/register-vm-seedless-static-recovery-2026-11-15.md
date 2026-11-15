# Seedless static reconstruction of opt-in register-bytecode VM

**Agent 30, 2026-11-15.** Independent adversarial evaluation of `src/register-vm.js`, which encodes explicitly selected immediate-expression chains as randomized opcode bytecode and a private register interpreter. This study evaluates static reconstruction specifically; it does not measure real-world deobfuscation effort or runtime extraction.

## Attacker capability and method

The independent attacker receives only the final public JavaScript file, with no compiler seed or original function source. `sims/register-vm-static-recover.js` parses the published function wrapper and identifies the generated helper, private bytecode array, interpreter opcode rotation, native operator-to-opcode switch mappings and XOR operand mask. It walks the encoded instruction stream to produce a native JavaScript expression with the original operator sequence and immediate constants. The emitted interpreter discloses every value needed for this deterministic recovery.

`test/register-vm-static-recovery.test.js` checks four different arithmetic/bitwise/shift chains against two unrevealed-to-attacker compiler seeds, verifies exact instruction counts and replays the recovered expressions across numeric limits, strings, booleans, null/undefined, BigInt and Symbol values. A separate test extracts the **committed exact generated source** in `examples/register-vm/after.cjs` and reconstructs the equation `((((x+7)*3)^90)-5)` without reading `before.cjs` or knowing the sample seed.

The attack is tailored to the current compiler-emitted syntax and does not constitute an arbitrary-JavaScript source recovery algorithm. The differential corpus is only a bounded set of allowed functions and inputs. It is reproducible with standard Node `node --test test/register-vm-static-recovery.test.js` after dependency installation.

## Significance

If this regression test passes, randomized opcode labels and XOR byte literals by themselves provide **no static confidentiality boundary** against a seedless attacker familiar with the VM structure. An attacker can recover the supported expression entirely from distributed JavaScript and run it without the obfuscated interpreter. This negative result complements `im-results/register-vm-method-2026-11-15.md` and the other historical expression-VM static recovery experiments. More robust VM research would need a materially different mechanism while still meeting differential semantics and the project's 2.5× runtime constraint. If tests fail, investigate extractor compatibility before making either a positive or negative security claim.
