'use strict';

const path=require('node:path');
const {parse}=require('../src/ast');

/**
 * Restricted, read-only CommonJS provenance EXPERIMENT. The output is
 * diagnostics, NOT a sound proof authorizing production rewrites.
 * Only literal relative .cjs requires, immutable lexical aliases, simple
 * function returns, and object-literal records are interpreted. Unknown,
 * mutated or externally supplied values remain unknown.
 *
 * @typedef {'storage'|'callable'|'primitive'|'record'|'unknown'} ValueKind
 * @typedef {{kind:ValueKind,trace:string[],fields?:Map<string,Value>,
 *   callable?:{node:import('../src/ast').AstNode,env:Map<string,Value>,file:string}}} Value
 * @typedef {{file:string,start:number,end:number,key:string|null,
 *   receiver:ValueKind,value:ValueKind,
 *   classification:'source-sensitive'|'primitive-control'|'unknown-host'|'unknown-value'|'local-record',
 *   receiverTrace:string[],valueTrace:string[]}} SourceSink
 * @typedef {{path:string,code:string,sourceType?:'commonjs'|'script'|'module'|'asset'}} SourceFile
 */

/** @param {string} reason @returns {Value} */
function unknown(reason){return {kind:'unknown',trace:[reason]};}
/** @param {string} reason @returns {Value} */
function primitive(reason){return {kind:'primitive',trace:[reason]};}
/** @param {string} reason @returns {Value} */
function storage(reason){return {kind:'storage',trace:[reason]};}
/** @param {Map<string,Value>} fields @param {string} reason @returns {Value} */
function record(fields,reason){return {kind:'record',fields,trace:[reason]};}
/**
 * @param {import('../src/ast').AstNode} node
 * @param {Map<string,Value>} env
 * @param {string} file
 * @returns {Value}
 */
function callable(node,env,file){
  return {kind:'callable',callable:{node,env,file},trace:[file+':'+node.start]};
}
/**
 * @param {import('../src/ast').AstNode|null|undefined} node
 * @returns {string|null}
 */
function propertyName(node){
  if(!node)return null;
  if(node.type==='Identifier')return node.name;
  if(node.type==='Literal'&&typeof node.value==='string')return node.value;
  return null;
}
/**
 * @param {import('../src/ast').AstNode} node
 * @param {Set<string>} into
 * @returns {void}
 */
function declarePattern(node,into){
  if(node.type==='Identifier'){into.add(node.name);return;}
  if(node.type==='AssignmentPattern'){declarePattern(node.left,into);return;}
  if(node.type==='RestElement'){declarePattern(node.argument,into);return;}
  if(node.type==='ObjectPattern'||node.type==='ArrayPattern'){
    for(const part of node.properties??node.elements??[]){
      if(part?.type==='Property')declarePattern(part.value,into);
      else if(part)declarePattern(part,into);
    }
  }
}
/**
 * @param {import('../src/ast').AstNode[]} statements
 * @returns {Set<string>}
 */
function declarations(statements){
  const names=new Set();
  for(const statement of statements){
    if(statement.type==='VariableDeclaration')
      for(const declarator of statement.declarations)declarePattern(declarator.id,names);
    if((statement.type==='FunctionDeclaration'||statement.type==='ClassDeclaration')&&
       statement.id?.type==='Identifier')names.add(statement.id.name);
  }
  return names;
}

/**
 * Inspect a bounded two-file-or-larger CommonJS graph for known native Storage
 * receivers flowing through exports, function returns, and lexical aliases.
 * This is a *may-source-observation warning* generator, never an authorization
 * to perform a source edit. In particular unmodeled getters, proxies, mutable
 * exports, conditionals, loops and reflective dispatch remain unknown.
 *
 * @param {SourceFile[]} files
 * @returns {SourceSink[]}
 */
function traceCjsStorageSourceSinks(files){
  if(!Array.isArray(files))throw new TypeError('files must be an array');
  /** @type {Map<string,SourceFile>} */
  const byName=new Map();
  for(const file of files){
    if(!file||typeof file.path!=='string'||typeof file.code!=='string'||
       (file.sourceType!==undefined&&file.sourceType!=='commonjs')||
       byName.has(file.path))throw new TypeError('Expected distinct CommonJS text files');
    byName.set(file.path,file);
  }
  /** @type {Map<string,Value>} */
  const exportsCache=new Map();
  /** @type {Set<string>} */
  const inProgress=new Set();
  /** @type {SourceSink[]} */
  const findings=[];

  /**
   * Resolve a simple static require path; dynamic or package resolution is
   * Unknown, never guessed from a source file's stem.
   * @param {string} from
   * @param {string} requested
   * @returns {string|null}
   */
  function resolveRequire(from,requested){
    if(!requested.startsWith('./')&&!requested.startsWith('../'))return null;
    const name=path.posix.normalize(path.posix.join(path.posix.dirname(from),requested));
    return name.endsWith('.cjs')&&byName.has(name)?name:null;
  }

  /**
   * @param {import('../src/ast').AstNode} expr
   * @param {Map<string,Value>} env
   * @param {Set<string>} shadowed
   * @param {string} file
   * @param {Set<import('../src/ast').AstNode>} running
   * @returns {Value}
   */
  function evaluate(expr,env,shadowed,file,running){
    if(expr.type==='Literal'&&(
      expr.value===null||['string','number','boolean','bigint'].includes(typeof expr.value)))
      return primitive(file+':literal@'+expr.start);
    if(expr.type==='Identifier'){
      if(env.has(expr.name))return /** @type {Value} */ (env.get(expr.name));
      if(shadowed.has(expr.name))return unknown(file+':shadowed '+expr.name);
      if(expr.name==='localStorage'||expr.name==='sessionStorage')
        return storage(file+':global '+expr.name);
      return unknown(file+':unknown '+expr.name);
    }
    if(expr.type==='MemberExpression'){
      const key=expr.computed?
        (expr.property.type==='Literal'?propertyName(expr.property):null):
        propertyName(expr.property);
      if(!key)return unknown(file+':dynamic property@'+expr.start);
      if(expr.object.type==='Identifier'&&expr.object.name==='globalThis'&&
         !shadowed.has('globalThis')&&!env.has('globalThis')&&
         (key==='localStorage'||key==='sessionStorage'))
        return storage(file+':globalThis.'+key);
      const receiver=evaluate(expr.object,env,shadowed,file,running);
      return receiver.kind==='record'&&receiver.fields?.has(key)?
        /** @type {Value} */ (receiver.fields.get(key)):
        unknown(file+':unproved member '+key);
    }
    if(expr.type==='ObjectExpression'){
      /** @type {Map<string,Value>} */
      const fields=new Map();
      for(const prop of expr.properties){
        if(prop.type!=='Property'||prop.kind!=='init'||prop.computed||
           prop.method||prop.shorthand)return unknown(file+':dynamic record@'+expr.start);
        const key=propertyName(prop.key);
        if(!key||fields.has(key))return unknown(file+':ambiguous record key');
        fields.set(key,evaluate(prop.value,env,shadowed,file,running));
      }
      return record(fields,file+':record@'+expr.start);
    }
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(expr.type))
      return callable(expr,env,file);
    if(expr.type==='CallExpression'&&!expr.optional){
      if(expr.callee.type==='Identifier'&&expr.callee.name==='require'&&
         !shadowed.has('require')&&!env.has('require')&&expr.arguments.length===1&&
         expr.arguments[0].type==='Literal'&&
         typeof expr.arguments[0].value==='string'){
        const target=resolveRequire(file,expr.arguments[0].value);
        return target?readModule(target):unknown(file+':unresolved require');
      }
      const callee=evaluate(expr.callee,env,shadowed,file,running);
      if(callee.kind!=='callable'||!callee.callable)return unknown(file+':unknown call');
      const args=expr.arguments.map(arg=>arg.type==='SpreadElement'?
        unknown(file+':spread actual'):evaluate(arg,env,shadowed,file,running));
      const returned=executeLiteralFunction(callee.callable,args,running);
      return {...returned,trace:[...callee.trace,...returned.trace,file+':call@'+expr.start]};
    }
    return unknown(file+':unsupported '+expr.type+'@'+expr.start);
  }

  /**
   * @param {{node:import('../src/ast').AstNode,env:Map<string,Value>,file:string}} fn
   * @param {Value[]} args
   * @param {Set<import('../src/ast').AstNode>} running
   * @returns {Value}
   */
  function executeLiteralFunction(fn,args,running){
    const node=fn.node;
    if(running.has(node)||running.size>=12||node.params.length!==args.length||
       node.async||node.generator)return unknown(fn.file+':recursive/opaque function');
    /** @type {Map<string,Value>} */
    const env=new Map(fn.env);
    for(let index=0;index<node.params.length;index++){
      const param=node.params[index];
      if(param.type!=='Identifier')return unknown(fn.file+':complex formal');
      env.set(param.name,args[index]);
    }
    const next=new Set(running);next.add(node);
    if(node.body.type!=='BlockStatement')
      return evaluate(node.body,env,new Set(),fn.file,next);
    const statements=node.body.body;
    const localNames=declarations(statements);
    for(const param of node.params)if(param.type==='Identifier')localNames.add(param.name);
    for(const statement of statements){
      if(statement.type==='FunctionDeclaration'&&statement.id?.type==='Identifier')
        env.set(statement.id.name,callable(statement,env,fn.file));
    }
    let returned=false;
    for(const statement of statements){
      if(statement.type==='FunctionDeclaration'||statement.type==='EmptyStatement')continue;
      if(statement.type==='ExpressionStatement'&&statement.expression.type==='Literal'&&
         typeof statement.expression.value==='string')continue;
      if(statement.type==='VariableDeclaration'&&statement.kind==='const'&&
         statement.declarations.every(d=>d.id.type==='Identifier'&&d.init)){
        for(const d of statement.declarations)
          env.set(d.id.name,evaluate(d.init,env,localNames,fn.file,next));
        continue;
      }
      if(statement.type==='ExpressionStatement'&&
         statement.expression.type==='AssignmentExpression'&&
         statement.expression.operator==='='){
        observe(statement.expression,env,localNames,fn.file);
        continue;
      }
      if(statement.type==='ReturnStatement'&&statement.argument&&!returned)
        return evaluate(statement.argument,env,localNames,fn.file,next);
      return unknown(fn.file+':opaque function statement '+statement.type);
    }
    return unknown(fn.file+':function has no return');
  }

  /**
   * Assign declared unique identifiers and literal object destructuring.
   * Other patterns are marked unknown rather than silently ignored.
   * @param {import('../src/ast').AstNode} pattern
   * @param {Value} value
   * @param {Map<string,Value>} env
   * @returns {void}
   */
  function bindPattern(pattern,value,env){
    if(pattern.type==='Identifier'){env.set(pattern.name,value);return;}
    if(pattern.type==='ObjectPattern'){
      for(const item of pattern.properties){
        if(item.type==='Property'&&!item.computed&&item.value.type==='Identifier'){
          const key=propertyName(item.key);
          env.set(item.value.name,key&&value.kind==='record'&&value.fields?.has(key)?
            /** @type {Value} */ (value.fields.get(key)):unknown('unknown destructuring'));
        }else if(item.type==='RestElement'&&item.argument.type==='Identifier')
          env.set(item.argument.name,unknown('rest object'));
      }
      return;
    }
    // No positive provenance from unsupported binding patterns.
  }

  /**
   * An unmodeled call/statement can mutate any escaped local record. Refuse
   * to keep a stale plain-record provenance proof. Preserve object identity
   * so every alias observes the same invalidation.
   * @param {Value} value
   * @param {string} reason
   * @param {Set<Value>} [visited]
   * @returns {void}
   */
  function invalidateRecord(value,reason,visited=new Set()){
    if(value.kind!=='record'||visited.has(value))return;
    visited.add(value);
    if(value.fields)for(const child of value.fields.values())
      invalidateRecord(child,reason,visited);
    value.kind='unknown';
    value.trace=[reason];
  }

  /**
   * @param {import('../src/ast').AstNode} assignment
   * @param {Map<string,Value>} env
   * @param {Set<string>} shadowed
   * @param {string} file
   * @returns {void}
   */
  function observe(assignment,env,shadowed,file){
    if(assignment.operator!=='='||assignment.left.type!=='MemberExpression')return;
    const lhs=assignment.left;
    const key=lhs.computed?
      (lhs.property.type==='Literal'?propertyName(lhs.property):null):
      propertyName(lhs.property);
    const receiver=evaluate(lhs.object,env,shadowed,file,new Set());
    const value=evaluate(assignment.right,env,shadowed,file,new Set());
    // Unknown receiver effects remain visible even for primitive inputs:
    // missing source text is not proof that an opaque host method/accessor
    // cannot inspect caller frames or mutate the ambient program. Primitive
    // controls on *proved* native Storage retain a separate diagnostic class.
    if(receiver.kind==='storage'||receiver.kind==='unknown'||
       value.kind==='callable'){
      /** @type {SourceSink['classification']} */
      let classification='unknown-host';
      if(receiver.kind==='storage'&&value.kind==='callable')classification='source-sensitive';
      else if(receiver.kind==='storage'&&value.kind==='primitive')classification='primitive-control';
      else if(receiver.kind==='storage')classification='unknown-value';
      else if(receiver.kind==='record')classification='local-record';
      findings.push({file,start:assignment.start,end:assignment.end,
        key,receiver:receiver.kind,value:value.kind,classification,
        receiverTrace:receiver.trace,valueTrace:value.trace});
    }
    if(receiver.kind==='record'){
      // A property write kills a previous literal-field proof. Do not replace
      // it with a new "definitely Storage" claim, since aliases, accessors and
      // other control paths remain outside this prototype's admitted grammar.
      if(key&&receiver.fields)receiver.fields.set(key,
        unknown(file+':mutable property '+key));
      else invalidateRecord(receiver,file+':computed/unknown property write');
    }
  }

  /**
   * @param {string} name
   * @returns {Value}
   */
  function readModule(name){
    if(exportsCache.has(name))return /** @type {Value} */ (exportsCache.get(name));
    if(inProgress.has(name))return unknown(name+':cyclic require');
    const file=byName.get(name);
    if(!file)return unknown(name+':missing module');
    inProgress.add(name);
    /** @type {Map<string,Value>} */
    const env=new Map();
    /** @type {Map<string,Value>} */
    const exposed=new Map();
    const root=parse(file.code,'commonjs');
    const statements=root.body;
    const shadowed=declarations(statements);
    for(const statement of statements){
      if(statement.type==='FunctionDeclaration'&&statement.id?.type==='Identifier')
        env.set(statement.id.name,callable(statement,env,name));
    }
    for(const statement of statements){
      if(statement.type==='VariableDeclaration'){
        for(const declaration of statement.declarations){
          // Mutable binding writes are not tracked by this prototype.
          const value=statement.kind==='const'&&declaration.init?
            evaluate(declaration.init,env,shadowed,name,new Set()):
            unknown(name+':mutable/uninitialized binding');
          bindPattern(declaration.id,value,env);
        }
        continue;
      }
      if(statement.type==='FunctionDeclaration'||statement.type==='EmptyStatement')continue;
      if(statement.type==='ExpressionStatement'&&
         statement.expression.type==='Literal'&&
         typeof statement.expression.value==='string')continue;
      if(statement.type==='ExpressionStatement'&&statement.expression.type==='CallExpression'){
        // Execute only literal, bounded local calls for their observed effects.
        // Always kill record proofs afterwards: an unknown callee could mutate
        // any alias of an object passed into it.
        evaluate(statement.expression,env,shadowed,name,new Set());
        for(const value of env.values())invalidateRecord(value,
          name+':potentially effectful top-level call');
        continue;
      }
      if(statement.type!=='ExpressionStatement'||statement.expression.type!=='AssignmentExpression'){
        // An opaque call can mutate a record/its nested fields via an alias.
        for(const value of env.values())invalidateRecord(value,
          name+':opaque top-level statement '+statement.type);
        continue;
      }
      const assignment=statement.expression;
      if(assignment.operator!=='=')continue;
      const lhs=assignment.left;
      if(lhs.type==='MemberExpression'&&!lhs.computed){
        const prop=propertyName(lhs.property);
        if(lhs.object.type==='Identifier'&&lhs.object.name==='exports'&&
           !shadowed.has('exports')&&prop){
          exposed.set(prop,evaluate(assignment.right,env,shadowed,name,new Set()));
          continue;
        }
      }
      observe(assignment,env,shadowed,name);
    }
    const result=record(exposed,name+':CommonJS exports');
    exportsCache.set(name,result);
    inProgress.delete(name);
    return result;
  }

  // Parse all requested modules, including ones not transitively imported.
  // This ensures that unrelated included entry files are not silently skipped.
  for(const name of byName.keys())readModule(name);
  return findings;
}

module.exports={traceCjsStorageSourceSinks};
