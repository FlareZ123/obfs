'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {parse,walk,applyEdits}=require('../src/ast');

/**
 * Intentionally public source-only attacker. Given the published CommonJS
 * text and no seed or compiler-private records, rename the hashed private
 * field back to a deterministic neutral key across the object, its member
 * uses and the literal in-operator probe.
 *
 * This is a bounded static reconstruction counterexample, not a general
 * arbitrary-JavaScript deobfuscator. The original source is never passed in.
 *
 * @param {string} published
 * @returns {{source:string,renamed:number}}
 */
function recover(published){
  const ast=parse(published,'commonjs');
  /** @type {string|null} */
  let key=null;
  walk(ast,node=>{
    if(node.type!=='ObjectExpression')return;
    for(const field of node.properties){
      const value=field.key.type==='Identifier'?field.key.name:field.key.value;
      if(typeof value==='string'&&/^_p[0-9a-f]{10}$/u.test(value)){
        if(key!==null && key!==value)throw new Error('Expected one private key');
        key=value;
      }
    }
  });
  if(key===null)throw new Error('No protected property exists');
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  walk(ast,node=>{
    if(node.type==='Property' && node.key.type==='Literal' &&
        node.key.value===key && node.kind==='init') {
      edits.push({start:node.key.start,end:node.key.end,text:JSON.stringify('x')});
    }
    if(node.type==='MemberExpression' && !node.computed &&
       node.property.type==='Identifier' && node.property.name===key){
      edits.push({start:node.property.start,end:node.property.end,text:'x'});
    }
    if(node.type==='BinaryExpression' && node.operator==='in' &&
       node.left.type==='Literal' && node.left.value===key) {
      edits.push({start:node.left.start,end:node.left.end,text:JSON.stringify('x')});
    }
  });
  if(edits.length<3)throw new Error('Expected owner, direct read and in check');
  return {source:applyEdits(published,edits),renamed:edits.length};
}

/**
 * @param {string} code
 * @returns {(n:number)=>number}
 */
function load(code){
  /** @type {{exports:unknown}} */
  const module={exports:null};
  vm.runInNewContext(code,{module},{timeout:1000});
  assert.equal(typeof module.exports,'function');
  return /** @type {(n:number)=>number} */ (module.exports);
}

const original=[
  "'use strict';",
  'const owner={secretField:21};',
  'module.exports=function run(n){let total=0;',
  'for(let i=0;i<n;i++){if("secretField" in owner)',
  'total=(total+owner.secretField+(i&3))|0;}return total;};'
].join('');

for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])){
  const output=obfuscateFiles([
    {path:'protected.cjs',sourceType:'commonjs',code:original}
  ],{
    mode,seed:'in-public-static-attacker-'+mode,
    strings:false,identifiers:false
  });
  assert.equal(output.files[0].metrics.properties,1);
  const published=/** @type {string} */ (output.files[0].code);
  // Recovery receives only published source, not the first-party original.
  const start=performance.now();
  const recovered=recover(published);
  const attackerMs=performance.now()-start;
  const reference=load(original);
  const attack=load(recovered.source);
  const emitted=load(published);
  for(const n of [0,1,2,3,7,23,127,1024,10000,100000]){
    assert.equal(attack(n),reference(n),String(n));
    assert.equal(emitted(n),reference(n),String(n));
  }
  console.log('OWN_IN_STATIC_RECOVERY '+JSON.stringify({
    mode,attackerInput:'published source only, no compiler seed',
    recoveredNeutralField:'x',replacedTokens:recovered.renamed,
    publishedBytes:Buffer.byteLength(published),
    recoveredBytes:Buffer.byteLength(recovered.source),
    referenceBytes:Buffer.byteLength(original),
    wallClockAttackerMs:attackerMs,heldoutComparisons:10,
    independentAlgorithm:'AST locate hashed object key and its literal membership/direct reads',
    caveat:'This tiny single-owned-field example does not represent arbitrary application recovery'
  }));
}

module.exports={recover};
