'use strict';

const {applyEdits,staticString,walk}=require('./ast');

/**
 * Resolve the static spelling of a record field admitted by the island proof.
 * @param {import('./ast').AstNode} property
 * @returns {string|null}
 */
function recordPropertyName(property) {
  if(!property.computed && property.property?.type==='Identifier') {
    return property.property.name;
  }
  if(property.computed && property.property?.type==='Literal') {
    const value=property.property.value;
    if(typeof value==='string')return value;
    if(typeof value==='number')return String(value);
  }
  if(property.computed)return staticString(property.property);
  return null;
}

/**
 * Lower inert object records in a module that has ALREADY passed
 * proveSourceObserverIslands() to positional array records.
 *
 * This is not a standalone verifier. The caller must only invoke it for a
 * selected source-observer island: that proof establishes that records are
 * local, immutable, unreflected, non-escaping primitive snapshots and that
 * their only reads are static member reads in top-level const initializers.
 *
 * The additional 'length' rejection is required because arrays have an
 * intrinsic length property that ordinary object records do not.
 *
 * @param {string} source
 * @param {import('./ast').AstNode} ast
 * @returns {{code:string,records:number,properties:number}}
 */
function lowerProvedPrimitiveIslandRecords(source,ast) {
  /** @type {Map<string,{node:import('./ast').AstNode,properties:import('./ast').AstNode[],indices:Map<string,number>}>} */
  const records=new Map();
  for(const statement of ast.body) {
    if(statement.type!=='VariableDeclaration'||statement.kind!=='const')continue;
    for(const declaration of statement.declarations) {
      if(declaration.id.type!=='Identifier'||
         declaration.init?.type!=='ObjectExpression'||
         !declaration.init.properties.length)continue;
      const properties=declaration.init.properties;
      const indices=new Map();
      for(let index=0;index<properties.length;index++) {
        const property=properties[index];
        if(property.type!=='Property'||property.computed||property.method||
           property.shorthand||property.kind!=='init')return {code:source,records:0,properties:0};
        const key=property.key.type==='Identifier'?property.key.name:
          property.key.type==='Literal'&&typeof property.key.value==='string'?
            property.key.value:
          property.key.type==='Literal'&&typeof property.key.value==='number'?
            String(property.key.value):null;
        if(key===null||key==='length'||
           ['__proto__','constructor','prototype'].includes(key)||indices.has(key)) {
          return {code:source,records:0,properties:0};
        }
        indices.set(key,index);
      }
      records.set(declaration.id.name,{node:declaration.init,properties,indices});
    }
  }
  if(!records.size)return {code:source,records:0,properties:0};

  /** @type {Set<string>} */
  const used=new Set();
  /** @type {{start:number,end:number,text:string}[]} */
  const edits=[];
  let invalid=false;
  walk(ast,node=>{
    if(node.type!=='MemberExpression'||node.object.type!=='Identifier')return;
    const record=records.get(node.object.name);
    if(!record)return;
    const key=recordPropertyName(node);
    const index=key===null?undefined:record.indices.get(key);
    if(index===undefined){invalid=true;return;}
    used.add(node.object.name);
    edits.push({
      start:node.start,end:node.end,
      text:node.object.name+'['+index+']'
    });
  });
  if(invalid||!used.size)return {code:source,records:0,properties:0};

  let properties=0;
  let recordCount=0;
  for(const name of used) {
    const record=records.get(name);
    if(!record)continue;
    const values=record.properties.map(property=>
      source.slice(property.value.start,property.value.end));
    edits.push({
      start:record.node.start,end:record.node.end,
      text:'['+values.join(',')+']'
    });
    properties+=record.properties.length;
    recordCount++;
  }
  return {code:applyEdits(source,edits),records:recordCount,properties};
}

module.exports={lowerProvedPrimitiveIslandRecords};
