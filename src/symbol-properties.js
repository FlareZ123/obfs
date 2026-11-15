'use strict';

const {createHash}=require('node:crypto');
const {walk,applyEdits}=require('./ast');
const {
  collectBindings,proveLocalObject,ownPropertyName,staticName,isLiteralValue,
  singleUseFactoryObject
}=require('./properties');
const {staticString}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * Experimental private Symbol-key lowering. The existing local ownership
 * proof remains the only authority for deciding which objects may change.
 * Only standalone CommonJS or ESM source with a trusted, native Symbol
 * constructor is within this opt-in backend's semantic contract.
 *
 * Symbol values are generated once per module and shared by every verified
 * direct access to the same owned field. They are deliberately unregistered:
 * Symbol.for would expose their labels via Symbol.keyFor and the global
 * registry, and would allow unrelated modules to reuse the same key.
 *
 * @param {string} source
 * @param {AstNode} ast
 * @param {{seed:string}} options
 * @returns {{code:string,objects:number,properties:number}}
 */
function symbolizeLocalProperties(source,ast,options) {
  if(typeof options?.seed!=='string')throw new TypeError('Expected a seed');
  const bindings=collectBindings(ast);
  /** @type {Set<string>} */
  const reserved=new Set();
  walk(ast,node=>{if(node.type==='Identifier')reserved.add(node.name);});
  // An identifier named Symbol could be a shadowing lexical declaration or
  // a mutation of the constructor. Decline rather than introduce a TDZ,
  // unexpected constructor call, or an unproved globally observable effect.
  if(reserved.has('Symbol'))return {code:source,objects:0,properties:0};
  /** @type {{node:AstNode,name:string,properties:AstNode[]}[]} */
  const candidates=[];
  walk(ast,(node,parent,key,ancestors)=>{
    if(parent?.type!=='VariableDeclarator'||key!=='init'||
       parent.id.type!=='Identifier'||bindings.get(parent.id.name)!==1)return;
    const declaration=ancestors[ancestors.length-2];
    if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const'||
       ancestors.some(a=>a.type==='ExportNamedDeclaration'||
         a.type==='ExportDefaultDeclaration'))return;
    const literal=node.type==='ObjectExpression' ? node :
      singleUseFactoryObject(ast,bindings,node);
    if(!literal)return;
    /** @type {AstNode[]} */
    const properties=literal.properties;
    if(!properties.length||properties.some(p=>p.type!=='Property'||p.method||
       p.shorthand||p.kind!=='init'||ownPropertyName(p)===null||
       ['__proto__','prototype','constructor'].includes(String(ownPropertyName(p)))||
       !isLiteralValue(p.value)))return;
    const names=properties.map(ownPropertyName);
    if(new Set(names).size!==names.length)return;
    candidates.push({node:literal,name:parent.id.name,properties});
  });
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  /** @type {string[]} */
  const declarations=[];
  let objects=0,properties=0;
  for(const candidate of candidates) {
    const proof=proveLocalObject(ast,candidate.name,bindings);
    if(!proof||(!proof.members.length&&!proof.patterns.length))continue;
    const ownNames=new Set(candidate.properties.map(ownPropertyName));
    if(proof.members.some(member=>!ownNames.has(member.computed?
       staticString(member.property):staticName(member.property)))||
       proof.patterns.some(property=>!ownNames.has(ownPropertyName(property))))continue;
    /** @type {Map<string,string>} */
    const symbols=new Map();
    for(const prop of candidate.properties) {
      const old=/** @type {string} */ (ownPropertyName(prop));
      const digest=createHash('sha256').update(
        options.seed+'/'+candidate.name+'/'+candidate.node.start+'/'+old).digest('hex');
      let name='_sk_'+digest.slice(0,12);
      for(let n=1;reserved.has(name);n++)name='_sk_'+digest.slice(0,10)+'_'+n;
      reserved.add(name);
      symbols.set(old,name);
      declarations.push('const '+name+'=Symbol();');
      edits.push({start:prop.key.start,end:prop.key.end,
        text:prop.computed?name:'['+name+']'});
    }
    for(const member of proof.members) {
      const old=member.computed?staticString(member.property):staticName(member.property);
      const symbol=old===null?undefined:symbols.get(old);
      if(!symbol)continue;
      if(member.computed) {
        edits.push({start:member.property.start,end:member.property.end,text:symbol});
      } else {
        // Replace the complete dot/optional-dot suffix, not just its
        // identifier token. This preserves optional-chain short circuiting.
        edits.push({start:member.object.end,end:member.end,
          text:(member.optional?'?.[':'[')+symbol+']'});
      }
    }
    for(const property of proof.patterns) {
      const old=ownPropertyName(property);
      const symbol=old===null?undefined:symbols.get(old);
      if(!symbol)continue;
      if(property.shorthand) {
        edits.push({start:property.start,end:property.end,
          text:'['+symbol+']:'+source.slice(property.value.start,property.value.end)});
      } else {
        edits.push({start:property.key.start,end:property.key.end,
          text:property.computed?symbol:'['+symbol+']'});
      }
    }
    objects++;
    properties+=symbols.size;
  }
  if(!declarations.length)return {code:source,objects:0,properties:0};
  let offset=source.startsWith('#!')?
    (source.indexOf('\n')<0?source.length:source.indexOf('\n')+1):0;
  for(const statement of ast.body) {
    if(statement.type==='ExpressionStatement'&&statement.directive)offset=statement.end;
    else break;
  }
  edits.push({start:offset,end:offset,text:'\n'+declarations.join('')+'\n'});
  return {code:applyEdits(source,edits),objects,properties};
}

module.exports={symbolizeLocalProperties};
