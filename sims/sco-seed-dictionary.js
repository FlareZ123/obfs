'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits}=require('../src/ast');

/**
 * Demonstrate the offline dictionary attack enabled by publishing the SCO
 * request seed. The identifier pass hashes its seed, original byte offset,
 * and candidate source binding name into a deterministic identifier.
 *
 * This deliberately bounded attack knows the file path and tests only a
 * caller-supplied dictionary and source-offset window. A miss is inconclusive.
 *
 * @typedef {{name:string,originalOffset:number}} RecoveredIdentifier
 */

/**
 * @param {string} generated
 * @param {{seed:string,filePath:string,dictionary:string[],maxSourceOffset:number,sourceType?:'script'|'module'|'commonjs'}} options
 * @returns {Map<string,RecoveredIdentifier>}
 */
function recoverIdentifiersWithSeed(generated,options) {
  const {seed,filePath,dictionary,maxSourceOffset}=options;
  if(typeof generated!=='string'||typeof seed!=='string'||!seed||
      typeof filePath!=='string'||!filePath||!Array.isArray(dictionary)||
      !Number.isSafeInteger(maxSourceOffset)||maxSourceOffset<1||maxSourceOffset>65536) {
    throw new TypeError('Expected obfuscated source, public seed, file, dictionary and bounded offset');
  }
  const ast=parse(generated,options.sourceType??'module');
  const targets=new Set();
  walk(ast,node=>{
    if(node.type==='Identifier'&&/^_v[a-f0-9]{12}$/u.test(node.name)){
      targets.add(node.name);
    }
  });
  const salt=createHash('sha256').update(seed+'/'+filePath).digest('hex');
  /** @type {Map<string,RecoveredIdentifier>} */
  const found=new Map();
  for(const candidate of dictionary) {
    if(typeof candidate!=='string'||!/^[A-Za-z_$][\w$]*$/u.test(candidate)) {
      throw new TypeError('Candidate dictionary entries must be ASCII identifier names');
    }
    for(let originalOffset=0;originalOffset<maxSourceOffset;originalOffset++) {
      const digest=createHash('sha256').update(salt+'/'+originalOffset+'/'+candidate).digest('hex');
      for(let window=0;window<12;window++) {
        const name='_v'+digest.slice(window,window+12);
        if(targets.has(name))found.set(name,{name:candidate,originalOffset});
      }
    }
  }
  return found;
}

/**
 * Substitute dictionary-recovered identifiers in a source program while
 * leaving unknown names unchanged. AST parsing prevents string replacement.
 * @param {string} source
 * @param {ReadonlyMap<string,RecoveredIdentifier>} recovered
 * @param {'script'|'module'|'commonjs'} [sourceType]
 * @returns {string}
 */
function substituteRecoveredNames(source,recovered,sourceType='module') {
  const ast=parse(source,sourceType);
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  walk(ast,node=>{
    if(node.type==='Identifier' && recovered.has(node.name)) {
      const name=recovered.get(node.name)?.name;
      if(name)edits.push({start:node.start,end:node.end,text:name});
    }
  });
  return applyEdits(source,edits);
}

module.exports={recoverIdentifiersWithSeed,substituteRecoveredNames};
