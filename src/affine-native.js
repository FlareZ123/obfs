'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {{code:string,functions:number,steps:number,declined:number}} AffineNativeResult */

/**
 * Recognize an integer-normalized left-associative chain. Its first and last
 * operations must be `|0`; between them only small numeric `+`/`-` steps may
 * occur. Starting with `|0` establishes primitive Number semantics while
 * retaining the native ToNumeric exception and coercion behavior. The final
 * `|0` makes arithmetic equivalent modulo 2^32, even across signed overflow.
 * @param {AstNode} node
 * @param {string} parameter
 * @returns {number[]|null}
 */
function compileSteps(node,parameter) {
  if(node.type!=='BinaryExpression'||node.operator!=='|'||
     node.right.type!=='Literal'||node.right.value!==0)return null;
  /** @type {number[]} */
  const reversed=[];
  node=node.left;
  while(node.type==='BinaryExpression'&&(node.operator==='+'||node.operator==='-')) {
    if(reversed.length>=64||node.right.type!=='Literal'||
       typeof node.right.value!=='number'||!Number.isInteger(node.right.value)||
       node.right.value<0||node.right.value>255)return null;
    reversed.push(node.operator==='+'?node.right.value:-node.right.value);
    node=node.left;
  }
  if(node.type!=='BinaryExpression'||node.operator!=='|'||
     node.left.type!=='Identifier'||node.left.name!==parameter||
     node.right.type!=='Literal'||node.right.value!==0)return null;
  if(reversed.length<8)return null;
  return reversed.reverse();
}

/**
 * Replace one restricted native expression with an algebraically equivalent,
 * seed-diversified affine accumulator. Each intermediate encodes the original
 * integer v as A*v+B (mod 2^32), with odd A, a changing sign and a freshly
 * derived B. Original arithmetic literals never appear in the output.
 *
 * This is obfuscation rather than authorization or a cryptographic barrier:
 * a symbolic attacker can invert the public affine transformations.
 * @param {number[]} steps
 * @param {string} parameter
 * @param {Buffer} entropy
 * @param {Set<string>} used
 * @returns {string}
 */
function emitAffineBody(steps,parameter,entropy,used) {
  /** @param {string} label @returns {Buffer} */
  const hash=label=>createHash('sha256').update(entropy).update('\0').update(label).digest();
  /** @param {number} index @returns {string} */
  function fresh(index) {
    let attempt=0;
    let name;
    do {
      name='_af_'+hash('reg/'+index+'/'+attempt).subarray(0,7).toString('hex');
      attempt++;
    } while(used.has(name));
    used.add(name);
    return name;
  }
  // 1+k*2^16 has modular inverse 1-k*2^16.  k<=31 keeps
  // every runtime Number multiplication exact within IEEE-754 53-bit integers.
  const k=(hash('multiplier')[0]%31)+1;
  const base=1+k*65536;
  let multiplier=base;
  let offset=hash('offset/0').readInt32LE(0);
  const first=fresh(0);
  let body='{const '+first+'=((('+parameter+'|0)*'+multiplier+')+'+offset+')|0;';
  let previous=first;
  for(let index=0;index<steps.length;index++) {
    const nextOffset=hash('offset/'+(index+1)).readInt32LE(0);
    const nextSign=hash('sign/'+index)[0]&1 ? -1:1;
    const nextMultiplier=multiplier*nextSign;
    const delta=(nextMultiplier*steps[index]+nextOffset-nextSign*offset)|0;
    const current=fresh(index+1);
    body+='const '+current+'=('+(nextSign<0?'-':'')+previous+'+'+delta+')|0;';
    previous=current;
    offset=nextOffset;
    multiplier=nextMultiplier;
  }
  const inverse=multiplier<0?-(1-k*65536):1-k*65536;
  return body+'return ((('+previous+'-('+offset+'))|0)*'+inverse+')|0;}';
}

/**
 * Experimental, opt-in native affine masking for isolated integer-normalized
 * addition/subtraction chains. The caller owns source-observation and input
 * environment contracts, and must measure hot runtime against its own budget.
 *
 * @param {string} source
 * @param {'module'|'commonjs'} sourceType
 * @param {{seed:string,names:string[]}} options
 * @returns {AffineNativeResult}
 */
function lowerAffineNative(source,sourceType,options) {
  if(typeof source!=='string'||!['module','commonjs'].includes(sourceType)||
     !options||typeof options.seed!=='string'||!options.seed||
     !Array.isArray(options.names)||options.names.some(x=>typeof x!=='string')) {
    throw new TypeError('Expected JavaScript source, module type, seed and named targets');
  }
  const targets=new Set(options.names);
  if(!targets.size)return {code:source,functions:0,steps:0,declined:0};
  const ast=parse(source,sourceType);
  /** @type {Set<string>} */
  const used=new Set();
  let unsafe=false;
  walk(ast,node=>{
    if(node.type==='WithStatement'||node.type==='Identifier'&&node.name==='eval')unsafe=true;
    if(node.type==='Identifier')used.add(node.name);
  });
  if(unsafe||observesFunctionSource(ast))return {code:source,functions:0,steps:0,declined:targets.size};
  /** @type {Map<string,AstNode[]>} */
  const candidates=new Map();
  for(const statement of ast.body) {
    const candidate=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(candidate.type!=='FunctionDeclaration'||!candidate.id||
       !targets.has(candidate.id.name))continue;
    const found=candidates.get(candidate.id.name)??[];
    found.push(candidate);
    candidates.set(candidate.id.name,found);
  }
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  let functions=0,steps=0,declined=0;
  for(const name of targets) {
    const matches=candidates.get(name);
    if(!matches||matches.length!==1){declined++;continue;}
    const fn=matches[0];
    const param=fn.params[0],stmt=fn.body.body[0];
    if(fn.async||fn.generator||fn.params.length!==1||param?.type!=='Identifier'||
       param.name==='arguments'||fn.body.body.length!==1||
       stmt?.type!=='ReturnStatement'||!stmt.argument) {
      declined++;
      continue;
    }
    const chain=compileSteps(stmt.argument,param.name);
    if(chain===null){declined++;continue;}
    const entropy=createHash('sha256').update(options.seed).update('\0')
      .update(name).update('\0').update(source).digest();
    edits.push({start:fn.body.start,end:fn.body.end,
      text:emitAffineBody(chain,param.name,entropy,used)});
    functions++;
    steps+=chain.length;
  }
  if(!functions)return {code:source,functions:0,steps:0,declined};
  const code=applyEdits(source,edits);
  parse(code,sourceType);
  return {code,functions,steps,declined};
}


/** @typedef {{code:string,functions:number,steps:number,paths:number,declined:number}} PolyvariantAffineResult */

/**
 * Compile an integer-normalized affine chain into input-partitioned native
 * arithmetic variants. Each numeric case receives exactly the values whose
 * low bits match its case label. Its reconstructed input is therefore exact
 * only within that case. A separate generic path preserves the original
 * ToInt32 exception and coercion behavior for non-number inputs.
 *
 * The branch bodies use independently diversified affine encodings and
 * execute only one path per call. No client-side secret is claimed: static
 * inspection of all cases reconstructs the mapping, and a hostile runtime
 * can exercise every case. This is opt-in research and requires a measured
 * workload budget, especially when increasing the number of variants.
 *
 * @param {string} source
 * @param {'module'|'commonjs'} sourceType
 * @param {{seed:string,names:string[],variants?:2|4|8}} options
 * @returns {PolyvariantAffineResult}
 */
function lowerPolyvariantAffine(source,sourceType,options) {
  if(typeof source!=='string'||!['module','commonjs'].includes(sourceType)||
     !options||typeof options.seed!=='string'||!options.seed||
     !Array.isArray(options.names)||options.names.some(name=>typeof name!=='string')||
     options.variants!==undefined&&![2,4,8].includes(options.variants)) {
    throw new TypeError('Expected source, type, seed, targets and 2/4/8 variants');
  }
  const targets=new Set(options.names);
  if(!targets.size)return {code:source,functions:0,steps:0,paths:0,declined:0};
  const variants=options.variants??4;
  const shift=variants===2?1:variants===4?2:3;
  const ast=parse(source,sourceType);
  /** @type {Set<string>} */
  const reserved=new Set();
  let unsafe=false;
  walk(ast,node=>{
    if(node.type==='Identifier') {
      reserved.add(node.name);
      if(node.name==='eval')unsafe=true;
    }
    if(node.type==='WithStatement')unsafe=true;
  });
  if(unsafe||observesFunctionSource(ast))return {
    code:source,functions:0,steps:0,paths:0,declined:targets.size
  };
  /** @type {Map<string,AstNode[]>} */
  const candidates=new Map();
  for(const statement of ast.body) {
    const candidate=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(candidate.type!=='FunctionDeclaration'||!candidate.id||
       !targets.has(candidate.id.name))continue;
    const matches=candidates.get(candidate.id.name)??[];
    matches.push(candidate);
    candidates.set(candidate.id.name,matches);
  }
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  let functions=0,steps=0,paths=0,declined=0;
  for(const name of targets) {
    const matches=candidates.get(name);
    if(!matches||matches.length!==1){declined++;continue;}
    const fn=matches[0],param=fn.params[0],statement=fn.body.body[0];
    if(fn.async||fn.generator||fn.params.length!==1||
       param?.type!=='Identifier'||param.name==='arguments'||
       fn.body.body.length!==1||statement?.type!=='ReturnStatement'||
       !statement.argument) {
      declined++;
      continue;
    }
    const chain=compileSteps(statement.argument,param.name);
    if(chain===null){declined++;continue;}
    const entropy=createHash('sha256').update(options.seed).update('\0')
      .update(name).update('\0').update(source).digest();
    /** @param {string} label @returns {Buffer} */
    const derive=label=>createHash('sha256').update(entropy)
      .update('\0').update(label).digest();
    /** @type {{label:number,order:number,body:string}[]} */
    const cases=[];
    for(let index=0;index<variants;index++) {
      let attempt=0,slot='';
      do {
        slot='_ap_slot_'+derive('slot/'+index+'/'+attempt).subarray(0,7).toString('hex');
        attempt++;
      } while(reserved.has(slot));
      reserved.add(slot);
      const narrowed='{const '+slot+'=(((('+param.name+'|0)>>'+shift+
        ')<<'+shift+')|'+index+');'+
        emitAffineBody(chain,slot,derive('variant/'+index),reserved)+'}';
      cases.push({label:index,order:derive('order/'+index).readUInt32LE(0),
        body:narrowed});
    }
    cases.push({label:variants,order:derive('order/fallback').readUInt32LE(0),
      body:emitAffineBody(chain,param.name,derive('fallback'),reserved)});
    cases.sort((a,b)=>a.order-b.order);
    const selector='(typeof '+param.name+'==="number"?(('+param.name+
      '|0)&'+(variants-1)+'):'+variants+')';
    const body='{switch('+selector+'){'+cases.map(entry=>
      'case '+entry.label+':'+entry.body).join('')+
      'default:throw Error("Invalid arithmetic path");}}';
    edits.push({start:fn.body.start,end:fn.body.end,text:body});
    functions++;
    steps+=chain.length;
    paths+=variants+1;
  }
  if(!functions)return {code:source,functions:0,steps:0,paths:0,declined};
  const code=applyEdits(source,edits);
  parse(code,sourceType);
  return {code,functions,steps,paths,declined};
}

module.exports={lowerAffineNative,lowerPolyvariantAffine};
