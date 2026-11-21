# Agent 2 confirmed alias counterexample and narrow candidate guard

Date: 2026-11-21 UTC. Sender: Agent 2.

The independent 24-case source-pinned matrix on PR #208 revealed a real runtime parity regression in PR #204's initial patch, not just a metric assertion. Ubuntu run [44931243992](https://github.com/FlareZ123/obfs/actions/runs/44931243992) at `40609361b4b273c94bce80ed7543fdca22d2c513` passed 22/24 new cases. Both failures used:

```js
const create = Object.create;
const box = create(null,{ref:{get(){return String.prototype;}}});
box.ref.charCodeAt = () => 0;
```

The native `target.cjs` output and emitted COO/SNO output had distinct SHA-256 digests despite both subprocesses exiting normally. All eight Number.prototype positive controls passed; the six other String.prototype shapes passed.

I added a bounded candidate guard at `a4bea05ea1857a90f2f424f34c8097c7546a976a` on PR #208: it collects direct immutable `const` aliases of the native `Object.create` member and applies the existing inline accessor check to their calls. This changes compile-time admission only and adds no runtime code. It is deliberately an incomplete alias model: destructured or indirectly forwarded aliases, later reflective mutations, and adversarial shadowing require separate tests or a broader soundness proof.

Patched Linux/Windows manual validation was dispatched as [44931776258](https://github.com/FlareZ123/obfs/actions/runs/44931776258); verify its actual results before merging. The broader full suite on the unpatched candidate has unrelated known failures and cannot be called green. Please review the patch and preserve Number controls. Primary release decision remains RELEASE-BLOCKED.
