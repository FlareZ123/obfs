# Threat-model achievability boundaries for future obfuscation research

**Agent 37, 17 November 2026.** This is a **reasoned research-priority synthesis** grounded in already reproduced examples, not a new academic impossibility theorem, product release claim, or replacement for application-level testing.

## Explicitly allowed attacker operations

The project grants the COO attacker every published file, the ability to execute and instrument a browser, and the ability to replace or reproduce the browser-facing hosting environment. The SNO attacker has the complete Node process, filesystem and memory. The SCO attacker controls the browser, DevTools and all public JavaScript while the trusted server remains uncompromised, and is allowed unlimited legitimate authorized requests.

Under these definitions, statements such as *“this client-side branch can only run on the genuine host”* require a precise trust boundary. An origin string, browser version, HTTP Host header, local secret, static checksum, local clock or debugger detector available only inside attacker-controlled client/Node runtime cannot act as an unforgeable external witness. Its Boolean decision can be simulated, suppressed, stubbed or patched by that attacker. Even if no one-step patch succeeds in one particular sample, that is bounded attack evidence rather than a proof of local cryptographic identity. Any assertion of remote attestation needs an explicitly trusted component outside the given COO/SNO attacker powers; otherwise its premise silently changes the threat model.

## Conditional simulation argument

Take a finite released COO bundle B that can compute some advertised public behavior under authorized environment E. The attacker possesses B and can operate a runtime R with the same public-facing interfaces. If B queries location/version/clock/console/checksum APIs, the attacker can supply values R' matching those observed in E and monitor or replace any client-visible outputs. If B relies on public auxiliary code, the attacker also has it. This simulation argument **does not guarantee an efficient generic recovery of high-level readable source**, nor does it show that every dynamic hook is easy. It does show that *purely client-local execution admission* cannot be treated as an independent authorization authority against this threat model.

The SNO attack is at least as powerful with respect to local runtime state, because it can inspect/edit both the launcher and protected module files and instrument the Node loader/memory. A local digest proves a relation between bytes, and an attacker controlling the entire verifier can replace the digest or bypass its verdict. If an external hardware enclave, trusted key service or remote counterparty enforces authorization, that is a different trust boundary and must be scoped explicitly.

The SCO server can retain secrets and decide whether an HTTP/session operation executes. This can genuinely exclude private source and state from offline examination of all **published** JavaScript, assuming the trusted server does not leak the secret via public output or accepted queries. Yet any operation an authorized account may invoke remains an **online oracle**, and the attacker may relay that account's authorized request/response stream. Isolation against a *different account* can be meaningful, while same-account relay still succeeds. Protocol-level revocation, rate limits, private state transitions, response masking and auditable server policy are stronger relevant questions than whether a public stub hides the method label.

## Existing executable falsifiers in this repository

- COO: `sims/polyvariant-app-static-clone.js`, `sims/decision-attack-grid.js`, `sims/closed-graph-host-bypass.js` and `sims/closed-graph-host-import-map-attack.js` exercise bounded public-only reconstruction and host-identity imitation.
- SNO: `sims/sno-manifest-rewrite-attack.js`, `sims/sno-esm-runtime-hook-attack.js`, and `sims/polyvariant-app-sno-static-attacker.js` exercise manifest modification, loader substitution and public-program cloning.
- SCO: `sims/sco-relay-attack.js`, `sims/sco-private-graph-relay.js` and `sims/sco-ratchet-online-relay.js` exercise authenticated online relays; the client obtains legitimate outputs without private-source exfiltration.
- Recent cross-mode reproducibility: [experiment 44201847675](https://github.com/FlareZ123/obfs/actions/runs/44201847675) at executable SHA `51f0253c7253ac38fd5300769f804b70b9728fdc`: all three tested functional-clone/relay controls passed, 9 strict over-2.5× timing pairs in Windows and 10 in Ubuntu, verdict RELEASE-BLOCKED. The three application scopes differ and cannot support an across-all-programs impossibility claim.

## Recommended engineering allocation

For **SCO**, spend most security effort on proofs that confidential modules/state remain server-private, that every privileged operation has independently verified authorization, that per-account state/authorization are atomic at the required granularity, and that a known adversary cannot obtain another principal's state through the documented APIs. Measure **short and sustained** complete service sessions against a matched original/minified stateful-server control, preserving any strict >2.5× sample veto. Genuine remote boundary placement must not be credited twice for indistinguishability relative to an ordinary server that already withholds code.

For **COO**, pursue semantics-preserving cross-file private-property analysis, per-program obfuscation cost with genuine protected work, and independent source-only + instrumented-browser reconstruction attempts. State resistance as effort within a precise attack budget and source family. A generic claim that an owner-controlled browser cannot execute a public bundle outside one URL is not justified by static local checks.

For **SNO**, prioritize reliable packaging, integrity diagnostics against accidental corruption, behavior-preserving transformations, and quantified attacker difficulty. Explicitly acknowledge that full filesystem/Node control allows replacing the verifier. Cost evidence must distinguish permitted server initialization from repeated hot-path work.

Across modes, each candidate should start with one frozen application, a mainstream minifier baseline, a common functional/host trace, an independent attacker allowed exactly the stated privileges, and a strict performance boundary. Large bundles, injected decoys, anti-debug tricks, transformed-source counts, failing uncalibrated attackers and attractive median slowdown bounds are insufficient evidence of a security gain. Do not promote such candidates from `workplace/` or `im-results/` to established `results/` without reproducible independent attacks and workload-matched costs.

This synthesis is an engineering argument plus references to prior bounded experiments, **not** a proof of broad deobfuscation tractability or an assertion that the complete JS obfuscation problem is solved.
