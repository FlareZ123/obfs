'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits}=require('../src/ast');

/** @typedef {{path:string,sourceType:'module',code:string}} PublishedModule */
/** @typedef {{exporter:string,exportName:string,original:string}} RecoveredProperty */
/** @typedef {{files:PublishedModule[],recovered:Map<string,RecoveredProperty>,lookups:number,targets:number}} Recovery */

/**
 * Source-only, public-seed dictionary attack against the named ESM owner
 * scheme used by src/cross-properties.js. The attacker knows no original
 * source, input byte offsets, source spelling, or original fixture graph.
 *
 * The *seed* is an explicit extra attacker assumption: deterministic example
 * build recipes frequently publish it. A secret random build seed defeats
 * this particular attack. This is not arbitrary-JavaScript deobfuscation.
 *
 * @param {ReadonlyArray<PublishedModule>} delivered
 * @param {{seed:string,dictionary:string[]}} options
 * @returns {Recovery}
 */
function recoverNamedEsmPropertySpellings(delivered,options) {
  if(!Array.isArray(delivered)||!delivered.length ||
     typeof options?.seed!=='string'||!options.seed||
     !Array.isArray(options.dictionary)||options.dictionary.length>20000||
     options.dictionary.some(name=>
       typeof name!=='string'||!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name))) {
    throw new TypeError('Expected delivered ESM files, public seed, and bounded ASCII name dictionary');
  }
  const dictionary=[...new Set(options.dictionary)];
  /** @type {Map<string,RecoveredProperty>} */
  const recovered=new Map();
  /** @type {Set<string>} */
  const targets=new Set();
  let lookups=0;

  // Determine original exported binding names from the PUBLIC ESM text, not
  // from the first-party build. Unlike source offsets, these names are part
  // of the ESM API and cannot be silently renamed.
  for(const file of delivered) {
    if(typeof file.path!=='string'||file.sourceType!=='module'||typeof file.code!=='string')
      throw new TypeError('Dictionary attacker expects text ESM output');
    const ast=parse(file.code,'module');
    for(const statement of ast.body) {
      if(statement.type!=='ExportNamedDeclaration'||statement.source||
         statement.declaration?.type!=='VariableDeclaration'||
         statement.declaration.kind!=='const')continue;
      for(const binding of statement.declaration.declarations) {
        if(binding.id.type!=='Identifier'||binding.init?.type!=='ObjectExpression')continue;
        const owner=binding.id.name;
        const hashed=new Set();
        for(const prop of binding.init.properties) {
          if(prop.type!=='Property'||prop.key.type!=='Literal'||
             typeof prop.key.value!=='string'||!/^_p[a-f0-9]{12}$/u.test(prop.key.value))continue;
          hashed.add(prop.key.value);
          targets.add(prop.key.value);
        }
        if(!hashed.size)continue;
        for(const original of dictionary) {
          lookups++;
          const token='_p'+createHash('sha256').update(
            options.seed+'/'+file.path+'/'+owner+'/'+original).digest('hex').slice(0,12);
          if(!hashed.has(token))continue;
          const prior=recovered.get(token);
          if(prior && prior.original!==original)throw new Error('Ambiguous truncated hash token');
          recovered.set(token,{exporter:file.path,exportName:owner,original});
        }
      }
    }
  }

  // Change only AST positions that spell property names. A raw global string
  // replacement could corrupt unrelated input strings or ordinary messages.
  /** @type {PublishedModule[]} */
  const files=delivered.map(file=>{
    const ast=parse(file.code,'module');
    /** @type {import('../src/ast').Edit[]} */
    const edits=[];
    walk(ast,(node,parent,key)=>{
      if(node.type==='MemberExpression') {
        const property=node.property;
        const token=property.type==='Identifier'&&!node.computed ? property.name :
          property.type==='Literal'&&node.computed&&typeof property.value==='string' ?
            property.value:null;
        const original=token?recovered.get(token)?.original:null;
        if(original)edits.push({
          start:property.start,end:property.end,
          text:node.computed?JSON.stringify(original):original
        });
      }
      if(node.type==='Property'&&node.key.type==='Literal'&&
         typeof node.key.value==='string') {
        const original=recovered.get(node.key.value)?.original;
        if(original)edits.push({
          start:node.key.start,end:node.key.end,text:JSON.stringify(original)
        });
      }
      if(node.type==='BinaryExpression'&&node.operator==='in'&&
         node.left.type==='Literal'&&typeof node.left.value==='string') {
        const original=recovered.get(node.left.value)?.original;
        if(original)edits.push({
          start:node.left.start,end:node.left.end,text:JSON.stringify(original)
        });
      }
    });
    return {...file,code:applyEdits(file.code,edits)};
  });
  return {files,recovered,lookups,targets:targets.size};
}

module.exports={recoverNamedEsmPropertySpellings};


/** @typedef {{original:string,originalOffset:number,owner:string}} LocalProperty */

/**
 * Brute-force the source byte offset mixed into local property field digests.
 * The attacker knows a public build seed and emitted file path but receives
 * neither the original source nor the original object-literal position.
 *
 * Unlike the named ESM variant, local field hashes use SHA-256(seed/path) as
 * their first-stage salt. The bounded offset scan is intentionally explicit;
 * if the true offset exceeds maxSourceOffset, a miss is inconclusive.
 *
 * @param {{path:string,sourceType:'commonjs',code:string}} delivered
 * @param {{seed:string,dictionary:string[],maxSourceOffset:number}} options
 * @returns {{code:string,recovered:Map<string,LocalProperty>,lookups:number,targets:number}}
 */
function recoverLocalFieldSpellings(delivered,options){
  if(!delivered||delivered.sourceType!=='commonjs'||
     typeof delivered.path!=='string'||typeof delivered.code!=='string'||
     typeof options?.seed!=='string'||!options.seed||
     !Array.isArray(options.dictionary)||options.dictionary.length>20000||
     options.dictionary.some(name=>
       typeof name!=='string'||!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name))||
     !Number.isSafeInteger(options.maxSourceOffset)||options.maxSourceOffset<1||
     options.maxSourceOffset>1024) {
    throw new TypeError('Expected published CommonJS, public seed and bounded source-offset dictionary');
  }
  const ast=parse(delivered.code,'commonjs');
  const salt=createHash('sha256').update(options.seed+'/'+delivered.path).digest('hex');
  const dictionary=[...new Set(options.dictionary)];
  /** @type {Map<string,LocalProperty>} */
  const recovered=new Map();
  /** @type {Set<string>} */
  const targets=new Set();
  let lookups=0;
  walk(ast,node=>{
    if(node.type!=='VariableDeclarator'||node.id.type!=='Identifier'||
       node.init?.type!=='ObjectExpression')return;
    const owner=node.id.name;
    const hashed=new Set();
    for(const prop of node.init.properties){
      if(prop.type!=='Property'||prop.key.type!=='Literal'||
         typeof prop.key.value!=='string'||!/^_p[a-f0-9]{10}$/u.test(prop.key.value))continue;
      hashed.add(prop.key.value);
      targets.add(prop.key.value);
    }
    if(!hashed.size)return;
    for(const original of dictionary){
      for(let originalOffset=0;originalOffset<options.maxSourceOffset;originalOffset++){
        lookups++;
        const token='_p'+createHash('sha256').update(
          salt+'/'+owner+'/'+originalOffset+'/'+original).digest('hex').slice(0,10);
        if(!hashed.has(token))continue;
        const prior=recovered.get(token);
        if(prior && prior.original!==original)throw new Error('Ambiguous truncated local token');
        recovered.set(token,{original,originalOffset,owner});
      }
    }
  });
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  walk(ast,node=>{
    if(node.type==='Property'&&node.key.type==='Literal'&&
       typeof node.key.value==='string'){
      const original=recovered.get(node.key.value)?.original;
      if(original)edits.push({
        start:node.key.start,end:node.key.end,text:JSON.stringify(original)
      });
    }
    if(node.type==='MemberExpression'){
      const prop=node.property;
      const token=prop.type==='Identifier'&&!node.computed?prop.name:
        prop.type==='Literal'&&node.computed&&typeof prop.value==='string'?
          prop.value:null;
      const original=token?recovered.get(token)?.original:null;
      if(original)edits.push({
        start:prop.start,end:prop.end,
        text:node.computed?JSON.stringify(original):original
      });
    }
  });
  return {code:applyEdits(delivered.code,edits),recovered,lookups,targets:targets.size};
}

module.exports.recoverLocalFieldSpellings=recoverLocalFieldSpellings;
