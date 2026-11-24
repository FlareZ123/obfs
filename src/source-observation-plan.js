'use strict';

const {createHash} = require('node:crypto');
const {parse,walk,parserContractIdFor} = require('./ast');
const {sourceGenerationOf,mapMappedSourceRange} = require('./source-edit-map');

/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {import('./source-edit-map').MappedSourceRange} MappedSourceRange */

/**
 * @typedef {Object} SourceSpanRef
 * @property {string} spanId
 * @property {string} sourceUnitRef
 * @property {string} sourceGeneration
 * @property {number} startOffset
 * @property {number} endOffset
 * @property {'utf16-code-unit'} coordinateUnit
 * @property {string|null} astNodeType
 *
 * @typedef {Object} SourceObservationPlan
 * @property {string} planId
 * @property {string} planGeneration
 * @property {ReadonlyMap<string,Object>} sourceUnits
 * @property {ReadonlyMap<string,SourceSpanRef>} sourceSpans
 * @property {ReadonlyMap<string,Object>} threatModels
 * @property {ReadonlyMap<string,Object>} moduleResolutionEdges
 * @property {ReadonlyMap<string,Object>} sourceDeliveryEdges
 * @property {ReadonlyMap<string,Object>} scoPartitionEligibility
 * @property {ReadonlyMap<string,Object>} wellKnownSymbols
 * @property {ReadonlyMap<string,Object>} propertyKeyIdentities
 * @property {ReadonlyMap<string,Object>} bindings
 * @property {ReadonlyMap<string,Object>} definitions
 * @property {ReadonlyMap<string,Object>} callableDefinitions
 * @property {ReadonlyMap<string,Object>} activations
 * @property {ReadonlyMap<string,Object>} values
 * @property {ReadonlyMap<string,Object>} valueFacts
 * @property {ReadonlyMap<string,Object>} valueFlowEdges
 * @property {ReadonlyMap<string,Object>} callSites
 * @property {ReadonlyMap<string,ReadonlySet<string>>} callTargets
 * @property {ReadonlyMap<string,ReadonlySet<string>>} hostArgumentEdges
 * @property {ReadonlyMap<string,Object>} hostEffects
 * @property {ReadonlyMap<string,ReadonlyArray<Object>>} valueEdges
 * @property {ReadonlyMap<string,ReadonlyArray<Object>>} activeFrameEdges
 * @property {ReadonlyMap<string,ReadonlySet<string>>} effectClosures
 * @property {ReadonlyMap<string,Object>} hostContracts
 * @property {string|null} deploymentManifestId
 * @property {ReadonlyMap<string,Object>} sourceMirrors
 * @property {ReadonlyMap<string,Object>} sourceMirrorReadEdges
 * @property {ReadonlyMap<string,Object>} receiverRefs
 * @property {ReadonlyMap<string,ReadonlySet<string>>} effects
 * @property {ReadonlyMap<string,ReadonlySet<string>>} semanticClosures
 * @property {ReadonlySet<string>} unsupportedSpans
 */

/** @type {WeakSet<object>} */
const validatedPlans=new WeakSet();
/** @type {WeakMap<object,{source:string,path:string,sourceUnitRef:string,parserContractId:string,callableName:string,callableSpanId:string,readerSpanId:string,readerFrameOffset:number,readerBindingName:string,exportBindingName:string,readerResultSpanId:string,exportMirrorSpanId:string,originalStringBindingPresent:boolean,effectId:string}>} */
const planMetadata=new WeakMap();
/** @type {WeakMap<object,SourceObservationPlan>} */
const planRangeOwners=new WeakMap();

/**
 * A read-only Map facade. The backing Map is not exposed to consumers.
 * @template K,V
 * @param {Iterable<[K,V]>} entries
 * @returns {ReadonlyMap<K,V>}
 */
function readonlyMap(entries) {
  const backing=new Map(entries);
  const view={
    [Symbol.toStringTag]:'ReadonlyMap',
    get size(){return backing.size;},
    /** @param {K} key */
    get(key){return backing.get(key);},
    /** @param {K} key */
    has(key){return backing.has(key);},
    entries(){return backing.entries();},
    keys(){return backing.keys();},
    values(){return backing.values();},
    /** @param {(value:V,key:K,map:ReadonlyMap<K,V>)=>void} callback @param {any} [thisArg] */
    forEach(callback,thisArg){backing.forEach((value,key)=>callback.call(thisArg,value,key,view));},
    [Symbol.iterator](){return backing[Symbol.iterator]();}
  };
  return Object.freeze(view);
}

/**
 * A read-only Set facade. The backing Set is not exposed to consumers.
 * @template T
 * @param {Iterable<T>} values
 * @returns {ReadonlySet<T>}
 */
function readonlySet(values) {
  const backing=new Set(values);
  const view={
    [Symbol.toStringTag]:'ReadonlySet',
    get size(){return backing.size;},
    /** @param {T} value */
    has(value){return backing.has(value);},
    entries(){return backing.entries();},
    keys(){return backing.keys();},
    values(){return backing.values();},
    /** @param {(value:T,value2:T,set:ReadonlySet<T>)=>void} callback @param {any} [thisArg] */
    forEach(callback,thisArg){backing.forEach(value=>callback.call(thisArg,value,value,view));},
    [Symbol.iterator](){return backing[Symbol.iterator]();}
  };
  return Object.freeze(view);
}

/**
 * @returns {ReadonlyMap<string,Object>}
 */
function emptyObjectMap() {
  return readonlyMap(/** @type {Array<[string,Object]>} */ ([]));
}

/**
 * @returns {ReadonlyMap<string,ReadonlySet<string>>}
 */
function emptyStringSetMap() {
  return readonlyMap(/** @type {Array<[string,ReadonlySet<string>]>} */ ([]));
}

/** @param {AstNode|null|undefined} node @param {string} name */
function isIdentifier(node,name) {
  return Boolean(node&&node.type==='Identifier'&&node.name===name);
}

/**
 * @param {AstNode|null|undefined} node
 * @param {string} property
 * @param {(object:AstNode)=>boolean} objectPredicate
 * @returns {boolean}
 */
function isMember(node,property,objectPredicate) {
  return Boolean(node&&node.type==='MemberExpression'&&!node.computed&&!node.optional&&
    isIdentifier(node.property,property)&&objectPredicate(node.object));
}

/**
 * The only admitted reader in the first producer slice. It deliberately does
 * not accept receiver methods, aliases, Reflect.apply, bound functions, or
 * other equivalent-looking spellings.
 * @param {AstNode} node
 * @returns {boolean}
 */
function isDirectFunctionSourceCall(node) {
  return node.type==='CallExpression'&&!node.optional&&node.arguments.length===1&&
    node.arguments[0]?.type==='Identifier'&&
    isMember(node.callee,'call',toStringMethod=>
      isMember(toStringMethod,'toString',prototype=>
        isMember(prototype,'prototype',value=>isIdentifier(value,'Function'))));
}

/**
 * Build the only admitted ordinary-object property surface: const-bound
 * object literals containing unique, own, static data properties with
 * primitive literal values. Inherited names and accessors are excluded.
 *
 * @param {AstNode} ast
 * @returns {Map<string,Set<string>>|null}
 */
function buildObjectShapes(ast) {
  const shapes=new Map();
  let invalid=false;
  walk(ast,node=>{
    if(node.type!=='VariableDeclarator'||node.id?.type!=='Identifier'||
       node.init?.type!=='ObjectExpression')return;
    const keys=new Set();
    for(const property of node.init.properties) {
      if(property.type!=='Property'||property.computed||property.method||
         property.shorthand||property.kind!=='init') {invalid=true;return;}
      const key=property.key.type==='Identifier'?property.key.name:
        property.key.type==='Literal'&&typeof property.key.value==='string'?
          property.key.value:null;
      if(key===null||key==='__proto__'||key==='constructor'||key==='prototype'||
         keys.has(key)||property.value.type!=='Literal') {invalid=true;return;}
      keys.add(key);
    }
    shapes.set(node.id.name,keys);
  });
  return invalid?null:shapes;
}

/**
 * Classify the tiny closed set of top-level const bindings. Only primitive
 * values may be copied or exported; object and callable identities stay local.
 *
 * @param {AstNode} ast
 * @param {AstNode} readerCall
 * @param {Map<string,Set<string>>} objectShapes
 * @returns {Map<string,'primitive'|'object'|'callable'|'unknown'>|null}
 */
function buildBindingKinds(ast,readerCall,objectShapes) {
  const kinds=new Map();
  for(const statement of ast.body) {
    const node=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
    if(node?.type==='FunctionDeclaration'&&node.id?.type==='Identifier') {
      kinds.set(node.id.name,'callable');
    }
  }
  for(const statement of ast.body) {
    const node=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
    if(node?.type!=='VariableDeclaration')continue;
    for(const declaration of node.declarations) {
      if(declaration.id?.type!=='Identifier'||!declaration.init)return null;
      const init=declaration.init;
      /** @type {'primitive'|'object'|'callable'|'unknown'} */
      let kind='unknown';
      if(init.type==='ObjectExpression')kind='object';
      else if(init.type==='Literal')kind='primitive';
      else if(init===readerCall)kind='primitive';
      else if(init.type==='MemberExpression'&&!init.computed&&!init.optional&&
        init.object.type==='Identifier'&&init.property.type==='Identifier'&&
        kinds.get(init.object.name)==='object'&&
        objectShapes.get(init.object.name)?.has(init.property.name))kind='primitive';
      else if(init.type==='Identifier'&&kinds.get(init.name)==='primitive')kind='primitive';
      kinds.set(declaration.id.name,kind);
    }
  }
  return kinds;
}

/**
 * The first producer accepts a deliberately small ESM grammar. Unknown syntax
 * is not approximated: it is rejected so the broad detector cannot hide a
 * second observer behind an unsupported construct.
 * @param {AstNode} node
 * @param {AstNode} readerCall
 * @param {Map<string,Set<string>>} objectShapes
 * @param {Map<string,'primitive'|'object'|'callable'|'unknown'>} bindingKinds
 * @returns {boolean}
 */
function isAllowedExpression(node,readerCall,objectShapes,bindingKinds) {
  if(node.type==='Literal') {
    return node.value===null||['string','number','boolean'].includes(typeof node.value);
  }
  if(node.type==='Identifier')return bindingKinds.get(node.name)==='primitive';
  if(node.type==='ObjectExpression') {
    const names=new Set();
    return node.properties.every(/** @param {AstNode} property */ property=>{
      if(property.type!=='Property'||property.computed||property.method||
         property.shorthand||property.kind!=='init')return false;
      const key=property.key.type==='Identifier'?property.key.name:
        property.key.type==='Literal'&&typeof property.key.value==='string'?
          property.key.value:null;
      if(key===null||key==='__proto__'||key==='constructor'||key==='prototype'||
         names.has(key)||property.value.type!=='Literal')return false;
      names.add(key);
      return property.value.value===null||
        ['string','number','boolean'].includes(typeof property.value.value);
    });
  }
  if(node.type==='MemberExpression') {
    if(node.computed||node.optional||node.property.type!=='Identifier'||
       node.object.type!=='Identifier')return false;
    return objectShapes.get(node.object.name)?.has(node.property.name)===true;
  }
  return node===readerCall&&isDirectFunctionSourceCall(node);
}

/**
 * @param {AstNode} ast
 * @param {AstNode} readerCall
 * @param {Map<string,Set<string>>} objectShapes
 * @param {Map<string,'primitive'|'object'|'callable'|'unknown'>} bindingKinds
 * @returns {boolean}
 */
function isAllowedProgram(ast,readerCall,objectShapes,bindingKinds) {
  if(ast.type!=='Program'||ast.sourceType!=='module')return false;
  /** @type {AstNode[]} */
  const functionNodes=[];
  let valid=true;
  for(const statement of ast.body) {
    const node=statement.type==='ExportNamedDeclaration'?
      statement.declaration:statement;
    const exported=statement.type==='ExportNamedDeclaration';
    if(exported&&(statement.source||statement.specifiers.length||!statement.declaration))return false;
    if(exported&&node?.type!=='VariableDeclaration')return false;
    if(!node)return false;
    if(node.type==='FunctionDeclaration') {
      functionNodes.push(node);
      if(!node.id||node.id.type!=='Identifier'||node.async||node.generator||
         node.params.length!==0||node.body.type!=='BlockStatement'||
         node.body.body.length!==1||node.body.body[0].type!=='ReturnStatement'||
         !node.body.body[0].argument||
         !isAllowedExpression(node.body.body[0].argument,readerCall,objectShapes,bindingKinds))valid=false;
      continue;
    }
    if(node.type==='VariableDeclaration') {
      if(node.kind!=='const'||!node.declarations.length)return false;
      for(const declaration of node.declarations) {
        if(declaration.id.type!=='Identifier'||!declaration.init||
           !isAllowedExpression(declaration.init,readerCall,objectShapes,bindingKinds)||
           exported&&bindingKinds.get(declaration.id.name)!=='primitive')valid=false;
      }
      continue;
    }
    return false;
  }
  if(!valid||functionNodes.length!==1)return false;
  let callCount=0;
  walk(ast,node=>{
    if(node.type==='CallExpression') {
      callCount++;
      if(node!==readerCall||!isDirectFunctionSourceCall(node))valid=false;
    }
    if(node.type==='NewExpression'||node.type==='ImportExpression'||
       node.type==='WithStatement'||node.type==='AssignmentExpression'||
       node.type==='UpdateExpression'||node.type==='AwaitExpression'||
       node.type==='YieldExpression'||node.type==='ClassDeclaration'||
       node.type==='ClassExpression'||node.type==='TryStatement'||
       node.type==='ThrowStatement')valid=false;
    if(node.type==='MemberExpression'&&(node.computed||node.optional))valid=false;
    if(node.type==='Property'&&(node.computed||node.method||node.shorthand||
       node.kind!=='init'))valid=false;
    if(node.type==='VariableDeclaration'&&node.kind!=='const')valid=false;
  });
  return valid&&callCount===1;
}

/**
 * @param {AstNode} ast
 * @param {AstNode} readerCall
 * @returns {{counts:Map<string,number>,readerParent:AstNode|null,readerKey:string|null,readerAncestors:AstNode[]}}
 */
function inspectDeclarations(ast,readerCall) {
  const counts=new Map();
  let readerParent=null,readerKey=null;
  /** @type {AstNode[]} */
  let readerAncestors=[];
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier') {
      counts.set(node.id.name,(counts.get(node.id.name)??0)+1);
    }
    if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier') {
      counts.set(node.id.name,(counts.get(node.id.name)??0)+1);
    }
    if(node===readerCall) {
      readerParent=parent;
      readerKey=key;
      readerAncestors=ancestors;
    }
  });
  return {counts,readerParent,readerKey,readerAncestors};
}

/**
 * Collect every binding introduced by an ESTree binding pattern.
 * @param {AstNode|null|undefined} pattern
 * @param {Set<string>} names
 */
function collectBindingPatternNames(pattern,names) {
  if(!pattern)return;
  if(pattern.type==='Identifier') {
    names.add(pattern.name);
    return;
  }
  if(pattern.type==='RestElement') {
    collectBindingPatternNames(pattern.argument,names);
    return;
  }
  if(pattern.type==='AssignmentPattern') {
    collectBindingPatternNames(pattern.left,names);
    return;
  }
  if(pattern.type==='ArrayPattern') {
    for(const element of pattern.elements)collectBindingPatternNames(element,names);
    return;
  }
  if(pattern.type==='ObjectPattern') {
    for(const property of pattern.properties) {
      if(property.type==='RestElement')collectBindingPatternNames(property.argument,names);
      else if(property.type==='Property')collectBindingPatternNames(property.value,names);
    }
  }
}

/**
 * Collect lexical bindings conservatively, including classes, imports,
 * parameters, catch bindings and nested destructuring patterns.
 * @param {AstNode} ast
 * @returns {Set<string>}
 */
function collectBindingNames(ast) {
  const names=new Set();
  walk(ast,node=>{
    if(node.type==='VariableDeclarator')collectBindingPatternNames(node.id,names);
    if(['FunctionDeclaration','FunctionExpression','ClassDeclaration','ClassExpression'].includes(node.type)&&
       node.id?.type==='Identifier')names.add(node.id.name);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)) {
      for(const parameter of node.params)collectBindingPatternNames(parameter,names);
    }
    if(node.type==='ImportDeclaration') {
      for(const specifier of node.specifiers) {
        if(specifier.local?.type==='Identifier')names.add(specifier.local.name);
      }
    }
    if(node.type==='CatchClause')collectBindingPatternNames(node.param,names);
  });
  return names;
}

/**
 * Count all identifier spellings, including declaration and non-reference
 * positions. The first source-observer slice deliberately uses unique names.
 * @param {AstNode} ast
 * @param {string} name
 * @returns {number}
 */
function countIdentifierOccurrences(ast,name) {
  let count=0;
  walk(ast,node=>{if(node.type==='Identifier'&&node.name===name)count++;});
  return count;
}

/**
 * Whether an Identifier is a syntactic name rather than a variable reference.
 * Binding positions are handled separately by collectBindingNames.
 * @param {AstNode} node
 * @param {AstNode|null} parent
 * @param {string|number|null} key
 * @returns {boolean}
 */
function isNonReferenceIdentifier(node,parent,key) {
  if(!parent)return false;
  if(parent.type==='MemberExpression'&&key==='property'&&!parent.computed)return true;
  if(parent.type==='Property'&&key==='key'&&!parent.computed&&!parent.shorthand)return true;
  if(['MethodDefinition','PropertyDefinition'].includes(parent.type)&&
     key==='key'&&!parent.computed)return true;
  if(parent.type==='LabeledStatement'&&key==='label')return true;
  if(['BreakStatement','ContinueStatement'].includes(parent.type)&&key==='label')return true;
  if(parent.type==='MetaProperty')return true;
  if(parent.type==='ImportSpecifier'&&key==='imported')return true;
  if(parent.type==='ExportSpecifier'&&key==='exported')return true;
  return false;
}

/**
 * Collect unbound identifier references using lexical scope resolution.
 * This prevents a binding in a nested catch/loop/block from hiding a host
 * global referenced outside that binding's scope.
 * @param {AstNode} ast
 * @returns {Array<{name:string,node:AstNode,parent:AstNode|null,ancestors:AstNode[]}>}
 */
function collectFreeIdentifierReferences(ast) {
  const scopeTypes=new Set([
    'Program','BlockStatement','FunctionDeclaration','FunctionExpression',
    'ArrowFunctionExpression','CatchClause','ForStatement','ForInStatement',
    'ForOfStatement','SwitchStatement','StaticBlock','ClassExpression'
  ]);
  /** @param {AstNode} node @returns {boolean} */
  const isScope=node=>scopeTypes.has(node.type);
  /** @type {WeakMap<AstNode,AstNode[]>} */
  const ancestorsByNode=new WeakMap();
  /** @type {AstNode[]} */
  const scopeNodes=[];
  walk(ast,(node,parent,key,ancestors)=>{
    ancestorsByNode.set(node,ancestors);
    if(isScope(node))scopeNodes.push(node);
  });
  /** @param {AstNode[]} ancestors @returns {AstNode|null} */
  function nearestScope(ancestors) {
    for(let index=ancestors.length-1;index>=0;index--) {
      if(isScope(ancestors[index]))return ancestors[index];
    }
    return null;
  }
  /** @param {AstNode[]} ancestors @returns {AstNode|null} */
  function nearestFunctionScope(ancestors) {
    for(let index=ancestors.length-1;index>=0;index--) {
      const candidate=ancestors[index];
      if(['Program','FunctionDeclaration','FunctionExpression',
          'ArrowFunctionExpression'].includes(candidate.type))return candidate;
    }
    return ast;
  }
  /** @type {Map<AstNode,AstNode|null>} */
  const scopeParents=new Map();
  /** @type {Map<AstNode,Set<string>>} */
  const scopeBindings=new Map();
  for(const scope of scopeNodes) {
    const ancestors=ancestorsByNode.get(scope)??[];
    scopeParents.set(scope,nearestScope(ancestors));
    scopeBindings.set(scope,new Set());
  }
  /**
   * @param {AstNode|null} scope
   * @param {AstNode|null|undefined} pattern
   */
  function addPattern(scope,pattern) {
    if(!scope||!pattern)return;
    const names=new Set();
    collectBindingPatternNames(pattern,names);
    const bindings=scopeBindings.get(scope);
    if(bindings)for(const name of names)bindings.add(name);
  }
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type==='VariableDeclarator') {
      const kind=parent?.type==='VariableDeclaration'?parent.kind:'const';
      const target=kind==='var'?nearestFunctionScope(ancestors):
        (nearestScope(ancestors)??ast);
      addPattern(target,node.id);
    }
    if(node.type==='FunctionDeclaration'&&node.id) {
      addPattern(nearestScope(ancestors)??ast,node.id);
    }
    if(node.type==='FunctionExpression'&&node.id)addPattern(node,node.id);
    if(node.type==='ClassDeclaration'&&node.id) {
      addPattern(nearestScope(ancestors)??ast,node.id);
    }
    if(node.type==='ClassExpression'&&node.id)addPattern(node,node.id);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)) {
      for(const parameter of node.params)addPattern(node,parameter);
    }
    if(node.type==='CatchClause')addPattern(node,node.param);
    if(node.type==='ImportDeclaration') {
      for(const specifier of node.specifiers)addPattern(ast,specifier.local);
    }
  });
  /** @param {string} name @param {AstNode|null} scope @returns {boolean} */
  function isBound(name,scope) {
    let current=scope;
    while(current) {
      if(scopeBindings.get(current)?.has(name))return true;
      current=scopeParents.get(current)??null;
    }
    return false;
  }
  /** @type {Array<{name:string,node:AstNode,parent:AstNode|null,ancestors:AstNode[]}>} */
  const references=[];
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type!=='Identifier'||isNonReferenceIdentifier(node,parent,key))return;
    if(!isBound(node.name,nearestScope(ancestors)??ast)) {
      references.push({name:node.name,node,parent,ancestors});
    }
  });
  return references;
}

/**
 * String decoding is the only transform in this first slice that introduces a
 * free host root. Permit only the direct String.fromCharCode call emitted by
 * the decoder; constructor, computed-property, alias, and call/apply forms are
 * outside the accepted transform contract.
 * @param {{name:string,node:AstNode,parent:AstNode|null,ancestors:AstNode[]}} reference
 * @returns {boolean}
 */
function isDirectStringFromCharCodeReference(reference) {
  const member=reference.parent;
  const memberParent=reference.ancestors.length>=2?
    reference.ancestors[reference.ancestors.length-2]:null;
  return member?.type==='MemberExpression'&&member.object===reference.node&&
    !member.computed&&member.property?.type==='Identifier'&&
    member.property.name==='fromCharCode'&&memberParent?.type==='CallExpression'&&
    memberParent.callee===member;
}

/**
 * Compute the source FramePosition visible to host stack inspection. Columns
 * are tracked in both UTF-16 code units and Unicode code points; source maps
 * preserve slices, not caller line/column positions.
 * @param {string} source
 * @param {number} offset
 * @returns {{line:number,columnUtf16:number,columnCodePoints:number}|null}
 */
function framePositionOf(source,offset) {
  if(typeof source!=='string'||!Number.isInteger(offset)||offset<0||offset>source.length)return null;
  let line=1,columnUtf16=1,columnCodePoints=1;
  for(let index=0;index<offset;index++) {
    const code=source.charCodeAt(index);
    if(code===0x0d) {
      if(index+1<offset&&source.charCodeAt(index+1)===0x0a)index++;
      line++;
      columnUtf16=1;
      columnCodePoints=1;
    } else if(code===0x0a||code===0x2028||code===0x2029) {
      line++;
      columnUtf16=1;
      columnCodePoints=1;
    } else {
      columnUtf16++;
      if(code>=0xdc00&&code<=0xdfff&&index>0) {
        const previous=source.charCodeAt(index-1);
        if(previous>=0xd800&&previous<=0xdbff)continue;
      }
      columnCodePoints++;
    }
  }
  return {line,columnUtf16,columnCodePoints};
}

/**
 * @param {AstNode} node
 * @param {Array<{start:number,end:number}>} ranges
 * @returns {boolean}
 */
function isInsideRanges(node,ranges) {
  return ranges.some(range=>node.start>=range.start&&node.end<=range.end);
}

/**
 * Locate the exact compiler-generated string decoder regions using edit-map
 * provenance, then derive the only local arrays/call targets the decoder may
 * use. Provenance marks ranges; the AST checks below still validate their use.
 * @param {AstNode} ast
 * @param {import('./source-edit-map').SourceEditMap|undefined} editMap
 * @returns {{valid:boolean,prologueRanges:Array<{start:number,end:number}>,replacementRanges:Array<{start:number,end:number}>,decoderArrayNames:Set<string>,decoderLocalNames:Set<string>,helperName:string|null,helperLength:number}}
 */
function collectStringDecoderContext(ast,editMap) {
  const segments=editMap?.segments??[];
  const allowedOrigins=new Set([
    'properties-local-rename','identifiers-local-rename',
    'strings-decoder-prologue','strings-decoder-replacement'
  ]);
  const validOrigins=segments.every(segment=>
    segment.syntheticOriginId===null||allowedOrigins.has(segment.syntheticOriginId));
  const prologueRanges=segments.filter(segment=>
    segment.kind==='inserted'&&segment.syntheticOriginId==='strings-decoder-prologue')
    .map(segment=>({start:segment.toStart,end:segment.toEnd}));
  const replacementRanges=segments.filter(segment=>
    segment.kind==='replaced'&&segment.syntheticOriginId==='strings-decoder-replacement')
    .map(segment=>({start:segment.toStart,end:segment.toEnd}));
  const decoderArrayNames=new Set();
  const decoderLocalNames=new Set();
  if(!validOrigins||prologueRanges.length>1||
     (prologueRanges.length===0)!==(replacementRanges.length===0)) {
    return {valid:false,prologueRanges,replacementRanges,decoderArrayNames,
      decoderLocalNames,helperName:null,helperLength:0};
  }
  if(prologueRanges.length===0) {
    return {valid:true,prologueRanges,replacementRanges,decoderArrayNames,
      decoderLocalNames,helperName:null,helperLength:0};
  }
  /** @type {Array<{name:string,length:number}>} */
  const helperCandidates=[];
  walk(ast,node=>{
    if(node.type!=='VariableDeclarator'||node.id?.type!=='Identifier'||
       node.init?.type!=='ArrayExpression'||!isInsideRanges(node,prologueRanges))return;
    if(node.init.elements.length>0&&node.init.elements.every((/** @type {AstNode|null} */ element)=>
      element?.type==='Literal'&&typeof element.value==='string')) {
      helperCandidates.push({name:node.id.name,length:node.init.elements.length});
    }
  });
  if(helperCandidates.length!==1) {
    return {valid:false,prologueRanges,replacementRanges,decoderArrayNames,
      decoderLocalNames,helperName:null,helperLength:0};
  }
  const helperName=helperCandidates[0].name;
  const helperLength=helperCandidates[0].length;
  walk(ast,node=>{
    if(node.type!=='VariableDeclarator'||node.id?.type!=='Identifier'||
       !isInsideRanges(node,prologueRanges)||!node.id.name.startsWith(helperName))return;
    decoderLocalNames.add(node.id.name);
    if(node.init?.type==='ArrayExpression')decoderArrayNames.add(node.id.name);
  });
  if(!decoderArrayNames.has(helperName)) {
    return {valid:false,prologueRanges,replacementRanges,decoderArrayNames,
      decoderLocalNames,helperName,helperLength};
  }
  let loopCount=0,unsupportedLoop=false;
  walk(ast,node=>{
    if(['ForStatement','ForInStatement','ForOfStatement','WhileStatement',
        'DoWhileStatement'].includes(node.type)) {
      if(!isInsideRanges(node,prologueRanges)||node.type!=='ForStatement') {
        unsupportedLoop=true;
      } else loopCount++;
    }
  });
  const valid=loopCount>=1&&loopCount<=2&&!unsupportedLoop;
  return {valid,prologueRanges,replacementRanges,decoderArrayNames,
    decoderLocalNames,helperName,helperLength};
}

/**
 * @param {AstNode} node
 * @returns {string|null}
 */
function staticMemberPropertyName(node) {
  if(node.type!=='MemberExpression')return null;
  if(!node.computed&&node.property?.type==='Identifier')return node.property.name;
  if(node.computed&&node.property?.type==='Literal'&&
     typeof node.property.value==='string')return node.property.value;
  if(node.computed&&node.property?.type==='TemplateLiteral'&&
     node.property.expressions.length===0) {
    return node.property.quasis[0]?.value?.cooked??null;
  }
  return null;
}

/**
 * @param {AstNode} call
 * @param {AstNode|null} currentReader
 * @param {ReturnType<typeof collectStringDecoderContext>} decoder
 * @returns {boolean}
 */
function isAllowedPlanCall(call,currentReader,decoder) {
  if(call===currentReader)return true;
  if(call.type!=='CallExpression'||!isInsideRanges(call,decoder.prologueRanges))return false;
  const callee=call.callee;
  if(callee?.type!=='MemberExpression'||callee.computed||
     callee.property?.type!=='Identifier'||callee.object?.type!=='Identifier')return false;
  if(callee.object.name==='String'&&callee.property.name==='fromCharCode')return true;
  return decoder.decoderLocalNames.has(callee.object.name)&&
    callee.property.name==='charCodeAt';
}

/**
 * Build a finite plan for one direct Function.prototype.toString.call(fn)
 * observation in a closed, single-file ESM COO input. The caller must provide
 * an explicit, versioned host premise for pristine Function intrinsics and, when string encoding is enabled, String.fromCharCode. This
 * is a compatibility premise, not an authorization boundary against a client
 * attacker who controls the realm.
 *
 * @param {string} source
 * @param {string} path
 * @param {{runtimeFamily:string,runtimeVersion:string,contractVersion:string,pristineIntrinsicsPremise:string}} hostContract
 * @returns {SourceObservationPlan|null}
 */
function buildDirectFunctionSourcePlan(source,path,hostContract) {
  if(typeof source!=='string'||typeof path!=='string'||path.length===0||
     !hostContract||typeof hostContract!=='object')return null;
  /** @type {{runtimeFamily:string,runtimeVersion:string,contractVersion:string,pristineIntrinsicsPremise:string}|null} */
  let contractSnapshot=null;
  try {
    // Snapshot caller-controlled accessors/proxies exactly once.
    const runtimeFamily=hostContract.runtimeFamily;
    const runtimeVersion=hostContract.runtimeVersion;
    const contractVersion=hostContract.contractVersion;
    const pristineIntrinsicsPremise=hostContract.pristineIntrinsicsPremise;
    if(typeof runtimeFamily!=='string'||runtimeFamily.length===0||
       typeof runtimeVersion!=='string'||runtimeVersion.length===0||
       typeof contractVersion!=='string'||contractVersion.length===0||
       typeof pristineIntrinsicsPremise!=='string'||pristineIntrinsicsPremise.length===0)return null;
    contractSnapshot=Object.freeze({
      runtimeFamily,runtimeVersion,contractVersion,pristineIntrinsicsPremise
    });
  } catch {
    return null;
  }
  if(!contractSnapshot)return null;
  const parserContractId=parserContractIdFor('module');
  let ast;
  try {ast=parse(source,'module');} catch {return null;}
  /** @type {AstNode[]} */
  const calls=[];
  walk(ast,node=>{if(node.type==='CallExpression')calls.push(node);});
  if(calls.length!==1||!isDirectFunctionSourceCall(calls[0]))return null;
  const readerCall=calls[0];
  const readerFrameOffset=readerCall.callee.property.start;
  const {counts,readerParent,readerKey,readerAncestors}=inspectDeclarations(ast,readerCall);
  if(!readerParent||readerParent.type!=='VariableDeclarator'||
     readerKey!=='init'||readerParent.init!==readerCall||
     readerParent.id?.type!=='Identifier'||
     readerAncestors.some(ancestor=>ancestor.type==='FunctionDeclaration'||
       ancestor.type==='ExportNamedDeclaration'))return null;
  const readerDeclaration=readerAncestors.find(ancestor=>ancestor.type==='VariableDeclaration');
  if(!readerDeclaration||readerDeclaration.kind!=='const'||
     readerDeclaration.declarations.length!==1)return null;
  const readerBindingName=readerParent.id.name;
  const callableName=readerCall.arguments[0].name;
  const exportCandidates=[];
  for(const statement of ast.body) {
    if(statement.type!=='ExportNamedDeclaration'||statement.source||
       statement.specifiers.length||statement.declaration?.type!=='VariableDeclaration')continue;
    const declaration=statement.declaration;
    for(const declarator of declaration.declarations) {
      if(declarator.id?.type==='Identifier'&&declarator.id.name==='sourceText') {
        exportCandidates.push({statement,declaration,declarator});
      }
    }
  }
  if(exportCandidates.length!==1)return null;
  const exportMirror=exportCandidates[0];
  const exportBindingName='sourceText';
  if(exportMirror.declaration.kind!=='const'||
     exportMirror.declaration.declarations.length!==1||
     exportMirror.declarator.init?.type!=='Identifier'||
     exportMirror.declarator.init.name!==readerBindingName||
     readerBindingName===exportBindingName||
     counts.get(readerBindingName)!==1||
     counts.get(exportBindingName)!==1||
     countIdentifierOccurrences(ast,readerBindingName)!==2||
     countIdentifierOccurrences(ast,exportBindingName)!==1||
     countIdentifierOccurrences(ast,callableName)!==2||
     countIdentifierOccurrences(ast,'Function')!==1||
     collectBindingNames(ast).has('Function'))return null;
  /** @type {AstNode[]} */
  const functionNodes=[];
  walk(ast,node=>{
    if(node.type==='FunctionDeclaration')functionNodes.push(node);
  });
  const objectShapes=buildObjectShapes(ast);
  if(functionNodes.length!==1||functionNodes[0].id.name!==callableName||
     counts.get(callableName)!==1||counts.has('Function')||!objectShapes)return null;
  const bindingKinds=buildBindingKinds(ast,readerCall,objectShapes);
  if(!bindingKinds||!isAllowedProgram(ast,readerCall,objectShapes,bindingKinds))return null;

  // Every free identifier must be the single declared global intrinsic
  // Function used by the admitted reader. No imports, ambient callbacks,
  // computed property access, or host-owned objects are admitted.
  let freeReference=false;
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type!=='Identifier'||!parent)return;
    if(parent.type==='MemberExpression'&&key==='property'&&!parent.computed||
       parent.type==='Property'&&key==='key'&&!parent.computed||
       parent.type==='VariableDeclarator'&&key==='id'||
       parent.type==='FunctionDeclaration'&&key==='id')return;
    if(node.name==='Function'&&ancestors.includes(readerCall))return;
    if(!counts.has(node.name))freeReference=true;
  });
  if(freeReference)return null;

  const callableNode=functionNodes[0];
  const sourceGeneration=sourceGenerationOf(source,parserContractId);
  const sourceUnitRef='unit:coo:client:'+path+':'+sourceGeneration;
  const threatModelId='threat:coo-client-attacker-v1';
  const hostContractPayload=JSON.stringify([
    'host-contract-id-v1','coo','client',
    contractSnapshot.runtimeFamily,
    contractSnapshot.runtimeVersion,
    contractSnapshot.contractVersion,
    contractSnapshot.pristineIntrinsicsPremise
  ]);
  if(typeof hostContractPayload!=='string')return null;
  const hostContractId='host:coo:'+createHash('sha256').update(hostContractPayload).digest('hex');
  const callableSpanId='span:'+sourceUnitRef+':'+callableNode.start+':'+
    callableNode.end+':FunctionDeclaration';
  const readerSpanId='span:'+sourceUnitRef+':'+readerCall.start+':'+
    readerCall.end+':CallExpression';
  const readerResultSpanId='span:'+sourceUnitRef+':'+readerParent.start+':'+
    readerParent.end+':VariableDeclarator';
  const exportMirrorSpanId='span:'+sourceUnitRef+':'+exportMirror.declarator.start+':'+
    exportMirror.declarator.end+':VariableDeclarator';
  const callableDefinitionId='callable:'+sourceUnitRef+':'+callableName;
  const bindingId='binding:'+sourceUnitRef+':'+callableName;
  const definitionId='definition:'+sourceUnitRef+':'+callableName;
  const readerBindingId='binding:'+sourceUnitRef+':'+readerBindingName;
  const readerDefinitionId='definition:'+sourceUnitRef+':'+readerBindingName;
  const exportBindingId='binding:'+sourceUnitRef+':'+exportBindingName;
  const exportDefinitionId='definition:'+sourceUnitRef+':'+exportBindingName;
  const valueRef='value:'+sourceUnitRef+':'+callableName;
  const resultValueRef='value:'+sourceUnitRef+':source-mirror-result:'+readerCall.start;
  const readerValueRef='value:'+sourceUnitRef+':reader-binding:'+readerBindingName;
  const exportValueRef='value:'+sourceUnitRef+':export:'+exportBindingName;
  const callSiteId='callsite:'+sourceUnitRef+':'+readerCall.start+':'+readerCall.end;
  const effectId='effect:'+sourceUnitRef+':'+readerCall.start+':source-mirror-read';
  const mirrorId='mirror:'+callableDefinitionId;
  const hostIntrinsic=Object.freeze({
    kind:'unknown',
    callableDefinitionRef:null,
    hostIntrinsicId:'Function.prototype.toString',
    overrideCallableDefinitionRef:null,
    hostContractRef:hostContractId
  });
  const sourceUnit=Object.freeze({
    sourceUnitId:sourceUnitRef,
    mode:'coo',
    executionPartition:'client',
    sourceGeneration,
    resolvedURL:null,
    resolutionContextId:null,
    realmGroupId:null,
    sourceType:'module',
    executionOrder:0,
    threatModelRefId:threatModelId,
    runtimeContractId:hostContractId,
    requestVariantGeneration:null,
    buildArtifactId:null
  });
  const threatModel=Object.freeze({
    threatModelId,
    mode:'coo',
    executionPartition:'client',
    runtimeControl:'attacker-controlled',
    assumptionsVersion:'coo-client-attacker-v1',
    trustEvidenceId:null
  });
  const contract=Object.freeze({
    hostContractId,
    mode:'coo',
    executionPartition:'client',
    threatModelRefId:threatModelId,
    runtimeFamily:contractSnapshot.runtimeFamily,
    runtimeVersion:contractSnapshot.runtimeVersion,
    realmId:null,
    intrinsicSnapshotId:null,
    loaderPreloadContractId:null,
    deploymentManifestId:null,
    pristineIntrinsicsPremise:contractSnapshot.pristineIntrinsicsPremise,
    contractVersion:contractSnapshot.contractVersion
  });
  const callableSpan=Object.freeze({
    spanId:callableSpanId,
    sourceUnitRef,
    sourceGeneration,
    startOffset:callableNode.start,
    endOffset:callableNode.end,
    coordinateUnit:'utf16-code-unit',
    astNodeType:'FunctionDeclaration'
  });
  const readerSpan=Object.freeze({
    spanId:readerSpanId,
    sourceUnitRef,
    sourceGeneration,
    startOffset:readerCall.start,
    endOffset:readerCall.end,
    coordinateUnit:'utf16-code-unit',
    astNodeType:'CallExpression'
  });
  const readerResultSpan=Object.freeze({
    spanId:readerResultSpanId,
    sourceUnitRef,
    sourceGeneration,
    startOffset:readerParent.start,
    endOffset:readerParent.end,
    coordinateUnit:'utf16-code-unit',
    astNodeType:'VariableDeclarator'
  });
  const exportMirrorSpan=Object.freeze({
    spanId:exportMirrorSpanId,
    sourceUnitRef,
    sourceGeneration,
    startOffset:exportMirror.declarator.start,
    endOffset:exportMirror.declarator.end,
    coordinateUnit:'utf16-code-unit',
    astNodeType:'VariableDeclarator'
  });
  const binding=Object.freeze({sourceUnitRef,localBindingId:callableNode.start});
  const definition=Object.freeze({
    definitionId,
    bindingRef:bindingId,
    definitionSpanId:callableSpanId,
    kind:'function-declaration',
    sourceOrder:callableNode.start,
    controlFlowPointId:'module-entry',
    branchGuardIds:Object.freeze([])
  });
  const readerBinding=Object.freeze({
    sourceUnitRef,localBindingId:readerParent.id.start
  });
  const readerDefinition=Object.freeze({
    definitionId:readerDefinitionId,
    bindingRef:readerBindingId,
    definitionSpanId:readerResultSpanId,
    kind:'lexical-initializer',
    sourceOrder:readerParent.start,
    controlFlowPointId:'module-entry',
    branchGuardIds:Object.freeze([])
  });
  const exportBinding=Object.freeze({
    sourceUnitRef,localBindingId:exportMirror.declarator.id.start
  });
  const exportDefinition=Object.freeze({
    definitionId:exportDefinitionId,
    bindingRef:exportBindingId,
    definitionSpanId:exportMirrorSpanId,
    kind:'lexical-initializer',
    sourceOrder:exportMirror.declarator.start,
    controlFlowPointId:'module-entry',
    branchGuardIds:Object.freeze([])
  });
  const callable=Object.freeze({
    callableDefinitionId,
    sourceUnitRef,
    sourceSpanId:callableSpanId,
    lexicalDefinitionRef:definitionId,
    ownerDefinitionRef:null,
    propertyKeyIdentity:null,
    homeObjectValueRef:null,
    usesThis:false,
    usesSuper:false,
    kind:'function-declaration'
  });
  const value=Object.freeze({
    valueRef,
    sourceUnitRef,
    originSpanId:callableSpanId,
    originDefinitionRef:definitionId
  });
  const valueFact=Object.freeze({
    categoryPossibilities:Object.freeze(['Callable']),
    proofStatus:'proven',
    originDefinitionRefs:Object.freeze([definitionId]),
    callableDefinitionRefs:Object.freeze([callableDefinitionId]),
    wellKnownSymbolRefs:Object.freeze([]),
    propertyKeyIdentityRefs:Object.freeze([]),
    originSourceUnitRefs:Object.freeze([sourceUnitRef]),
    pathProvenance:Object.freeze([]),
    capabilities:Object.freeze(['SourceObservable'])
  });
  const resultValue=Object.freeze({
    valueRef:resultValueRef,
    sourceUnitRef,
    originSpanId:readerSpanId,
    originDefinitionRef:null
  });
  const resultValueFact=Object.freeze({
    categoryPossibilities:Object.freeze(['Primitive','Unknown']),
    proofStatus:'unknown',
    originDefinitionRefs:Object.freeze([]),
    callableDefinitionRefs:Object.freeze([]),
    wellKnownSymbolRefs:Object.freeze([]),
    propertyKeyIdentityRefs:Object.freeze([]),
    originSourceUnitRefs:Object.freeze([sourceUnitRef]),
    pathProvenance:Object.freeze([]),
    capabilities:Object.freeze([])
  });
  const readerValue=Object.freeze({
    valueRef:readerValueRef,
    sourceUnitRef,
    originSpanId:readerResultSpanId,
    originDefinitionRef:readerDefinitionId
  });
  const readerValueFact=Object.freeze({
    categoryPossibilities:Object.freeze(['Primitive','Unknown']),
    proofStatus:'unknown',
    originDefinitionRefs:Object.freeze([readerDefinitionId]),
    callableDefinitionRefs:Object.freeze([]),
    wellKnownSymbolRefs:Object.freeze([]),
    propertyKeyIdentityRefs:Object.freeze([]),
    originSourceUnitRefs:Object.freeze([sourceUnitRef]),
    pathProvenance:Object.freeze([]),
    capabilities:Object.freeze([])
  });
  const exportValue=Object.freeze({
    valueRef:exportValueRef,
    sourceUnitRef,
    originSpanId:exportMirrorSpanId,
    originDefinitionRef:exportDefinitionId
  });
  const exportValueFact=Object.freeze({
    categoryPossibilities:Object.freeze(['Primitive','Unknown']),
    proofStatus:'unknown',
    originDefinitionRefs:Object.freeze([exportDefinitionId]),
    callableDefinitionRefs:Object.freeze([]),
    wellKnownSymbolRefs:Object.freeze([]),
    propertyKeyIdentityRefs:Object.freeze([]),
    originSourceUnitRefs:Object.freeze([sourceUnitRef]),
    pathProvenance:Object.freeze([]),
    capabilities:Object.freeze([])
  });
  const callSite=Object.freeze({
    callSiteId,
    sourceUnitRef,
    sourceSpanId:readerSpanId,
    callerActivationRef:null,
    invocationKind:'call',
    calleeValueRef:null,
    calleeBindingRef:null,
    targetCallableDefinitionRefs:Object.freeze([]),
    targetResolutionStatus:'external',
    controlFlowPointId:'module-entry',
    branchGuardIds:Object.freeze([])
  });
  const hostEffect=Object.freeze({
    effectId,
    causedByEffectId:null,
    kind:'SourceMirrorRead',
    operationSpan:readerSpanId,
    callSiteRef:callSiteId,
    callerActivationRef:null,
    abstractOperation:'Function.prototype.toString under the declared pristine-intrinsics premise',
    observationEffects:Object.freeze(['ExactSource','UnknownHostEffect']),
    conversionHint:null,
    proxyTrapName:null,
    interfaceIdentity:'Function',
    receiverRef:null,
    receiverProvenance:'unknown',
    receiverLookupRoute:'unknown',
    effectiveDispatchStatus:'unknown-or-mutable',
    effectiveOperationRef:hostIntrinsic,
    conversionTarget:null,
    operandRole:'this',
    argumentIndex:0,
    operandPath:null,
    propertyKeyIdentityRef:null,
    resultValueRef,
    hostContractRef:hostContractId,
    callbackRole:null,
    callbackTiming:null
  });
  const valueEdge=Object.freeze({
    effectId,
    role:'observed',
    valueRef,
    callSiteRef:callSiteId,
    operandRole:'this',
    argumentIndex:0,
    operandPath:null
  });
  const assignmentFlowEdge=Object.freeze({
    edgeId:'value-flow:'+effectId+':result-assignment',
    fromValueRef:resultValueRef,
    toValueRef:readerValueRef,
    kind:'assignment',
    sourceSpanId:readerResultSpanId,
    callSiteRef:null,
    controlFlowPointId:'module-entry',
    branchGuardIds:Object.freeze([]),
    targetCallableDefinitionRef:null,
    ownerValueRef:null,
    receiverValueRef:null,
    reflectionOperation:null,
    argumentIndex:null,
    propertyKeyIdentity:null,
    operandPath:null
  });
  const exportFlowEdge=Object.freeze({
    edgeId:'value-flow:'+effectId+':export',
    fromValueRef:readerValueRef,
    toValueRef:exportValueRef,
    kind:'export',
    sourceSpanId:exportMirrorSpanId,
    callSiteRef:null,
    controlFlowPointId:'module-entry',
    branchGuardIds:Object.freeze([]),
    targetCallableDefinitionRef:null,
    ownerValueRef:null,
    receiverValueRef:null,
    reflectionOperation:null,
    argumentIndex:null,
    propertyKeyIdentity:null,
    operandPath:null
  });
  const mirror=Object.freeze({
    sourceMirrorRef:mirrorId,
    sourceUnitRef,
    mirrorKind:'function-source',
    embeddingKind:'unknown',
    embeddingSourceUnitRef:null,
    embeddingIdentity:null,
    readerOperation:'Function.prototype.toString',
    readerOperationRef:hostIntrinsic,
    hostContractRef:hostContractId,
    callableDefinitionRef:callableDefinitionId,
    callableSourceSpanId:callableSpanId
  });
  const mirrorRead=Object.freeze({
    edgeId:'mirror-read:'+effectId,
    effectId,
    sourceMirrorRef:mirrorId,
    readerSpanId,
    observedSourceUnitRef:sourceUnitRef,
    observedCallableDefinitionRef:callableDefinitionId,
    observedValueRef:valueRef,
    observationEffect:'ExactSource'
  });
  const planPayload=JSON.stringify([
    'source-observation-plan-generation-v1',
    sourceUnitRef,hostContractId,readerSpanId,callableSpanId,
    readerResultSpanId,exportMirrorSpanId
  ]);
  if(typeof planPayload!=='string')return null;
  const planGeneration=createHash('sha256').update(planPayload).digest('hex');
  const plan={
    planId:'plan:'+planGeneration,
    planGeneration,
    sourceUnits:readonlyMap([[sourceUnitRef,sourceUnit]]),
    sourceSpans:readonlyMap(/** @type {Array<[string,SourceSpanRef]>} */ ([
      [callableSpanId,callableSpan],[readerSpanId,readerSpan],
      [readerResultSpanId,readerResultSpan],[exportMirrorSpanId,exportMirrorSpan]
    ])),
    threatModels:readonlyMap([[threatModelId,threatModel]]),
    moduleResolutionEdges:emptyObjectMap(),
    sourceDeliveryEdges:emptyObjectMap(),
    scoPartitionEligibility:emptyObjectMap(),
    wellKnownSymbols:emptyObjectMap(),
    propertyKeyIdentities:emptyObjectMap(),
    bindings:readonlyMap(/** @type {Array<[string,Object]>} */ ([
      [bindingId,binding],[readerBindingId,readerBinding],[exportBindingId,exportBinding]
    ])),
    definitions:readonlyMap(/** @type {Array<[string,Object]>} */ ([
      [definitionId,definition],[readerDefinitionId,readerDefinition],[exportDefinitionId,exportDefinition]
    ])),
    callableDefinitions:readonlyMap([[callableDefinitionId,callable]]),
    activations:emptyObjectMap(),
    values:readonlyMap(/** @type {Array<[string,Object]>} */ ([
      [valueRef,value],[resultValueRef,resultValue],
      [readerValueRef,readerValue],[exportValueRef,exportValue]
    ])),
    valueFacts:readonlyMap(/** @type {Array<[string,Object]>} */ ([
      [valueRef,valueFact],[resultValueRef,resultValueFact],
      [readerValueRef,readerValueFact],[exportValueRef,exportValueFact]
    ])),
    valueFlowEdges:readonlyMap(/** @type {Array<[string,Object]>} */ ([
      [assignmentFlowEdge.edgeId,assignmentFlowEdge],[exportFlowEdge.edgeId,exportFlowEdge]
    ])),
    callSites:readonlyMap([[callSiteId,callSite]]),
    callTargets:emptyStringSetMap(),
    hostArgumentEdges:readonlyMap([[readerSpanId,readonlySet([callableDefinitionId])]]),
    hostEffects:readonlyMap([[effectId,hostEffect]]),
    valueEdges:readonlyMap([[effectId,Object.freeze([valueEdge])]]),
    activeFrameEdges:readonlyMap([[effectId,Object.freeze([])]]),
    effectClosures:readonlyMap([[
      effectId,readonlySet([callableSpanId,readerSpanId,readerResultSpanId,exportMirrorSpanId])
    ]]),
    hostContracts:readonlyMap([[hostContractId,contract]]),
    deploymentManifestId:null,
    sourceMirrors:readonlyMap([[mirrorId,mirror]]),
    sourceMirrorReadEdges:readonlyMap([[mirrorRead.edgeId,mirrorRead]]),
    receiverRefs:emptyObjectMap(),
    effects:readonlyMap([
      [callableSpanId,readonlySet(['ExactSource','UnknownHostEffect'])],
      [readerSpanId,readonlySet(['ExactSource','UnknownHostEffect'])],
      [readerResultSpanId,readonlySet(['ExactSource','UnknownHostEffect'])],
      [exportMirrorSpanId,readonlySet(['ExactSource','UnknownHostEffect'])]
    ]),
    semanticClosures:readonlyMap([[
      callableSpanId,readonlySet([callableSpanId,readerSpanId,readerResultSpanId,exportMirrorSpanId])
    ]]),
    unsupportedSpans:readonlySet(/** @type {string[]} */ ([]))
  };
  Object.freeze(plan);
  validatedPlans.add(plan);
  planMetadata.set(plan,{
    source,
    path,
    sourceUnitRef,
    parserContractId,
    callableName,
    callableSpanId,
    readerSpanId,
    readerFrameOffset,
    readerBindingName,
    exportBindingName,
    readerResultSpanId,
    exportMirrorSpanId,
    originalStringBindingPresent:collectBindingNames(ast).has('String'),
    effectId
  });
  return /** @type {SourceObservationPlan} */ (plan);
}

/**
 * @param {unknown} plan
 * @returns {plan is SourceObservationPlan}
 */
function isValidatedSourceObservationPlan(plan) {
  return Boolean(plan&&typeof plan==='object'&&validatedPlans.has(plan));
}

/**
 * Return initial current-generation ranges. SourceSpanRef objects in the plan
 * are never mutated or re-minted; MappedSourceRange is separate pass state.
 * @param {SourceObservationPlan} plan
 * @param {string} sourceUnitRef
 * @returns {{protectedSourceRanges:MappedSourceRange[],trackedSourceRanges:MappedSourceRange[]}}
 */
function getInitialPlanRanges(plan,sourceUnitRef) {
  if(!isValidatedSourceObservationPlan(plan))throw new TypeError('Unvalidated SourceObservationPlan');
  const meta=planMetadata.get(plan);
  if(!meta||meta.sourceUnitRef!==sourceUnitRef)throw new TypeError('SourceObservationPlan source unit mismatch');
  const trackedSourceRanges=[...plan.sourceSpans.values()].map(span=>{
    const range=Object.freeze({
      sourceUnitRef:span.sourceUnitRef,
      sourceGeneration:span.sourceGeneration,
      originSpanId:span.spanId,
      startOffset:span.startOffset,
      endOffset:span.endOffset,
      coordinateUnit:span.coordinateUnit
    });
    planRangeOwners.set(range,plan);
    return range;
  });
  const protectedIds=new Set();
  for(const closure of plan.effectClosures.values())for(const spanId of closure)protectedIds.add(spanId);
  for(const range of trackedSourceRanges) {
    if(!range||planRangeOwners.get(range)!==plan)throw new TypeError('Untrusted mapped source range');
  }
  const protectedSourceRanges=trackedSourceRanges.filter(range=>protectedIds.has(range.originSpanId));
  return {protectedSourceRanges,trackedSourceRanges};
}

/**
 * @param {SourceObservationPlan} plan
 * @param {MappedSourceRange[]} trackedSourceRanges
 * @returns {MappedSourceRange[]}
 */
function protectedRangesFromTracked(plan,trackedSourceRanges) {
  if(!isValidatedSourceObservationPlan(plan))throw new TypeError('Unvalidated SourceObservationPlan');
  const protectedIds=new Set();
  for(const closure of plan.effectClosures.values())for(const spanId of closure)protectedIds.add(spanId);
  return trackedSourceRanges.filter(range=>protectedIds.has(range.originSpanId));
}

/**
 * Validate the producer capability and current-generation protected ranges
 * before a transform consumer may bypass its broad whole-file observer veto.
 *
 * @param {SourceObservationPlan} plan
 * @param {string} source
 * @param {string} sourceUnitRef
 * @param {string} parserContractId
 * @param {MappedSourceRange[]} protectedSourceRanges
 * @returns {true}
 */
function validatePlanConsumerInput(plan,source,sourceUnitRef,parserContractId,protectedSourceRanges) {
  if(!isValidatedSourceObservationPlan(plan))throw new TypeError('Unvalidated SourceObservationPlan');
  const meta=planMetadata.get(plan);
  if(!meta||meta.sourceUnitRef!==sourceUnitRef||meta.parserContractId!==parserContractId) {
    throw new TypeError('SourceObservationPlan unit/parser contract mismatch');
  }
  const generation=sourceGenerationOf(source,parserContractId);
  const expected=new Set();
  for(const closure of plan.effectClosures.values())for(const spanId of closure)expected.add(spanId);
  const actual=new Set();
  for(const range of protectedSourceRanges) {
    if(!range||typeof range!=='object'||planRangeOwners.get(range)!==plan||
       typeof range.originSpanId!=='string'||!expected.has(range.originSpanId)||
       actual.has(range.originSpanId)||range.sourceUnitRef!==sourceUnitRef||
       range.sourceGeneration!==generation||range.coordinateUnit!=='utf16-code-unit'||
       !Number.isInteger(range.startOffset)||!Number.isInteger(range.endOffset)||
       range.startOffset<0||range.endOffset<range.startOffset||range.endOffset>source.length) {
      throw new TypeError('Transform received an untrusted, stale, foreign, or incomplete protected source range');
    }
    actual.add(range.originSpanId);
  }
  if(actual.size!==expected.size)throw new TypeError('Transform received incomplete protected source coverage');
  return true;
}

/**
 * Advance all original-span associations through one exact pass map.
 * A null result means the pass changed or ambiguously mapped a tracked span.
 *
 * @param {SourceObservationPlan} plan
 * @param {import('./source-edit-map').SourceEditMap} editMap
 * @param {string} sourceBefore
 * @param {string} sourceAfter
 * @param {MappedSourceRange[]} trackedSourceRanges
 * @returns {MappedSourceRange[]|null}
 */
function advancePlanRanges(plan,editMap,sourceBefore,sourceAfter,trackedSourceRanges) {
  if(!isValidatedSourceObservationPlan(plan))throw new TypeError('Unvalidated SourceObservationPlan');
  const next=[];
  for(const range of trackedSourceRanges) {
    if(!range||typeof range!=='object'||planRangeOwners.get(range)!==plan)return null;
    const mapped=mapMappedSourceRange(editMap,range,sourceBefore,sourceAfter);
    if(!mapped)return null;
    planRangeOwners.set(mapped,plan);
    next.push(mapped);
  }
  return next;
}

/**
 * Reparse/rebind acceptance for the finite first slice. Preserve the exact
 * callable, direct reader, reader-result binding and exported mirror path.
 * Unknown bindings or added callable/reader syntax fail closed.
 *
 * @param {SourceObservationPlan} plan
 * @param {string} source
 * @param {AstNode} ast
 * @param {MappedSourceRange[]} trackedSourceRanges
 * @param {import('./source-edit-map').SourceEditMap} [editMap]
 * @returns {boolean}
 */
function validatePlanSemantics(plan,source,ast,trackedSourceRanges,editMap) {
  if(!isValidatedSourceObservationPlan(plan)||
     trackedSourceRanges.some(range=>!range||typeof range!=='object'||
       planRangeOwners.get(range)!==plan))return false;
  const meta=planMetadata.get(plan);
  if(!meta)return false;
  const generation=sourceGenerationOf(source,meta.parserContractId);
  if(trackedSourceRanges.length!==plan.sourceSpans.size||
     trackedSourceRanges.some(range=>range.sourceGeneration!==generation))return false;
  try {
    validatePlanConsumerInput(plan,source,meta.sourceUnitRef,meta.parserContractId,
      protectedRangesFromTracked(plan,trackedSourceRanges));
  } catch {
    return false;
  }
  const byId=new Map(trackedSourceRanges.map(range=>[range.originSpanId,range]));
  if(byId.size!==plan.sourceSpans.size)return false;
  for(const [spanId,span] of plan.sourceSpans) {
    const range=byId.get(spanId);
    if(!range||range.sourceUnitRef!==meta.sourceUnitRef||
       range.sourceGeneration!==generation||
       source.slice(range.startOffset,range.endOffset)!==
         meta.source.slice(span.startOffset,span.endOffset))return false;
    let matched=false;
    walk(ast,node=>{
      if(node.start===range.startOffset&&node.end===range.endOffset&&
         node.type===span.astNodeType)matched=true;
    });
    if(!matched)return false;
  }
  const callableRange=byId.get(meta.callableSpanId);
  const readerRange=byId.get(meta.readerSpanId);
  const readerResultRange=byId.get(meta.readerResultSpanId);
  const exportMirrorRange=byId.get(meta.exportMirrorSpanId);
  const found={
    callableMatches:0,
    readerMatches:0,
    readerResultMatches:0,
    exportMirrorMatches:0,
    callableTopLevel:false,
    /** @type {AstNode|null} */ currentReader:null,
    /** @type {AstNode|null} */ readerResultNode:null,
    /** @type {AstNode|null} */ readerResultDeclaration:null,
    /** @type {AstNode[]} */ readerResultAncestors:[],
    /** @type {AstNode|null} */ exportMirrorNode:null,
    /** @type {AstNode|null} */ exportMirrorDeclaration:null,
    /** @type {AstNode[]} */ exportMirrorAncestors:[]
  };
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type==='FunctionDeclaration'&&node.start===callableRange?.startOffset&&
       node.end===callableRange?.endOffset&&node.id?.name===meta.callableName) {
      found.callableMatches++;
      found.callableTopLevel=ancestors.length===1&&ancestors[0].type==='Program';
    }
    if(node.type==='CallExpression'&&node.start===readerRange?.startOffset&&
       node.end===readerRange?.endOffset&&isDirectFunctionSourceCall(node)&&
       node.arguments[0]?.name===meta.callableName) {
      found.readerMatches++;
      found.currentReader=node;
    }
    if(node.type==='VariableDeclarator'&&
       node.start===readerResultRange?.startOffset&&
       node.end===readerResultRange?.endOffset) {
      found.readerResultMatches++;
      found.readerResultNode=node;
      found.readerResultDeclaration=parent;
      found.readerResultAncestors=ancestors;
    }
    if(node.type==='VariableDeclarator'&&
       node.start===exportMirrorRange?.startOffset&&
       node.end===exportMirrorRange?.endOffset) {
      found.exportMirrorMatches++;
      found.exportMirrorNode=node;
      found.exportMirrorDeclaration=parent;
      found.exportMirrorAncestors=ancestors;
    }
  });
  if(found.callableMatches!==1||found.readerMatches!==1||
     found.readerResultMatches!==1||found.exportMirrorMatches!==1||
     !found.callableTopLevel||!found.currentReader||
     !found.readerResultNode||!found.exportMirrorNode)return false;

  // A hostile Function.prototype.toString replacement can observe the caller
  // frame through Error.stack. The protected call text may map exactly while a
  // prepended decoder prologue still changes its line/column. Preserve the
  // original callee-property token's FramePosition across every accepted pass.
  const originalReaderFramePosition=framePositionOf(meta.source,meta.readerFrameOffset);
  const currentReaderFramePosition=framePositionOf(
    source,found.currentReader.callee.property.start);
  if(!originalReaderFramePosition||!currentReaderFramePosition||
     originalReaderFramePosition.line!==currentReaderFramePosition.line||
     originalReaderFramePosition.columnUtf16!==currentReaderFramePosition.columnUtf16||
     originalReaderFramePosition.columnCodePoints!==currentReaderFramePosition.columnCodePoints)return false;

  const readerResultTopLevel=found.readerResultDeclaration?.type==='VariableDeclaration'&&
    found.readerResultDeclaration.kind==='const'&&
    found.readerResultDeclaration.declarations.length===1&&
    found.readerResultAncestors.length===2&&
    found.readerResultAncestors[0].type==='Program'&&
    found.readerResultAncestors[1]===found.readerResultDeclaration;
  const exportStatement=found.exportMirrorAncestors.find(ancestor=>
    ancestor.type==='ExportNamedDeclaration');
  const exportMirrorTopLevel=found.exportMirrorDeclaration?.type==='VariableDeclaration'&&
    found.exportMirrorDeclaration.kind==='const'&&
    found.exportMirrorDeclaration.declarations.length===1&&
    found.exportMirrorAncestors.length===3&&
    found.exportMirrorAncestors[0].type==='Program'&&
    found.exportMirrorAncestors[1]===exportStatement&&
    found.exportMirrorAncestors[2]===found.exportMirrorDeclaration&&
    exportStatement?.declaration===found.exportMirrorDeclaration&&
    !exportStatement.source&&exportStatement.specifiers.length===0;
  const rebound=inspectDeclarations(ast,found.currentReader);
  const readerTopLevel=rebound.readerParent===found.readerResultNode&&
    rebound.readerKey==='init'&&found.readerResultNode.init===found.currentReader&&
    found.readerResultNode.id?.type==='Identifier'&&
    found.readerResultNode.id.name===meta.readerBindingName&&readerResultTopLevel;
  const exportFlowPreserved=found.exportMirrorNode.id?.type==='Identifier'&&
    found.exportMirrorNode.id.name===meta.exportBindingName&&
    found.exportMirrorNode.init?.type==='Identifier'&&
    found.exportMirrorNode.init.name===meta.readerBindingName&&exportMirrorTopLevel;

  const identifierCounts=new Map();
  let directReaderCount=0,functionLikeCount=0;
  walk(ast,node=>{
    if(node.type==='Identifier') {
      identifierCounts.set(node.name,(identifierCounts.get(node.name)??0)+1);
    }
    if(node.type==='CallExpression'&&isDirectFunctionSourceCall(node))directReaderCount++;
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
        'ClassDeclaration','ClassExpression'].includes(node.type))functionLikeCount++;
  });
  if(editMap&&(editMap.sourceUnitRef!==meta.sourceUnitRef||
     editMap.parserContractId!==meta.parserContractId||
     editMap.toGeneration!==generation))return false;
  const decoder=collectStringDecoderContext(ast,editMap);
  if(!decoder.valid)return false;
  const bindingNames=collectBindingNames(ast);
  let stringDecoderCallCount=0;
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type==='Identifier'&&node.name==='String'&&
       isDirectStringFromCharCodeReference({name:'String',node,parent,ancestors})&&
       isInsideRanges(node,decoder.prologueRanges)) {
      stringDecoderCallCount++;
    }
  });
  const stringBindingSafe=
    (meta.originalStringBindingPresent||!bindingNames.has('String'))&&
    !(bindingNames.has('String')&&stringDecoderCallCount>0);
  let unsupportedModuleSyntax=false;
  walk(ast,node=>{
    if(node.type==='ImportDeclaration'||node.type==='ImportExpression'||
       node.type==='ExportAllDeclaration')unsupportedModuleSyntax=true;
    if(node.type==='ExportNamedDeclaration'&&
       (node.source||node.specifiers.length>0))unsupportedModuleSyntax=true;
  });
  const freeReferences=collectFreeIdentifierReferences(ast);
  const noUnapprovedFreeRoots=freeReferences.every(reference=>
    reference.name==='Function'||
    (reference.name==='String'&&isDirectStringFromCharCodeReference(reference)&&
      isInsideRanges(reference.node,decoder.prologueRanges)));
  let unsafeEffectSyntax=false;
  walk(ast,node=>{
    if(node.type==='MemberExpression') {
      const propertyName=staticMemberPropertyName(node);
      if(propertyName==='constructor'||propertyName==='__proto__') {
        unsafeEffectSyntax=true;
      }
      if(node.computed) {
        const objectName=node.object?.type==='Identifier'?node.object.name:null;
        const inGeneratedRange=isInsideRanges(node,decoder.prologueRanges)||
          isInsideRanges(node,decoder.replacementRanges);
        if(!inGeneratedRange||!decoder.decoderArrayNames.has(objectName)) {
          unsafeEffectSyntax=true;
        }
      }
    }
    if(node.type==='CallExpression'&&
       !isAllowedPlanCall(node,found.currentReader,decoder))unsafeEffectSyntax=true;
    if(node.type==='NewExpression')unsafeEffectSyntax=true;
    if(node.type==='AssignmentExpression'&&node.left?.type==='MemberExpression') {
      const objectName=node.left.object?.type==='Identifier'?node.left.object.name:null;
      if(!node.left.computed||!decoder.decoderArrayNames.has(objectName)||
         !isInsideRanges(node,decoder.prologueRanges))unsafeEffectSyntax=true;
    }
    if(node.type==='UpdateExpression'&&node.argument?.type==='MemberExpression') {
      unsafeEffectSyntax=true;
    }
    if(node.type==='UnaryExpression'&&node.operator==='delete'&&
       node.argument?.type==='MemberExpression')unsafeEffectSyntax=true;
  });
  const noAmbientShadow=!bindingNames.has('Function')&&
    identifierCounts.get('Function')===1&&stringBindingSafe&&
    !unsupportedModuleSyntax&&noUnapprovedFreeRoots&&!unsafeEffectSyntax;
  const uniqueClosedReader=directReaderCount===1&&functionLikeCount===1&&
    identifierCounts.get(meta.callableName)===2&&
    identifierCounts.get(meta.readerBindingName)===2&&
    identifierCounts.get(meta.exportBindingName)===1;

  return readerTopLevel&&exportFlowPreserved&&noAmbientShadow&&uniqueClosedReader&&
    rebound.counts.get(meta.callableName)===1&&
    rebound.counts.get(meta.readerBindingName)===1&&
    rebound.counts.get(meta.exportBindingName)===1;
}

/**
 * Admit only source edits emitted by the specific trusted compiler pass.
 * Origin labels are compiler provenance, not cryptographic authentication.
 *
 * @param {string} sourceBefore
 * @param {import('./source-edit-map').SourceEditMap} editMap
 * @param {string[]} allowedOrigins
 * @returns {boolean}
 */
function hasApprovedPassEdits(sourceBefore,editMap,allowedOrigins) {
  if(!Array.isArray(allowedOrigins)||!Array.isArray(editMap?.segments))return false;
  const allowed=new Set(allowedOrigins);
  let beforeAst;
  try {beforeAst=parse(sourceBefore,'module');} catch {return false;}
  for(const segment of editMap.segments) {
    if(segment.kind==='unchanged') {
      if(segment.syntheticOriginId!==null)return false;
      continue;
    }
    const origin=segment.syntheticOriginId;
    if(typeof origin!=='string'||!allowed.has(origin))return false;
    if(origin==='strings-decoder-prologue') {
      if(segment.kind!=='inserted')return false;
      continue;
    }
    if(segment.kind!=='replaced')return false;
    let matched=false;
    walk(beforeAst,(node,parent,key)=>{
      if(node.start!==segment.fromStart||node.end!==segment.fromEnd)return;
      if(origin==='properties-local-rename') {
        matched=(node.type==='Identifier'||node.type==='Literal')&&(
          parent?.type==='Property'&&key==='key'||
          parent?.type==='MemberExpression'&&key==='property'||
          parent?.type==='BinaryExpression'&&parent.operator==='in'&&key==='left'
        );
      } else if(origin==='identifiers-local-rename') {
        matched=node.type==='Identifier';
      } else if(origin==='strings-decoder-replacement') {
        matched=node.type==='Literal'&&typeof node.value==='string';
      }
    });
    if(!matched)return false;
  }
  return true;
}

/**
 * Validate a candidate pass transaction without mutating caller state. A
 * null result means the caller must retain its original code, AST and ranges.
 *
 * @param {SourceObservationPlan} plan
 * @param {import('./source-edit-map').SourceEditMap} editMap
 * @param {string} sourceBefore
 * @param {string} sourceAfter
 * @param {AstNode} astAfter
 * @param {MappedSourceRange[]} trackedRanges
 * @param {string[]} [allowedOrigins] Pass-specific compiler edit origins.
 * @returns {{ast:AstNode,trackedRanges:MappedSourceRange[],protectedSourceRanges:MappedSourceRange[]}|null}
 */
function acceptPlannedPass(plan,editMap,sourceBefore,sourceAfter,astAfter,trackedRanges,allowedOrigins=[]) {
  if(!isValidatedSourceObservationPlan(plan)||!editMap||
     typeof sourceBefore!=='string'||typeof sourceAfter!=='string'||
     !astAfter||!Array.isArray(trackedRanges)||!Array.isArray(allowedOrigins))return null;
  if(!hasApprovedPassEdits(sourceBefore,editMap,allowedOrigins))return null;
  const nextRanges=advancePlanRanges(plan,editMap,sourceBefore,sourceAfter,trackedRanges);
  if(!nextRanges||!validatePlanSemantics(plan,sourceAfter,astAfter,nextRanges,editMap))return null;
  return Object.freeze({
    ast:astAfter,
    trackedRanges:nextRanges,
    protectedSourceRanges:protectedRangesFromTracked(plan,nextRanges)
  });
}

module.exports={
  buildDirectFunctionSourcePlan,
  isValidatedSourceObservationPlan,
  getInitialPlanRanges,
  protectedRangesFromTracked,
  validatePlanConsumerInput,
  advancePlanRanges,
  validatePlanSemantics,
  acceptPlannedPass
};
