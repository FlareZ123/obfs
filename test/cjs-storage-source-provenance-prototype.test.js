'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {traceCjsStorageSourceSinks}=require('../sims/cjs-storage-source-provenance');

/**
 * Research-only diagnostic tests for bounded static CJS syntax. A finding
 * describes provenance observed inside a finite admitted grammar. It is not
 * a compiler safety theorem or production rewrite authorization.
 * @param {string} source
 * @returns {ReturnType<typeof traceCjsStorageSourceSinks>}
 */
function inspect(source){
  return traceCjsStorageSourceSinks([
    {path:'entry.cjs',sourceType:'commonjs',code:source}
  ]);
}

test('prototype identifies direct and immutable Storage aliases without blanketing primitives',()=>{
  const findings=inspect([
    "'use strict';",
    'function inspect(){return 7;}',
    'const alias=globalThis.localStorage;',
    'alias.namedSource=inspect;',
    'alias.namedPrimitive="literal";'
  ].join('\n'));
  assert.equal(findings.length,2);
  assert.deepEqual(findings.map(item=>item.classification),
    ['source-sensitive','primitive-control']);
  assert.deepEqual(findings.map(item=>item.receiver),['storage','storage']);
  assert.deepEqual(findings.map(item=>item.value),['callable','primitive']);
  assert.ok(findings[0].receiverTrace.some(x=>x.includes('localStorage')));
});

test('prototype follows interfile CommonJS function exports and factory-returned callable',()=>{
  const helper=[
    "'use strict';",
    'exports.storageOf=function storageOf(){return globalThis.localStorage;};',
    'exports.makeInspector=function makeInspector(){',
    'function inspect(){const sourceSensitive=97;return sourceSensitive;}',
    'return inspect;',
    '};'
  ].join('\n');
  const entry=[
    "'use strict';",
    "const {storageOf,makeInspector}=require('./helper.cjs');",
    'const storage=storageOf();',
    'const inspect=makeInspector();',
    'storage.namedSource=inspect;',
    'storage.namedPrimitive="literal";'
  ].join('\n');
  const findings=traceCjsStorageSourceSinks([
    {path:'entry.cjs',code:entry},
    {path:'helper.cjs',code:helper}
  ]);
  assert.equal(findings.length,2);
  assert.deepEqual(findings.map(item=>item.classification),
    ['source-sensitive','primitive-control']);
  assert.ok(findings[0].receiverTrace.some(x=>x.includes('helper.cjs')));
  assert.ok(findings[0].receiverTrace.some(x=>x.includes('globalThis.localStorage')));
  assert.ok(findings[0].valueTrace.some(x=>x.includes('helper.cjs')));
});

test('prototype tracks nested static record read and interprocedural formal return',()=>{
  const findings=inspect([
    "'use strict';",
    'function forwarding(value){return value;}',
    'function inspect(){return 11;}',
    'const holder={host:globalThis.localStorage};',
    'const storage=forwarding(holder.host);',
    'storage.named=inspect;'
  ].join('\n'));
  assert.equal(findings.length,1);
  assert.equal(findings[0].classification,'source-sensitive');
  assert.equal(findings[0].receiver,'storage');
});

test('prototype separates a shadowed localStorage plain record from a global Storage object',()=>{
  const findings=inspect([
    "'use strict';",
    'const localStorage={};',
    'function inspect(){return 12;}',
    'localStorage.named=inspect;'
  ].join('\n'));
  assert.equal(findings.length,1);
  assert.equal(findings[0].receiver,'record');
  assert.equal(findings[0].classification,'local-record');
});

test('prototype respects captured shadowing of globalThis across function returns',()=>{
  const findings=inspect([
    "'use strict';",
    'const globalThis={localStorage:{}};',
    'function storageOf(){return globalThis.localStorage;}',
    'function inspect(){return 12;}',
    'const storage=storageOf();',
    'storage.named=inspect;'
  ].join('\n'));
  assert.equal(findings.length,1);
  assert.equal(findings[0].receiver,'record');
  assert.equal(findings[0].classification,'local-record');
});

test('prototype emits unknown-host warning instead of treating unproved receiver as safe',()=>{
  const findings=inspect([
    "'use strict';",
    'function inspect(){return 13;}',
    'const storage=unknownStorageProvider();',
    'storage.named=inspect;'
  ].join('\n'));
  assert.equal(findings.length,1);
  assert.equal(findings[0].receiver,'unknown');
  assert.equal(findings[0].classification,'unknown-host');
});

test('prototype declines an opaque side-effecting return instead of guessing Storage',()=>{
  const findings=inspect([
    "'use strict';",
    'function storageOf(){doOpaqueWork();return globalThis.localStorage;}',
    'function inspect(){return 14;}',
    'const storage=storageOf();',
    'storage.named=inspect;'
  ].join('\n'));
  assert.equal(findings.length,1);
  assert.equal(findings[0].classification,'unknown-host');
});

test('prototype refuses dynamic require and mutably assigned aliases',()=>{
  const findings=inspect([
    "'use strict';",
    'function inspect(){return 15;}',
    "const getStorage=require('./unknown-runtime.cjs');",
    'let storage=getStorage();',
    'storage.named=inspect;'
  ].join('\n'));
  assert.equal(findings.length,1);
  assert.equal(findings[0].classification,'unknown-host');
});

test('prototype rejects duplicate CJS paths and non-CommonJS inputs',()=>{
  assert.throws(()=>traceCjsStorageSourceSinks([
    {path:'x.cjs',code:'const x=0;'},
    {path:'x.cjs',code:'const x=1;'}
  ]),/distinct/);
  assert.throws(()=>traceCjsStorageSourceSinks([
    {path:'x.mjs',sourceType:'module',code:'export const x=0;'}
  ]),/CommonJS/);
});


test('prototype must not call a mutated record field proven plain after Storage grafting',()=>{
  const findings=inspect([
    "'use strict';",
    'function inspect(){return 16;}',
    'const holder={receiver:{}};',
    'holder.receiver=globalThis.localStorage;',
    'holder.receiver.named=inspect;'
  ].join('\n'));
  assert.equal(findings.length>=1,true);
  assert.equal(findings.at(-1).classification,'unknown-host',
    'mutable field provenance cannot reuse original inert object-literal proof');
});

test('prototype must invalidate an aliased holder after member reassignment',()=>{
  const findings=inspect([
    "'use strict';",
    'function inspect(){return 17;}',
    'const holder={receiver:{}};',
    'const alias=holder;',
    'alias.receiver=globalThis.localStorage;',
    'holder.receiver.named=inspect;'
  ].join('\n'));
  assert.equal(findings.at(-1).classification,'unknown-host',
    'shared record identity must see field invalidation through any alias');
});

test('prototype must conservatively invalidate a local record after opaque host callback',()=>{
  const findings=inspect([
    "'use strict';",
    'function inspect(){return 18;}',
    'const holder={receiver:{}};',
    'opaqueHostMutate(holder);',
    'holder.receiver.named=inspect;'
  ].join('\n'));
  assert.equal(findings.length,1);
  assert.equal(findings[0].classification,'unknown-host',
    'unmodeled callback could install a Storage receiver into escaped record');
});


test('prototype follows call arguments into a local source-sensitive Storage sink',()=>{
  const findings=inspect([
    "'use strict';",
    'function inspect(){return 19;}',
    'function save(receiver,value){receiver.namedSource=value;}',
    'save(localStorage,inspect);'
  ].join('\n'));
  assert.equal(findings.length,1,
    'a top-level call can execute a named setter hidden in a callee body');
  assert.equal(findings[0].classification,'source-sensitive');
  assert.equal(findings[0].receiver,'storage');
  assert.equal(findings[0].value,'callable');
});

test('prototype follows cross-file CJS exported sink parameter provenance',()=>{
  const helper=[
    "'use strict';",
    'exports.save=function save(receiver,value){receiver.namedSource=value;};'
  ].join('\n');
  const entry=[
    "'use strict';",
    "const {save}=require('./helper.cjs');",
    'function inspect(){return 20;}',
    'save(globalThis.localStorage,inspect);'
  ].join('\n');
  const findings=traceCjsStorageSourceSinks([
    {path:'entry.cjs',code:entry},{path:'helper.cjs',code:helper}
  ]);
  assert.equal(findings.length,1,
    'source-sensitive sink inside helper must be found via exported call');
  assert.equal(findings[0].file,'helper.cjs');
  assert.equal(findings[0].classification,'source-sensitive');
  assert.ok(findings[0].receiverTrace.some(x=>x.includes('localStorage')));
});
