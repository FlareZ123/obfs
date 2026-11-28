# SCO WebAuthn credential authority namespace (experimental)

`createScoWebAuthnAdmission` accepts an optional, stable, application-owned
`credentialAuthorityId` when separate WebAuthn credential registries share the
same relying-party ID, browser origins and assertion policy. This targets trusted
SCO server deployments with experimental shared-state adapters; it is not
client-side COO protection or an SNO hostile-runtime guarantee.

```js
const {createScoWebAuthnAdmission}=require('./src/sco-webauthn-admission');
const {createScoWebAuthnSqliteStore}=require('./src/sco-webauthn-state');

const store=createScoWebAuthnSqliteStore('/var/lib/myapp/tenant-a-webauthn.sqlite');
const gate=createScoWebAuthnAdmission({
  rpId:'example.com',
  allowedOrigins:['https://login.example.com'],
  credentialAuthorityId:'production/tenant-a/webauthn-registry-v1',
  stateStore:store,
  lookupCredential:myTrustedLookup,
  updateSignCount:myAtomicCredentialCounterCAS
});
```

`myTrustedLookup` and `myAtomicCredentialCounterCAS` are placeholders for
application-provided callbacks, not functions exported by this repository.
The authority ID is a **public label, not an API key or bearer token**.
Choose 1–128 printable, nonspace ASCII characters. Supply the **same** stable ID
to all replicas of the **same** credential registry, principal namespace and
atomic signature-counter policy. Give independent registries **different** IDs,
even if their RP ID, browser origin and UV policy are identical. Never derive it
from HTTP headers, browser-controlled data or an untrusted principal.

The gate binds the label into a distinct versioned SHA-256 policy fingerprint,
checked atomically by the memory/SQLite state store. Differing fingerprints
refuse coexistence at construction. An omitted label retains the **exact old
v1 fingerprint** and cannot share a store with a labeled gate. This rejects
accidental mixing **only when correct labels are supplied**. A matching label
does not prove callback or credential-registry identity. Two unlabeled same-policy
gates can still suffer the pre-existing mixed-registry misconfiguration.

For SQLite, migrate a legacy unlabeled database via a newly approved storage
namespace and coordinated state transition. An existing database bound to the
v1 hash deliberately refuses a labeled gate. Do not circumvent that refusal
by editing its policy hash or dropping revocation records without a reviewed
migration plan.

The label cannot address clock skew, credential enrollment, callback-specific
semantics, stolen bearer tokens, authorized online relaying, hostile client
instrumentation, or source reconstruction. Overall three-mode strong-protection
release status remains **RELEASE-BLOCKED**.


## Optional cryptographic authority-key identity (provisional v3)

A trusted SCO deployment may additionally supply
`credentialAuthorityKey: Buffer` containing an **application-managed,
persistent, uniformly random 32-byte secret**, independently generated for
each distinct credential registry. Replicas of one authority must share
the **same** key. Obtain it from a trusted server-side secret manager; do not
embed it into browser-distributed COO/SCO JavaScript, logs, response payloads,
source maps or unauthenticated configuration. Never regenerate a fresh key on
each worker startup, or replicas will correctly refuse their shared store.

For a key-bearing gate, construction computes a SHA-256 domain-separated
digest of the key, then includes that digest in the **v3** policy tuple. The
existing atomic store configuration check rejects a peer with a **different
key even if both peers accidentally use the same `credentialAuthorityId`**.
No key bytes are stored in `ScoWebAuthnStateStore` or returned by this helper.
The policy hash is not a bearer MAC and does not authenticate browser requests.
The key identity is computed **once at gate initialization**; ordinary token
authorization and verification remain unchanged.

Versioning is intentionally strict:

- With neither label nor key, use the unchanged **v1** policy fingerprint.
- With a label and no key, use the unchanged **v2** label fingerprint.
- With a key (with or without a label), use a distinct **v3** fingerprint
  containing the key's domain-separated digest and the optional label.

An already-bound v1/v2 SQLite database deliberately refuses v3; coordinate
a new namespace and migration with the original application rather than
rewriting the policy table or losing revocation history. Rotating a key likewise
requires a planned transition of challenges/sessions and all replicas.

**Limitations:** The helper cannot prove that callback implementations, credential
enrollments or principal namespaces are equal. Copying the **same key and
label** into two unrelated registries still permits the original cross-admission
misconfiguration, intentionally covered by a negative-control test. An
untrusted or compromised SCO server can also deliberately lie. This is an
application-owned identity assertion with high-entropy collision separation,
not general hardware attestation, an end-user authorization scheme,
source secrecy, replay-proof CAPTCHAs or a universal 2.5× compute guarantee.
