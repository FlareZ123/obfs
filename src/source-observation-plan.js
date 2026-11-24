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
/** @type {WeakMap<object,{source:string,path:string,sourceUnitRef:string,parserContractId:string,callableName:string,callableSpanId:string,readerSpanId:string,readerBindingName:string,exportBindingName:string,readerResultSpanId:string,exportMirrorSpanId:string,effectId:string}>} */
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
    categoryPossibilities:Object.freeze(['Primitive']),
    proofStatus:'proven',
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
    categoryPossibilities:Object.freeze(['Primitive']),
    proofStatus:'proven',
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
    categoryPossibilities:Object.freeze(['Primitive']),
    proofStatus:'proven',
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
    readerBindingName,
    exportBindingName,
    readerResultSpanId,
    exportMirrorSpanId,
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
 * @returns {boolean}
 */
function validatePlanSemantics(plan,source,ast,trackedSourceRanges) {
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
  const bindingNames=collectBindingNames(ast);
  const noAmbientShadow=bindingNames.has('Function')===false&&
    identifierCounts.get('Function')===1&&
    !['globalThis','window','self','global'].some(name=>identifierCounts.has(name));
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
 * Validate a candidate pass transaction without mutating caller state. A
 * null result means the caller must retain its original code, AST and ranges.
 *
 * @param {SourceObservationPlan} plan
 * @param {import('./source-edit-map').SourceEditMap} editMap
 * @param {string} sourceBefore
 * @param {string} sourceAfter
 * @param {AstNode} astAfter
 * @param {MappedSourceRange[]} trackedRanges
 * @returns {{ast:AstNode,trackedRanges:MappedSourceRange[],protectedSourceRanges:MappedSourceRange[]}|null}
 */
function acceptPlannedPass(plan,editMap,sourceBefore,sourceAfter,astAfter,trackedRanges) {
  if(!isValidatedSourceObservationPlan(plan)||!editMap||
     typeof sourceBefore!=='string'||typeof sourceAfter!=='string'||
     !astAfter||!Array.isArray(trackedRanges))return null;
  const nextRanges=advancePlanRanges(plan,editMap,sourceBefore,sourceAfter,trackedRanges);
  if(!nextRanges||!validatePlanSemantics(plan,sourceAfter,astAfter,nextRanges))return null;
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
