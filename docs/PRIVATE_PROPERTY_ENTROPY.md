# Private property-name entropy (experimental COO/SNO backend)

This option addresses **one narrow demonstrated attack**, not the general
strong-obfuscation objective. It is disabled by default. Normal builds retain
deterministic behavior; opt in only when intentionally sacrificing byte-for-byte
reproducibility:

    node bin/coo.js --root app --entry entry.mjs --out dist-a --closed-world --seed BUILD_SEED --random-property-names
    node bin/sno.js --root service --entry entry.cjs --out dist-b --seed BUILD_SEED --random-property-names

For **reproducible private naming**, generate a high-entropy 32-byte key outside
the build outputs (for example, a secret manager or a cryptographic random
generator), provide it through a narrowly scoped build environment variable,
and point to the variable **name**, not the value, on the CLI:

    # Inject OBFS_PROPERTY_KEY using a trusted build-secret mechanism (64 hex characters).
    node bin/coo.js --root app --entry entry.mjs --out dist-keyed --closed-world --seed BUILD_SEED --property-key-env OBFS_PROPERTY_KEY

The key itself must never be committed to the repository, logged, embedded in
an output artifact, passed in a process argument, or distributed with COO
files. Do not use an all-zero key, an ordinary password, or a publicly known
string; validating 64 hexadecimal characters alone cannot establish entropy.
With the same secret key and public build seed, outputs are byte-reproducible.
Rotating the private key changes field names while preserving source behavior.

Programmatic API: obfuscateFiles(files,{mode:'coo',seed:'BUILD_SEED',
closedWorld:true,experimentalEntropyPropertyNames:true}). Alternatively,
use experimentalPrivatePropertyKey:'<64-hex-secret>' in the programmatic API.
Do not enable both options; they are mutually exclusive. Both apply to COO,
SNO and the core SCO compilation API. The SCO HTTP handler already uses
an independent private 24-byte CSPRNG nonce for every served script, including
a separate cross-file naming salt at handler construction. Its CLI rejects the
new flag rather than silently accepting an option with no effect.

## Threat model, mechanism, and limits

The ordinary property pass assigns compact identifiers of the form
_p0123456789ab to statically proven private fields. For a named exported ESM
object, the digest depends on its **build seed, emitted file path, public exported
binding name, and original property spelling**. The exported name and file path
remain in the published source. A public/reused/documented build seed makes it
inexpensive to test candidate source property spellings from a dictionary.
Local CommonJS owners also mix the original source byte offset, which an
attacker can enumerate over a bounded file prefix.

With experimentalEntropyPropertyNames:true, the compiler samples a fresh
24-byte CSPRNG value for *property naming only*. With the alternative
experimentalPrivatePropertyKey, it instead HMAC-SHA-256 derives the private
property salt from the 32-byte secret and the public build seed using a
versioned domain separator. It **never writes or returns the private salt or
secret key**. Both file-local and proven cross-file renamers derive their
mappings from that separate salt. The caller-supplied seed continues to control
all other deterministic passes. A matching source program built twice with the same
public seed now has different private field names. The existing own-field
and alias-escape proof is unchanged; no previously unsafe property is admitted
because its hash is secret. Target byte lengths and runtime property-operation
counts are unchanged in the tested fixtures.

A 192-bit private salt does **not** mean each published field has 192 bits of
resistance: emitted named ESM tokens retain 48 digest bits, local tokens 40.
The token alone links all uses of that field across the delivered graph.
An offline attacker can replace these tokens with consistent neutral names
without knowing original names or the private salt. Copying the published
executable source is simpler still. This option cannot hide JavaScript,
prevent DevTools observation, repair an unsound property proof, authenticate
an SCO client, or protect SNO against a full-control server attacker.

**Costs and compatibility:** generated program sizes for tested owners are
unchanged; this is not a universal runtime performance proof. Compile time adds
one cryptographic random generation in fresh-entropy mode (or one HMAC
derivation in secret-key mode) and a per-file salt hash. Fresh-entropy builds
are byte-different and cannot be compared by deterministic hashes; builds
with the same secret key and public seed are reproducible. HTML SRI, exact source serialization, signed bundles, and
downstream content commitments must be reviewed independently. Existing
source-observer/SRI compatibility gates still apply and may decline rewrites.
Reproducible-build requirements favor leaving the option disabled.

## Reproducibility and evidence boundaries

    node --test test/agent8-public-seed-property-dictionary.test.js
    node --test test/agent8-private-property-entropy.test.js
    node --test test/agent8-cli-private-property-entropy.test.js
    node --test test/agent8-private-property-key.test.js
    node --test test/agent8-private-property-entropy-browser.test.js
    node --test test/agent8-private-property-entropy-performance.test.js
    npm run typecheck
    npm run typecheck:external

Offline source-name recovery and seedless neutralization are implemented in
[sims/public-seed-property-dictionary.js](../sims/public-seed-property-dictionary.js)
and [sims/public-property-neutralizer.js](../sims/public-property-neutralizer.js).
Differential ESM and CommonJS fixtures test three genuinely transformed fields,
three core compiler modes, incorrect-seed and incomplete-dictionary controls,
native process outputs, and independently randomized builds.

The evidence is **bounded**: small static field owners, exposed ESM export
names, a publicly known seed for the positive dictionary attack, and an
independently assembled candidate vocabulary. The static neutralization attack
is intentionally limited to programs whose generated digest strings do not
occur as unrelated observable data. No universal proof of confidentiality,
tamper resistance or the strict 2.5x compute ceiling is implied.

Do not treat correct output parity, zero dictionary matches under a private
seed, or nondeterministic file hashes as a release security verdict.
