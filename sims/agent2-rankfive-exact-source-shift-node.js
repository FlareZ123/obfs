'use strict';
const { createHash } = require('node:crypto');

const MASKS = [0xc7639c15, 0x32e67ad1, 0xe5ab17c2, 0x4692ed7f, 0x1fa37cc9];
const OFFSET = 0x5a9bc7e1;
const RANK = 5;
const SIZE = 1 << RANK;
const VERIFY_SAMPLES = 726;
const REPLICATES = 100;
const EXPECTED_SOURCE_SHA256 = '2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d';

function shaWord(text) {
  return createHash('sha256').update(text).digest().readUInt32BE(0);
}
function shaStream(label) {
  let counter = 0;
  return () => shaWord(`${label}/${counter++}`);
}
function privateTable() {
  const values = Array.from({ length: SIZE }, (_, i) => shaWord(`private-table-rank5/${i}`));
  values[31] = (values[31] ^ 0x9765c3af) >>> 0;
  return values;
}
const TABLE = privateTable();
function parity32(value) {
  let x = value >>> 0;
  x ^= x >>> 16; x ^= x >>> 8; x ^= x >>> 4; x ^= x >>> 2; x ^= x >>> 1;
  return x & 1;
}
function rotl32(value, amount) {
  const x = value >>> 0;
  return ((x << amount) | (x >>> (32 - amount))) >>> 0;
}
function oracle(input) {
  const x = input >>> 0;
  let index = 0;
  for (let bit = 0; bit < RANK; bit++) index |= parity32(x & MASKS[bit]) << bit;
  const affine = (rotl32(x, 5) ^ rotl32(x, 13)) >>> 0;
  return (affine ^ OFFSET ^ TABLE[index]) >>> 0;
}
function sourceString() {
  return [
    ...MASKS.map((mask, i) => `const OBFS_PRIVATE_MASK${i}=0x${mask.toString(16)};`),
    ...TABLE.map((value, i) => `const OBFS_PRIVATE_T${i}=${value};`),
    'const OBFS_PRIVATE_OFFSET=0x5a9bc7e1;',
    'function obfsPrivateParity(x){',
    '  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;',
    '  return x&1;',
    '}',
    'export async function protectedGenericFive(input){',
    '  const x=input>>>0;',
    '  const z0=obfsPrivateParity(x&OBFS_PRIVATE_MASK0);',
    '  const z1=obfsPrivateParity(x&OBFS_PRIVATE_MASK1);',
    '  const z2=obfsPrivateParity(x&OBFS_PRIVATE_MASK2);',
    '  const z3=obfsPrivateParity(x&OBFS_PRIVATE_MASK3);',
    '  const z4=obfsPrivateParity(x&OBFS_PRIVATE_MASK4);',
    '  const index=z0|(z1<<1)|(z2<<2)|(z3<<3)|(z4<<4);',
    '  const affine=((x<<5)|(x>>>27))^((x<<13)|(x>>>19));',
    '  let nonlinear=0;',
    '  switch(index){',
    ...TABLE.map((_, i) => `    case ${i}: nonlinear=OBFS_PRIVATE_T${i};break;`),
    '  }',
    '  return (affine^OBFS_PRIVATE_OFFSET^nonlinear)>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}',
  ].join('\n');
}
function derivative(directions, ask) {
  let result = 0;
  for (let subset = 0; subset < (1 << directions.length); subset++) {
    let point = 0;
    for (let bit = 0; bit < directions.length; bit++) if ((subset >>> bit) & 1) point ^= directions[bit];
    result ^= ask(point);
  }
  return result >>> 0;
}
function isDifferentially2Uniform(table) {
  for (let delta = 1; delta < SIZE; delta++) {
    const counts = new Map();
    for (let q = 0; q < SIZE; q++) {
      const value = (table[q] ^ table[q ^ delta]) >>> 0;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    if (counts.size !== SIZE / 2) return false;
    for (const count of counts.values()) if (count !== 2) return false;
  }
  return true;
}

function fixedPairPasses(section) {
  for (let q = 0; q < SIZE; q++) for (let delta = 1; delta < SIZE; delta++) {
    const along1 = (section[q] ^ section[q ^ delta] ^ section[q ^ 1] ^ section[q ^ 1 ^ delta]) >>> 0;
    const along2 = (section[q] ^ section[q ^ delta] ^ section[q ^ 2] ^ section[q ^ 2 ^ delta]) >>> 0;
    if (along1 === 0 && along2 === 0) return false;
  }
  return true;
}
function learn(replicate, strategy) {
  const drawWitness = shaStream(`rank5-exact-witness/${replicate}`);
  const drawVerify = shaStream(`rank5-exact-verify/${replicate}`);
  const cache = new Map();
  const ask = input => {
    const x = input >>> 0;
    if (!cache.has(x)) cache.set(x, oracle(x));
    return cache.get(x);
  };
  let witness = 0;
  let anchors = null;
  let witnessTrials = 0;
  for (let trial = 0; trial < 27; trial++) {
    const directions = Array.from({ length: 6 }, drawWitness);
    for (let omitted = 0; omitted < 6; omitted++) {
      const face = directions.filter((_, i) => i !== omitted);
      const observed = derivative(face, ask);
      if (observed !== 0) {
        witness = observed;
        anchors = face;
        witnessTrials = trial + 1;
        break;
      }
    }
    if (witness !== 0) break;
    witnessTrials = trial + 1;
  }
  if (witness === 0 || anchors === null) throw new Error('witness cap exhausted');

  const section = Array.from({ length: SIZE }, (_, y) => {
    let point = 0;
    for (let bit = 0; bit < RANK; bit++) if ((y >>> bit) & 1) point ^= anchors[bit];
    return ask(point);
  });
  if (strategy === 'shift' && !fixedPairPasses(section)) throw new Error('fixed-pair property failed');

  const coordinates = [];
  const corrections = [];
  for (let bit = 0; bit < 32; bit++) {
    const basis = (1 << bit) >>> 0;
    if (strategy === 'signature') {
      let quotient = 0;
      for (let omitted = 0; omitted < RANK; omitted++) {
        const dirs = [basis, ...anchors.filter((_, i) => i !== omitted)];
        const observed = derivative(dirs, ask);
        if (observed !== 0 && observed !== witness) throw new Error('signature overflow');
        if (observed === witness) quotient |= 1 << omitted;
      }
      coordinates.push(quotient);
      corrections.push((ask(basis) ^ section[quotient]) >>> 0);
    } else {
      const f0 = ask(basis);
      const f1 = ask(basis ^ anchors[0]);
      const f2 = ask(basis ^ anchors[1]);
      const candidates = [];
      for (let q = 0; q < SIZE; q++) {
        const l0 = (f0 ^ section[q]) >>> 0;
        const l1 = (f1 ^ section[q ^ 1]) >>> 0;
        const l2 = (f2 ^ section[q ^ 2]) >>> 0;
        if (l0 === l1 && l0 === l2) candidates.push({ q, correction: l0 });
      }
      if (candidates.length !== 1) throw new Error(`shift ambiguity: bit ${bit}, ${candidates.length} candidates`);
      coordinates.push(candidates[0].q);
      corrections.push(candidates[0].correction);
    }
  }

  function model(input) {
    const x = input >>> 0;
    let quotient = 0;
    let linear = 0;
    for (let bit = 0; bit < 32; bit++) if ((x >>> bit) & 1) {
      quotient ^= coordinates[bit];
      linear ^= corrections[bit];
    }
    return (section[quotient] ^ linear) >>> 0;
  }
  for (let i = 0; i < VERIFY_SAMPLES; i++) {
    const point = drawVerify();
    if (ask(point) !== model(point)) throw new Error('verification mismatch');
  }
  return { queries: cache.size, witnessTrials, witness, anchors };
}

async function main() {
  const sourceHash = createHash('sha256').update(sourceString()).digest('hex');
  if (sourceHash !== EXPECTED_SOURCE_SHA256) throw new Error(`source hash mismatch: ${sourceHash}`);
  const top = TABLE.reduce((acc, value) => (acc ^ value) >>> 0, 0);
  if (top !== 0xb1f2257d) throw new Error(`top coefficient mismatch: ${top.toString(16)}`);
  if (!isDifferentially2Uniform(TABLE)) throw new Error('frozen table is not differentially 2-uniform');
  const sourceModule = await import('data:text/javascript;base64,' + Buffer.from(sourceString()).toString('base64'));
  const drawSourceCheck = shaStream('rank5-exact-source-equivalence');
  for (let i = 0; i < 10000; i++) {
    const x = drawSourceCheck();
    const exact = await sourceModule.protectedGenericFive(x);
    if (exact !== oracle(x)) throw new Error(`source/oracle mismatch at ${x >>> 0}`);
  }
  const signature = [];
  const shift = [];
  for (let replicate = 0; replicate < REPLICATES; replicate++) {
    signature.push(learn(replicate, 'signature'));
    shift.push(learn(replicate, 'shift'));
  }
  const savings = signature.map((result, i) => result.queries - shift[i].queries);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const sigQueries = signature.map(x => x.queries);
  const shiftQueries = shift.map(x => x.queries);
  const witnessTrials = signature.map(x => x.witnessTrials);
  if (!savings.every(x => x === 896)) throw new Error(`unexpected savings: ${[...new Set(savings)]}`);
  console.log(JSON.stringify({
    node: process.version,
    source_sha256: sourceHash,
    top_coefficient: `0x${top.toString(16).padStart(8, '0')}`,
    differential_uniformity: 2,
    source_equivalence_checks: 10000,
    replicates: REPLICATES,
    verifier_samples: VERIFY_SAMPLES,
    signature_mean_distinct_queries: mean(sigQueries),
    shift_mean_distinct_queries: mean(shiftQueries),
    mean_savings: mean(savings),
    min_savings: Math.min(...savings),
    max_savings: Math.max(...savings),
    signature_min_max: [Math.min(...sigQueries), Math.max(...sigQueries)],
    shift_min_max: [Math.min(...shiftQueries), Math.max(...shiftQueries)],
    witness_trials_mean: mean(witnessTrials),
    witness_trials_max: Math.max(...witnessTrials),
    matched_deterministic_streams: true,
    note: 'Node deterministic SHA-counter replay; not CSPRNG, production learner, or HTTP evidence'
  }, null, 2));
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
