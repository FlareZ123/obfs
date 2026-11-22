# Explicit empty hostname allowlists: fail-closed build admission

22 November 2026. **Intermediate correctness and configuration-policy repair** for COO/SCO/SNO, based on a source-pinned red/green Node 22 regression and two-platform CLI execution. This is not a claim of hostile-runtime execution authorization.

## Reproduced failure

The public compiler and SCO handler previously interpreted `allowedHosts:[]` as though no hostname policy had been requested:

- COO used `options.allowedHosts?.length` to decide whether to emit a hostname guard, causing unrestricted code output for an explicitly empty configured policy.
- SCO initialized its `routingHostnames` filter only for a nonempty list, so an explicitly empty routing allowlist allowed unrestricted Host routing.
- SNO's browser-lock rejection similarly ignored an explicit empty list.
- Invalid zero-length array-like declarations also passed through the COO decision without validation.

These are configuration/admission failures, not demonstrated unauthorized access to private SCO methods. An HTTP Host header itself is forgeable and never a security credential.

Source-pinned red run [45042974353](https://github.com/FlareZ123/obfs/actions/runs/45042974353) at `5d52ed7e03ce349dc2c509fdf7103d9802f59d98`: on both Ubuntu and Windows, the new `test/host-policy-empty-allowlist.test.js` reported exactly **three failures and one passing omission control**. The failures were missing expected exceptions for explicit empty COO/SCO policy, malformed/sparse policy, and explicit empty SNO policy. The omitted-policy COO control continued to execute.

## Repair

The compiler now distinguishes **omission** from **explicit declaration**:

- `allowedHosts === undefined` selects the existing default without a hostname restriction.
- Any supplied COO hostname list is validated and normalized before transforms. The canonicalizer rejects empty lists, non-arrays, sparse arrays, invalid types, and invalid host strings.
- Any supplied SNO hostname option is rejected, since browser host locking is not implemented for SNO.
- SCO builds a routing filter for every supplied list and rejects an empty one during handler creation.
- `src/cli.js` passes `undefined` for its default no-`--host` invocation so COO/SNO/SCO CLI defaults remain backward compatible. The CLI still passes a declared nonempty hostname list when requested.

The repair changes only build/handler initialization admission, apart from the previously separately documented IPv4 canonicalization. It introduces no per-request or repeated-client-execution compute transform.

## Validation and reproduction

- Green hostname policy regression: [45043033724](https://github.com/FlareZ123/obfs/actions/runs/45043033724), exact source `096759afd844caf21d92bb9076a8e83ef8cd1325`, passed the four tests and both strict JSDoc gates on Ubuntu and Windows.
- Independent end-to-end CLI omission regression: [45043150348](https://github.com/FlareZ123/obfs/actions/runs/45043150348), exact source `7a21009e03563f172beed347567d09f2e82e2883`, passed COO output emission and SNO launcher execution without a --host option on both OS runners, along with strict typechecks.
- A complete Node.js full-suite run was dispatched at the same source `7a21009...`: [45043230588](https://github.com/FlareZ123/obfs/actions/runs/45043230588). Check its final status separately before claiming full-suite passage.
- Test sources: `test/host-policy-empty-allowlist.test.js`, `test/host-policy-cli-omission.test.js`, with repaired compiler paths in `src/core.js`, `src/sco.js`, `src/hosts.js`, and `src/cli.js`.

## Security and migration boundary

A service using `allowedHosts:[]` as an explicit deny-all list now gets a configuration error at startup, which prevents accidental unrestricted output. Integrators who intend an unrestricted build should omit the property. This can be a deliberate API migration for callers that previously passed empty arrays as a default.

**A nonempty hostname allowlist still is not runtime authentication.** Host headers are requester-controlled; browser `location.hostname` is observable and modifiable in attacker-controlled runtimes, and COO/SNO have no trustworthy client-side confidentiality boundary. SCO must use trusted server-side `authorizeRead`, `authorizeRpc`, and `authorizeOperation` policies. No universal 2.5× compute guarantee or stronger obfuscation security result follows.

## 22 November follow-up: caller policy getter is a single startup snapshot

An additional regression uncovered repeated reads of the programmatic
`options.allowedHosts` property. A caller-owned getter returning a
nonempty list on its first read and `undefined` on its second could make
the compiler throw or derive inconsistent policy. The repaired compiler
reads the property exactly once, then validates and canonicalizes that
value; the SCO handler already took a single external-options snapshot.
The host-list canonicalizer now also fixes the declared array length
before reading elements and explicitly declines holes.

Reproduction: source-pinned two-platform red
[45043347822](https://github.com/FlareZ123/obfs/actions/runs/45043347822)
at `50d0324f5929ad29f96f7117eed997ad0734e462`;
two new tests in `test/host-policy-snapshot.test.js` cover COO
one-read plus generated VM execution and SNO one-read explicit rejection.
The green [45043418423](https://github.com/FlareZ123/obfs/actions/runs/45043418423)
at `98268345900982c2266f31e8be6cce5e4c13fa92`
**passed both tests and both project/external JSDoc gates on Ubuntu and
Windows**.

This applies to an application passing a getter-bearing configuration
object or mutating its own options during initialization. It does not
make a hostile browser runtime trusted, and it does not claim to solve
all Proxy/object getter behaviors in JavaScript.
