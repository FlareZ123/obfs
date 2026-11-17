'use strict';

const path = require('node:path');
const {createHash} = require('node:crypto');
const {walk,applyEdits,parse,observesFunctionSource,observesDistributedSource,staticString} = require('./ast');
const {collectBindings,proveLocalObject,staticName,patternPropertyEdits,isLiteralValue,ownPropertyName,singleUseFactoryObject} = require('./properties');

/** @typedef {import('./core').SourceFile & {sourceType:import('./core').SourceType}} SourceFile */
/** @typedef {import('./ast').AstNode} AstNode */

/**
 * Resolve a local ESM specifier only when it names an input file exactly.
 * @param {string} from
 * @param {string} specifier
 * @returns {string|null}
 */
function resolveImport(from,specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const normalized=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
  return normalized.startsWith('../') || normalized==='..' ? null : normalized;
}

/**
 * Resolve direct, unique named ESM imports whose source module exports a
 * statically known, immutable const string. The value is sufficient to
 * distinguish a computed key from Function#toString observation; ownership
 * and initialization order are separately proved before renaming any key.
 * @param {SourceFile[]} files
 * @returns {Map<string,Map<string,string>>}
 */
function collectVerifiedImportedStrings(files) {
  /** @type {Map<string,{ast:AstNode,bindings:Map<string,number>}>} */
  const modules=new Map();
  for(const file of files) {
    const type=file.sourceType??(file.path.endsWith('.mjs')?'module':'script');
    if(type==='module'&&typeof file.code==='string') {
      const ast=parse(file.code,'module');
      modules.set(file.path,{ast,bindings:collectBindings(ast)});
    }
  }
  /** @type {Map<string,Map<string,string>>} */
  const exported=new Map();
  for(const [filename,module] of modules) {
    /** @type {Map<string,string>} */
    const localConsts=new Map();
    // Accept only uniquely named top-level primitive consts. Named export
    // specifiers may expose one of these under a different public name.
    for(const statement of module.ast.body) {
      const declaration=statement.type==='VariableDeclaration' ? statement :
        statement.type==='ExportNamedDeclaration' && !statement.source ?
          statement.declaration : null;
      if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const')continue;
      for(const item of declaration.declarations) {
        if(item.id.type!=='Identifier'||!item.init||
           module.bindings.get(item.id.name)!==1)continue;
        const value=staticString(item.init);
        if(value!==null)localConsts.set(item.id.name,value);
      }
    }
    /** @type {Map<string,string>} */
    const names=new Map();
    for(const statement of module.ast.body) {
      if(statement.type==='ExportDefaultDeclaration') {
        const value=statement.declaration;
        if(value.type==='Identifier'&&arrays.has(value.name) ||
           value.type==='ArrayExpression'&&hasFunction(value)) {
          publicNames.add('default');
        }
        continue;
      }
      if(statement.type!=='ExportNamedDeclaration'||statement.source)continue;
      if(statement.declaration?.type==='VariableDeclaration') {
        for(const item of statement.declaration.declarations) {
          if(item.id.type!=='Identifier')continue;
          const value=localConsts.get(item.id.name);
          if(value!==undefined)names.set(item.id.name,value);
        }
      } else if(!statement.declaration) {
        for(const spec of statement.specifiers) {
          if(spec.type!=='ExportSpecifier'||spec.local.type!=='Identifier')continue;
          const value=localConsts.get(spec.local.name);
          const publicName=spec.exported.name??spec.exported.value;
          if(value!==undefined && typeof publicName==='string') {
            names.set(publicName,value);
          }
        }
      }
    }
    exported.set(filename,names);
  }
  /** @type {Map<string,Map<string,string>>} */
  const imported=new Map();
  for(const [filename,module] of modules) {
    /** @type {Map<string,string>} */
    const names=new Map();
    for(const statement of module.ast.body) {
      if(statement.type!=='ImportDeclaration'||statement.source.type!=='Literal'||
         typeof statement.source.value!=='string')continue;
      const source=statement.source.value;
      if(/[?#%\\]/.test(source))continue;
      const origin=resolveImport(filename,source);
      const target=origin?exported.get(origin):null;
      if(!target)continue;
      for(const spec of statement.specifiers) {
        if(spec.type!=='ImportSpecifier'||module.bindings.get(spec.local.name)!==1)continue;
        const exportedName=spec.imported.name??spec.imported.value;
        const value=target.get(exportedName);
        if(value!==undefined)names.set(spec.local.name,value);
      }
    }
    imported.set(filename,names);
  }
  return imported;
}

/**
 * Find named ESM imports that resolve to exported const arrays which
 * syntactically contain a function or nested function-valued array.
 * An imported array is opaque to a consumer's local source-observation
 * analysis; preserving the producer's function source requires this graph
 * provenance before a consumer invokes sorting or stringification.
 *
 * This is a positive, conservative may-contain proof. Unknown factories,
 * mutable imported arrays, and indirect reexports need separate handling.
 *
 * @param {SourceFile[]} files
 * @returns {Map<string,Set<string>>}
 */
function collectImportedFunctionArrays(files) {
  /** @type {Map<string,{ast:AstNode,bindings:Map<string,number>}>} */
  const modules=new Map();
  for(const file of files) {
    if(file.sourceType==='module'&&typeof file.code==='string') {
      const ast=parse(file.code,'module');
      modules.set(file.path,{ast,bindings:collectBindings(ast)});
    }
  }
  /** @type {Map<string,Set<string>>} */
  const exportsByFile=new Map();
  for(const [filename,module] of modules) {
    const functions=new Set();
    /** @type {Map<string,AstNode>} */
    const candidates=new Map();
    for(const statement of module.ast.body) {
      const declaration=statement.type==='ExportNamedDeclaration'&&!statement.source?
        statement.declaration:statement;
      if((declaration?.type==='FunctionDeclaration'||
          declaration?.type==='ClassDeclaration') &&
         declaration.id?.type==='Identifier')functions.add(declaration.id.name);
      if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const')continue;
      for(const item of declaration.declarations) {
        if(item.id.type!=='Identifier'||!item.init||
           module.bindings.get(item.id.name)!==1)continue;
        candidates.set(item.id.name,item.init);
        if(['FunctionExpression','ArrowFunctionExpression','ClassExpression']
          .includes(item.init.type))functions.add(item.id.name);
      }
    }
    const arrays=new Set();
    /**
     * @param {AstNode|null|undefined} node
     * @param {number} [depth]
     * @returns {boolean}
     */
    function hasFunction(node,depth=0) {
      if(!node||depth>32)return false;
      if(node.type==='Identifier')return functions.has(node.name)||arrays.has(node.name);
      if(['FunctionExpression','ArrowFunctionExpression','ClassExpression']
        .includes(node.type))return true;
      if(node.type==='ArrayExpression') {
        return node.elements.some((/** @type {AstNode|null} */ element)=>
          Boolean(element&&hasFunction(element.type==='SpreadElement'?
            element.argument:element,depth+1)));
      }
      return false;
    }
    let changed;
    do {
      changed=false;
      for(const [name,value] of candidates) {
        if(arrays.has(name))continue;
        if(value.type==='ArrayExpression'&&hasFunction(value) ||
           value.type==='Identifier'&&arrays.has(value.name)) {
          arrays.add(name);
          changed=true;
        }
      }
    }while(changed);
    const publicNames=new Set();
    for(const statement of module.ast.body) {
      if(statement.type!=='ExportNamedDeclaration'||statement.source)continue;
      if(statement.declaration?.type==='VariableDeclaration') {
        for(const item of statement.declaration.declarations) {
          if(item.id.type==='Identifier'&&arrays.has(item.id.name))
            publicNames.add(item.id.name);
        }
      } else if(!statement.declaration) {
        for(const spec of statement.specifiers) {
          if(spec.type!=='ExportSpecifier'||spec.local.type!=='Identifier'||
             !arrays.has(spec.local.name))continue;
          const name=spec.exported.name??spec.exported.value;
          if(typeof name==='string')publicNames.add(name);
        }
      }
    }
    exportsByFile.set(filename,publicNames);
  }
  // Resolve named/star reexports to a fixed point. A relay module may be
  // listed before its producer, and chains can pass through several relays.
  // The sets grow monotonically, so even a cyclic graph terminates.
  let forwarded;
  do {
    forwarded=false;
    for(const [filename,module] of modules) {
      const publicNames=exportsByFile.get(filename);
      if(!publicNames)continue;
      for(const statement of module.ast.body) {
        if(!['ExportNamedDeclaration','ExportAllDeclaration'].includes(statement.type) ||
           statement.source?.type!=='Literal'||
           typeof statement.source.value!=='string'||
           /[?#%\\]/u.test(statement.source.value))continue;
        const origin=resolveImport(filename,statement.source.value);
        const target=origin?exportsByFile.get(origin):null;
        if(!target)continue;
        /** @param {string} name */
        function addForwarded(name) {
          if(!publicNames.has(name)) {
            publicNames.add(name);
            forwarded=true;
          }
        }
        if(statement.type==='ExportAllDeclaration') {
          if(statement.exported)continue;
          for(const name of target)if(name!=='default')addForwarded(name);
        } else {
          for(const spec of statement.specifiers) {
            if(spec.type!=='ExportSpecifier')continue;
            const name=spec.local.name??spec.local.value;
            const alias=spec.exported.name??spec.exported.value;
            if(target.has(name)&&typeof alias==='string')addForwarded(alias);
          }
        }
      }
    }
  }while(forwarded);
  /** @type {Map<string,Set<string>>} */
  const imported=new Map();
  for(const [filename,module] of modules) {
    const names=new Set();
    for(const statement of module.ast.body) {
      if(statement.type!=='ImportDeclaration' ||
         statement.source.type!=='Literal'||
         typeof statement.source.value!=='string'||
         /[?#%\\]/u.test(statement.source.value))continue;
      const origin=resolveImport(filename,statement.source.value);
      const exported=origin?exportsByFile.get(origin):null;
      if(!exported)continue;
      for(const spec of statement.specifiers) {
        const name=spec.type==='ImportSpecifier'?
          spec.imported.name??spec.imported.value:
          spec.type==='ImportDefaultSpecifier'?'default':null;
        if(name!==null&&module.bindings.get(spec.local.name)===1&&
           exported.has(name))names.add(spec.local.name);
      }
    }
    imported.set(filename,names);
  }
  return imported;
}

/**
 * Find uniquely imported ESM bindings that resolve to a top-level immutable
 * alias of the native structuredClone source observer. This is a conservative
 * source-preservation proof: a false positive only declines obfuscation.
 * It intentionally excludes wildcard imports, indirect reexports, and
 * arbitrary call returns. The proof does not treat an unknown imported
 * function as the clone intrinsic.
 *
 * @param {SourceFile[]} files
 * @returns {Map<string,Set<string>>}
 */
function collectVerifiedImportedCloneAliases(files) {
  /** @type {Map<string,{ast:AstNode,bindings:Map<string,number>}>} */
  const modules=new Map();
  for(const file of files) {
    if(file.sourceType==='module'&&typeof file.code==='string') {
      const ast=parse(file.code,'module');
      modules.set(file.path,{ast,bindings:collectBindings(ast)});
    }
  }
  /** @type {Map<string,Set<string>>} */
  const exportsByFile=new Map();
  for(const [filename,module] of modules) {
    /** @type {Map<string,AstNode>} */
    const candidates=new Map();
    for(const statement of module.ast.body) {
      const declaration=statement.type==='VariableDeclaration'?statement:
        statement.type==='ExportNamedDeclaration'&&!statement.source?
          statement.declaration:null;
      if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const')continue;
      for(const entry of declaration.declarations) {
        if(entry.id.type==='Identifier'&&entry.init&&
           module.bindings.get(entry.id.name)===1) {
          candidates.set(entry.id.name,entry.init);
        }
      }
    }
    const native=new Set(['structuredClone']);
    /** @param {AstNode} node @returns {boolean} */
    function isCloneRef(node) {
      if(node.type==='Identifier')return native.has(node.name);
      if(node.type!=='MemberExpression'||node.object.type!=='Identifier'||
         !['globalThis','window','self','global'].includes(node.object.name))return false;
      const name=node.computed?staticString(node.property):
        node.property.type==='Identifier'?node.property.name:null;
      return name==='structuredClone';
    }
    let progress;
    do {
      progress=false;
      for(const [name,value] of candidates) {
        if(!native.has(name)&&isCloneRef(value)) {
          native.add(name);
          progress=true;
        }
      }
    }while(progress);
    const publicNames=new Set();
    for(const statement of module.ast.body) {
      if(statement.type==='ExportDefaultDeclaration' &&
         isCloneRef(statement.declaration))publicNames.add('default');
      if(statement.type!=='ExportNamedDeclaration'||statement.source)continue;
      if(statement.declaration?.type==='VariableDeclaration') {
        for(const entry of statement.declaration.declarations) {
          if(entry.id.type==='Identifier'&&native.has(entry.id.name))publicNames.add(entry.id.name);
        }
      } else if(!statement.declaration) {
        for(const spec of statement.specifiers) {
          if(spec.type!=='ExportSpecifier'||spec.local.type!=='Identifier'||
             !native.has(spec.local.name))continue;
          const exported=spec.exported.name??spec.exported.value;
          if(typeof exported==='string')publicNames.add(exported);
        }
      }
    }
    exportsByFile.set(filename,publicNames);
  }
  /** @type {Map<string,Set<string>>} */
  const imported=new Map();
  for(const [filename,module] of modules) {
    const names=new Set();
    for(const statement of module.ast.body) {
      if(statement.type!=='ImportDeclaration' ||
         statement.source.type!=='Literal'||typeof statement.source.value!=='string'||
         /[?#%\\]/u.test(statement.source.value))continue;
      const origin=resolveImport(filename,statement.source.value);
      const exported=origin?exportsByFile.get(origin):null;
      if(!exported)continue;
      for(const spec of statement.specifiers) {
        const importedName=spec.type==='ImportSpecifier'?
          spec.imported.name??spec.imported.value:
          spec.type==='ImportDefaultSpecifier'?'default':null;
        if(importedName!==null && exported.has(importedName) &&
           module.bindings.get(spec.local.name)===1)names.add(spec.local.name);
      }
    }
    imported.set(filename,names);
  }
  return imported;
}

/**
 * Require an acyclic static ESM graph before replacing a read of an imported
 * key from a different module with a literal. In a cycle, a reentrant importer
 * function can run before a sibling key module initializes, and the original
 * binding read would throw a TDZ ReferenceError. Rewriting that read would
 * incorrectly eliminate the exception.
 *
 * @param {ReadonlyMap<string,{ast:AstNode}>} modules
 * @returns {boolean}
 */
function hasAcyclicStaticImports(modules) {
  /** @type {Map<string,Set<string>>} */
  const dependencies=new Map();
  /** @type {Map<string,Set<string>>} */
  const consumers=new Map();
  for(const name of modules.keys()) {
    dependencies.set(name,new Set());
    consumers.set(name,new Set());
  }
  for(const [name,module] of modules) {
    const imports=/** @type {Set<string>} */ (dependencies.get(name));
    for(const statement of module.ast.body) {
      if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(statement.type) ||
          statement.source?.type!=='Literal' || typeof statement.source.value!=='string')continue;
      const dependency=resolveImport(name,statement.source.value);
      if(!dependency || !modules.has(dependency) || imports.has(dependency))continue;
      imports.add(dependency);
      consumers.get(dependency)?.add(name);
    }
  }
  const remaining=new Map([...dependencies].map(([name,imports])=>[name,imports.size]));
  const ready=[...remaining].filter(([,count])=>count===0).map(([name])=>name);
  let evaluated=0;
  for(let cursor=0;cursor<ready.length;cursor++) {
    evaluated++;
    for(const consumer of consumers.get(ready[cursor])??[]) {
      const count=(remaining.get(consumer)??0)-1;
      remaining.set(consumer,count);
      if(count===0)ready.push(consumer);
    }
  }
  return evaluated===modules.size;
}

/**
 * Prove that an unrelated computed read belongs to a private literal record
 * and receives only strings from direct, statically known ESM call sites.
 * This narrowly restores a useful closed-world property transformation without
 * ignoring computed reads that may retrieve a Function constructor.
 *
 * @param {ReadonlyMap<string,{file:SourceFile,ast:AstNode,bindings:Map<string,number>}>} modules
 * @param {{file:SourceFile,ast:AstNode,bindings:Map<string,number>}} module
 * @param {AstNode} member
 * @param {AstNode[]} ancestors
 * @returns {boolean}
 */
function safeClosedCallerRecordRead(modules,module,member,ancestors) {
  if(member.type!=='MemberExpression' || member.object.type!=='Identifier' ||
      member.property.type!=='Identifier')return false;
  // The own-record proof trusts these direct native reflection reads. An
  // explicitly declared reassignment/delete/update of either intrinsic in
  // any supplied module invalidates that premise, even when all callsite
  // keys are known own fields. The hostile callback can dynamically import
  // and observe a separately renamed exported ESM object.
  for(const source of modules.values()) {
    let changedIntrinsic=false;
    // Top-level immutable primitive string selectors may be recognized even
    // when passed by identifier. Refuse unproved/shadowed/returned keys.
    /** @type {Map<string,string>} */
    const literalSelectors=new Map();
    for(const statement of source.ast.body) {
      const declaration=statement.type==='VariableDeclaration'?statement:
        statement.type==='ExportNamedDeclaration' && !statement.source?
          statement.declaration:null;
      if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const')continue;
      for(const item of declaration.declarations) {
        if(item.id.type!=='Identifier'||!item.init||
           source.bindings.get(item.id.name)!==1)continue;
        const value=staticString(item.init);
        if(value!==null)literalSelectors.set(item.id.name,value);
      }
    }
    const hostRoots=new Set(['globalThis','window','self','global']);
    /** @type {Set<string>} */
    const hostCallAliases=new Set();
    /** @type {Set<string>} */
    const nativeMutatorAliases=new Set();
    // The Proxy constructor is itself a first-class binding. Handler traps
    // can execute host effects even for a statically unrelated descriptor key.
    const proxyConstructors=new Set(['Proxy']);
    /** @type {Map<string,string>} */
    const nativeDescriptorAliases=new Map();
    /** @type {Set<string>} */
    const hostContainers=new Set();
    /** @type {[string,string][]} */
    const aliasEdges=[];
    // A host-controlled callable can perform runtime imports that are
    // invisible to the statically closed ESM graph. Resolve direct aliases
    // of the global root before recognizing extracted host functions.
    walk(source.ast,node=>{
      if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
         node.init?.type==='Identifier')aliasEdges.push([node.id.name,node.init.name]);
      if(node.type==='AssignmentExpression' && node.operator==='=' &&
         node.left.type==='Identifier' && node.right.type==='Identifier') {
        aliasEdges.push([node.left.name,node.right.name]);
      }
      const binding=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      const value=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      if(binding?.type==='Identifier' && value?.type==='MemberExpression' &&
         value.object.type==='Identifier') {
        const owner=value.object.name;
        const method=value.computed?staticString(value.property):staticName(value.property);
        if(owner==='Object' && ['defineProperty','defineProperties','assign'].includes(method??'') ||
           owner==='Reflect' && ['defineProperty','set','deleteProperty'].includes(method??'')) {
          nativeMutatorAliases.add(binding.name);
        }
        // A captured native descriptor/accessor method can retrieve an
        // ambient reflection object without any later mention of Reflect.
        if(owner==='Object' &&
             ['getOwnPropertyDescriptor','getOwnPropertyDescriptors'].includes(method??'') ||
           owner==='Reflect' &&
             ['get','getOwnPropertyDescriptor'].includes(method??'')) {
          nativeDescriptorAliases.set(binding.name,method??'');
        }
      }
    });
    // Direct local function calls transfer provenance to formals. A global
    // root passed as an argument may be destructured into mutable Reflect,
    // even when the body never spells globalThis. Ambiguous same-name local
    // declarations are joined conservatively. Higher-order calls are not
    // considered a complete effect proof.
    /** @type {Map<string,AstNode[][]>} */
    const localCallFormals=new Map();
    /** @param {string} name @param {AstNode[]} params */
    function recordFormals(name,params) {
      const definitions=localCallFormals.get(name)??[];
      definitions.push(params);
      localCallFormals.set(name,definitions);
    }
    walk(source.ast,node=>{
      if(node.type==='FunctionDeclaration' && node.id?.type==='Identifier')
        recordFormals(node.id.name,node.params);
      if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
         (node.init?.type==='FunctionExpression' ||
          node.init?.type==='ArrowFunctionExpression'))
        recordFormals(node.id.name,node.init.params);
    });
    // A bound function retains the remaining formal positions after any
    // captured prefix arguments. Treat syntactically assigned local .bind()
    // values as first-class callables; later alias and call edges can then
    // reach those positions. Use canonical root+offset slices so rebinding
    // cycles converge instead of generating new arrays indefinitely.
    /** @type {{name:string,origin:string,captured:number}[]} */
    const boundCallables=[];
    walk(source.ast,node=>{
      const binding=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      const initial=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'&&node.operator==='='?node.right:null;
      if(binding?.type!=='Identifier'||initial?.type!=='CallExpression' ||
         initial.callee.type!=='MemberExpression' ||
         initial.callee.object.type!=='Identifier')return;
      const method=initial.callee.computed?staticString(initial.callee.property):
        staticName(initial.callee.property);
      if(method!=='bind')return;
      boundCallables.push({name:binding.name,origin:initial.callee.object.name,
        captured:Math.max(0,initial.arguments.length-1)});
    });
    /** @type {WeakMap<AstNode[],{root:AstNode[],offset:number}>} */
    const partialOrigins=new WeakMap();
    /** @type {Map<AstNode[],Map<number,AstNode[]>>} */
    const partialCache=new Map();
    /**
     * @param {AstNode[]} formals
     * @param {number} captured
     * @returns {AstNode[]}
     */
    function remainingFormals(formals,captured) {
      const origin=partialOrigins.get(formals);
      const root=origin?.root??formals;
      const offset=Math.min(root.length,(origin?.offset??0)+captured);
      if(offset===0)return root;
      let slices=partialCache.get(root);
      if(!slices){
        slices=new Map();
        partialCache.set(root,slices);
      }
      let derived=slices.get(offset);
      if(!derived) {
        derived=root.slice(offset);
        slices.set(offset,derived);
        partialOrigins.set(derived,{root,offset});
      }
      return derived;
    }
    // Uniquely named local function references can be assigned and called
    // through another identifier. Reuse the ordinary assignment edges to
    // propagate every possible formal list before resolving any callsite.
    // Multiple callable origins join conservatively instead of choosing one.
    let callableChanged;
    do {
      callableChanged=false;
      for(const [alias,origin] of aliasEdges) {
        const originFormals=localCallFormals.get(origin);
        if(!originFormals)continue;
        const aliasFormals=localCallFormals.get(alias)??[];
        let extended=false;
        for(const formals of originFormals) {
          if(!aliasFormals.includes(formals)) {
            aliasFormals.push(formals);
            extended=true;
          }
        }
        if(extended) {
          localCallFormals.set(alias,aliasFormals);
          callableChanged=true;
        }
      }
      for(const site of boundCallables) {
        const original=localCallFormals.get(site.origin);
        if(!original)continue;
        const target=localCallFormals.get(site.name)??[];
        let extended=false;
        for(const formals of original) {
          const remaining=remainingFormals(formals,site.captured);
          if(!target.includes(remaining)) {
            target.push(remaining);
            extended=true;
          }
        }
        if(extended) {
          localCallFormals.set(site.name,target);
          callableChanged=true;
        }
      }
    }while(callableChanged);
    /** @type {{origin:string,binding:AstNode}[]} */
    const formalObjectPatterns=[];
    /**
     * Native invocation adapters can call a locally known function without
     * spelling that function as the direct CallExpression callee. Join their
     * argument-to-formal transfers before resolving ambient host roots.
     * A bind operation is conservatively treated as a possible invocation:
     * its captured arguments may be used by a later call or escape.
     *
     * @param {AstNode} node
     * @returns {{name:string,args:(AstNode|null)[]}|null}
     */
    function localInvocation(node) {
      if(node.type!=='CallExpression'&&node.type!=='NewExpression')return null;
      if(node.callee.type==='Identifier'){
        return {name:node.callee.name,args:node.arguments};
      }
      if(node.type!=='CallExpression' ||
         node.callee.type!=='MemberExpression')return null;
      const callee=node.callee;
      const method=callee.computed?staticString(callee.property):
        staticName(callee.property);
      if(callee.object.type==='Identifier' &&
         (method==='call'||method==='bind')) {
        return {name:callee.object.name,args:node.arguments.slice(1)};
      }
      /** @type {string|null} */
      let name=null;
      /** @type {AstNode|undefined} */
      let supplied;
      if(callee.object.type==='Identifier'&&method==='apply'){
        name=callee.object.name;
        supplied=node.arguments[1];
      }
      if(callee.object.type==='Identifier'&&callee.object.name==='Reflect' &&
         method==='apply'&&node.arguments[0]?.type==='Identifier'){
        name=node.arguments[0].name;
        supplied=node.arguments[2];
      }
      if(name===null)return null;
      if(supplied?.type==='ArrayExpression'){
        return {name,args:supplied.elements};
      }
      // An unproved argument-array expression can carry globalThis into a
      // local function and is outside the direct array-element analysis.
      if(localCallFormals.has(name))changedIntrinsic=true;
      return null;
    }
    walk(source.ast,node=>{
      const invocation=localInvocation(node);
      if(!invocation)return;
      const definitions=localCallFormals.get(invocation.name)??[];
      if(definitions.length && invocation.args.some(
        argument=>argument?.type==='SpreadElement'))changedIntrinsic=true;
      for(const params of definitions) {
        for(let i=0;i<params.length;i++) {
          let formal=params[i];
          let actual=invocation.args[i];
          if(formal.type==='AssignmentPattern') {
            actual??=formal.right;
            formal=formal.left;
          }
          if(actual?.type!=='Identifier')continue;
          if(formal.type==='Identifier')aliasEdges.push([formal.name,actual.name]);
          if(formal.type==='ObjectPattern')
            formalObjectPatterns.push({origin:actual.name,binding:formal});
        }
      }
    });
    let aliasChanged;
    do {
      aliasChanged=false;
      for(const [target,origin] of aliasEdges) {
        if(hostRoots.has(origin) && !hostRoots.has(target)) {
          hostRoots.add(target);
          aliasChanged=true;
        }
        if(nativeMutatorAliases.has(origin) && !nativeMutatorAliases.has(target)) {
          nativeMutatorAliases.add(target);
          aliasChanged=true;
        }
        if(proxyConstructors.has(origin) && !proxyConstructors.has(target)) {
          proxyConstructors.add(target);
          aliasChanged=true;
        }
        if(nativeDescriptorAliases.has(origin) && !nativeDescriptorAliases.has(target)) {
          nativeDescriptorAliases.set(target,/** @type {string} */ (nativeDescriptorAliases.get(origin)));
          aliasChanged=true;
        }
      }
    } while(aliasChanged);
    // A callsite-rooted destructured formal acquires the same ambient
    // capabilities as a declaration or assignment ObjectPattern.
    for(const {origin,binding} of formalObjectPatterns) {
      if(!hostRoots.has(origin))continue;
      for(const property of binding.properties) {
        if(property.type==='Property' && property.value.type==='Identifier')
          hostCallAliases.add(property.value.name);
      }
    }
    // An ordinary object/array literal can hold a host capability. A
    // subsequent read of any field on that local container may retrieve it.
    walk(source.ast,node=>{
      if(node.type!=='VariableDeclarator'||node.id.type!=='Identifier' ||
         !node.init || !['ObjectExpression','ArrayExpression'].includes(node.init.type))return;
      let includesHost=false;
      walk(node.init,child=>{
        if(child.type==='Identifier' && hostRoots.has(child.name) ||
           child.type==='MemberExpression' &&
           child.object.type==='Identifier' &&
           hostRoots.has(child.object.name))includesHost=true;
      });
      if(includesHost)hostContainers.add(node.id.name);
    });
    do {
      aliasChanged=false;
      for(const [target,origin] of aliasEdges) {
        if(hostContainers.has(origin)&&!hostContainers.has(target)) {
          hostContainers.add(target);
          aliasChanged=true;
        }
      }
    } while(aliasChanged);
    /**
     * Recognize a source of an opaque host callable, including a descriptor
     * value and a Reflect.get result. Decline only if it is later called.
     * @param {AstNode} initial
     * @returns {boolean}
     */
    function readsHostCallable(initial) {
      if(initial.type==='MemberExpression') {
        if(initial.object.type==='Identifier' &&
           (hostRoots.has(initial.object.name) ||
            hostContainers.has(initial.object.name)))return true;
        return initial.object.type==='CallExpression' &&
          readsHostCallable(initial.object);
      }
      if(initial.type==='CallExpression' &&
         initial.callee.type==='MemberExpression' &&
         initial.callee.object.type==='Identifier') {
        const method=initial.callee.computed?
          staticString(initial.callee.property):staticName(initial.callee.property);
        const host=initial.callee.object.name;
        if((host==='Object' && method==='getOwnPropertyDescriptor' ||
            host==='Reflect' && method==='get') &&
           initial.arguments[0]?.type==='Identifier' &&
           hostRoots.has(initial.arguments[0].name))return true;
      }
      return false;
    }
    walk(source.ast,node=>{
      const binding=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression' && node.operator==='='?node.left:null;
      const value=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      if(!binding||!value)return;
      if(binding.type==='Identifier' && readsHostCallable(value)) {
        hostCallAliases.add(binding.name);
      }
      // Object-pattern assignment into an already declared local variable
      // can extract the same mutable global capability as a declaration.
      if(binding.type==='ObjectPattern' && value.type==='Identifier' &&
         hostRoots.has(value.name)) {
        for(const property of binding.properties) {
          if(property.type==='Property' && property.value.type==='Identifier')
            hostCallAliases.add(property.value.name);
        }
      }
    });
    do {
      aliasChanged=false;
      for(const [target,origin] of aliasEdges) {
        if(hostCallAliases.has(origin) && !hostCallAliases.has(target)) {
          hostCallAliases.add(target);
          aliasChanged=true;
        }
      }
    } while(aliasChanged);
    /**
     * A local holder of a global root may carry the same mutable intrinsic.
     * Only known unrelated literal keys are excluded from this capability
     * acquisition guard.
     * @param {AstNode|undefined} receiver
     * @returns {boolean}
     */
    function mayBeGlobalReceiver(receiver) {
      if(!receiver)return false;
      let root=receiver;
      while(root.type==='MemberExpression')root=root.object;
      if(root.type==='Identifier')return hostRoots.has(root.name) ||
        hostContainers.has(root.name);
      if(root.type==='ObjectExpression'||root.type==='ArrayExpression') {
        let captured=false;
        walk(root,node=>{
          if(node.type==='Identifier' && hostRoots.has(node.name))captured=true;
        });
        return captured;
      }
      return false;
    }
    walk(source.ast,(node,parent)=>{
      // Proxy descriptor traps may call opaque host accessors without spelling
      // a Reflect mutation or distributed module import in the declared ESM.
      // A literal empty handler has no own traps under the assumed ordinary
      // realm; any populated or unproved handler declines the exceptional
      // cross-file record proof. This is an intentional finite guard rather
      // than a complete Proxy/host effect proof.
      let proxyHandler=null;
      if(node.type==='NewExpression' &&
         (node.callee.type==='Identifier' && proxyConstructors.has(node.callee.name) ||
          node.callee.type==='MemberExpression' &&
          node.callee.object.type==='Identifier' &&
          hostRoots.has(node.callee.object.name) &&
          (node.callee.computed?staticString(node.callee.property):
            staticName(node.callee.property))==='Proxy')) {
        proxyHandler=node.arguments[1]??null;
      }
      if(node.type==='CallExpression' &&
         node.callee.type==='MemberExpression' &&
         node.callee.object.type==='Identifier' &&
         proxyConstructors.has(node.callee.object.name) &&
         (node.callee.computed?staticString(node.callee.property):
           staticName(node.callee.property))==='revocable') {
        proxyHandler=node.arguments[1]??null;
      }
      if(proxyHandler===null && node.type==='NewExpression' &&
         node.callee.type==='Identifier' &&
         proxyConstructors.has(node.callee.name) &&
         node.arguments.length<2)changedIntrinsic=true;
      if(proxyHandler && (proxyHandler.type!=='ObjectExpression' ||
         proxyHandler.properties.length>0))changedIntrinsic=true;
      // Extracted descriptor methods are first-class function values.
      // A direct call is already examined below. Opaque higher-order use,
      // .call/.apply/.bind, or nontrivial escape can recover a mutable
      // ambient object with arguments unavailable to this local proof.
      if(node.type==='Identifier' && nativeDescriptorAliases.has(node.name) &&
         !(parent?.type==='VariableDeclarator' &&
           (parent.id===node || parent.init===node &&
            parent.id.type==='Identifier')) &&
         !(parent?.type==='AssignmentExpression' && parent.right===node &&
           parent.operator==='=' && parent.left.type==='Identifier') &&
         !(parent?.type==='CallExpression' && parent.callee===node)) {
        changedIntrinsic=true;
      }
      if(node.type==='MemberExpression' &&
         node.object.type==='MemberExpression' &&
         node.object.object.type==='Identifier') {
        const owner=node.object.object.name;
        const nested=node.object.computed?
          staticString(node.object.property):staticName(node.object.property);
        if(owner==='Object' &&
             ['getOwnPropertyDescriptor','getOwnPropertyDescriptors'].includes(nested??'') ||
           owner==='Reflect' &&
             ['get','getOwnPropertyDescriptor'].includes(nested??''))changedIntrinsic=true;
      }
      // A descriptor is an aliasing path to its value. Acquiring the global
      // Reflect/Object object permits mutation of its native inspection
      // methods through descriptor.value, a collection, or Reflect.get.
      // Decline the proof at acquisition rather than trying to enumerate
      // later aliases, container writes, callbacks, and returns.
      if(node.type==='CallExpression') {
        let method=null;
        if(node.callee.type==='Identifier') {
          method=nativeDescriptorAliases.get(node.callee.name)??null;
        }else if(node.callee.type==='MemberExpression' &&
                 node.callee.object.type==='Identifier') {
          const owner=node.callee.object.name;
          const selected=node.callee.computed?
            staticString(node.callee.property):staticName(node.callee.property);
          if(owner==='Object' &&
               ['getOwnPropertyDescriptor','getOwnPropertyDescriptors'].includes(selected??'') ||
             owner==='Reflect' &&
               ['get','getOwnPropertyDescriptor'].includes(selected??''))method=selected;
        }
        if(method) {
          const selector=node.arguments[1];
          const field=selector?.type==='Identifier'?
            literalSelectors.get(selector.name)??null:
            selector?staticString(selector):null;
          // An unknown selector may evaluate to Reflect or Object through
          // a Proxy, local closure, cross-module factory or dynamic string.
          // Decline rather than asserting that an opaque receiver is inert.
          // An unrelated unique top-level immutable literal remains proven.
          if(method==='getOwnPropertyDescriptors') {
            if(mayBeGlobalReceiver(node.arguments[0]))changedIntrinsic=true;
          }else if(field===null || field==='Reflect' || field==='Object') {
            changedIntrinsic=true;
          }
        }
      }
      // A captured native global mutator remains capable of replacing an
      // ambient binding even when the callee is only an alias identifier.
      // Its parameter/side-effect proof is intentionally conservative.
      if(node.type==='CallExpression' && node.callee.type==='Identifier' &&
         nativeMutatorAliases.has(node.callee.name))changedIntrinsic=true;
      // The global Reflect/Object binding may be replaced through a native
      // descriptor/set/assignment call without spelling a direct member write.
      // Mutator receivers may be opaque aliases or stored global roots.
      // A known unrelated field remains safe; unknown/global fields decline.
      if(node.type==='CallExpression' &&
         node.callee.type==='MemberExpression' &&
         node.callee.object.type==='Identifier') {
        const owner=node.callee.object.name;
        const method=node.callee.computed?
          staticString(node.callee.property):staticName(node.callee.property);
        if(owner==='Object' && method==='defineProperty' ||
           owner==='Reflect' &&
           (method==='defineProperty'||method==='set'||method==='deleteProperty')) {
          const name=node.arguments[1]?staticString(node.arguments[1]):null;
          if(name===null||name==='Reflect'||name==='Object')changedIntrinsic=true;
        }
        if(owner==='Object' && (method==='defineProperties'||method==='assign')) {
          const sources=method==='assign'?node.arguments.slice(1):[node.arguments[1]];
          if(sources.some((/** @type {AstNode|undefined} */ sourceObject)=>
              sourceObject?.type!=='ObjectExpression' ||
              sourceObject.properties.some((/** @type {AstNode} */ property)=>{
                if(property.type!=='Property')return true;
                const key=property.computed?
                  staticString(property.key):ownPropertyName(property);
                return key===null||key==='Reflect'||key==='Object';
              })))changedIntrinsic=true;
        }
      }
      /**
       * @param {AstNode} argument
       * @returns {boolean}
       */
      function passesHostCallable(argument) {
        return readsHostCallable(argument) ||
          argument.type==='Identifier' && hostCallAliases.has(argument.name);
      }
      // A host callable used as an argument may be invoked or retained by
      // any otherwise unproved call/constructor. This includes Reflect.apply,
      // microtask and Promise callbacks, not only direct host callees.
      if((node.type==='CallExpression'||node.type==='NewExpression') &&
         node.arguments.some(passesHostCallable)) {
        changedIntrinsic=true;
      }
      if(node.type==='CallExpression' &&
         (node.callee.type==='Identifier' && hostCallAliases.has(node.callee.name) ||
          node.callee.type==='MemberExpression' &&
          node.callee.object.type==='Identifier' &&
          (hostRoots.has(node.callee.object.name) ||
           hostContainers.has(node.callee.object.name) ||
           hostCallAliases.has(node.callee.object.name))))changedIntrinsic=true;
      // A direct-member write guard is insufficient when the global
      // reflection object can escape through an alias or argument. Such a
      // reference can replace ownKeys/getOwnPropertyDescriptor and return a
      // host-provided Function, enabling an untracked runtime module import.
      if(node.type==='Identifier' &&
         (node.name==='Reflect'||node.name==='Object') &&
         !(parent?.type==='MemberExpression'&&parent.object===node)) {
        changedIntrinsic=true;
      }
      if(node.type==='MemberExpression') {
        const field=node.computed?staticString(node.property):staticName(node.property);
        if(field==='Reflect'||field==='Object')changedIntrinsic=true;
        // A constant string stored in a binding can resolve a mutable
        // intrinsic through globalThis[key] without spelling Reflect as an
        // AST Identifier. The broader graph may prove the key's spelling
        // but cannot prove the returned global intrinsic remains native.
        if(node.computed && node.property.type!=='Literal' &&
           node.object.type==='Identifier' &&
           ['globalThis','window','self','global'].includes(node.object.name)) {
          changedIntrinsic=true;
        }
      }
      const target=node.type==='AssignmentExpression'?node.left:
        node.type==='UpdateExpression'?node.argument:
        node.type==='UnaryExpression'&&node.operator==='delete'?node.argument:null;
      if(target?.type!=='MemberExpression')return;
      // A destructured field of a host root is a mutable ambient capability.
      // Even with a computed name that does not spell Reflect in the AST,
      // assigning through that field may replace the native ownKeys method.
      // Direct and transitive host aliases were collected above.
      if(target.object.type==='Identifier' &&
         hostCallAliases.has(target.object.name))changedIntrinsic=true;
      const method=target.computed?staticString(target.property):staticName(target.property);
      if(target.object.type==='Identifier' &&
          (target.object.name==='Reflect'&&method==='ownKeys' ||
           target.object.name==='Object'&&method==='getOwnPropertyDescriptor')) {
        changedIntrinsic=true;
      }
    });
    if(changedIntrinsic)return false;
  }
  const field=ancestors.at(-1);
  const record=ancestors.at(-2);
  const result=ancestors.at(-3);
  const block=ancestors.at(-4);
  const fn=ancestors.at(-5);
  const exported=ancestors.at(-6);
  if(field?.type!=='Property' || field.kind!=='init' ||
      field.value!==member || record?.type!=='ObjectExpression' ||
      result?.type!=='ReturnStatement' || result.argument!==record ||
      block?.type!=='BlockStatement' || block.body.length!==1 ||
      block.body[0]!==result || fn?.type!=='FunctionDeclaration' ||
      fn.body!==block || fn.params.length!==1 ||
      fn.params[0].type!=='Identifier' ||
      fn.params[0].name!==member.property.name ||
      fn.id?.type!=='Identifier' ||
      exported?.type!=='ExportNamedDeclaration' || exported.declaration!==fn ||
      module.bindings.get(fn.id.name)!==1 ||
      module.bindings.get(member.property.name)!==1)return false;
  // Any other parameter reference could reassign or forward it.
  let references=0;
  let parameterStable=true;
  walk(fn,node=>{
    if(node.type!=='Identifier'||node.name!==member.property.name)return;
    references++;
    if(node!==fn.params[0] && node!==member.property)parameterStable=false;
  });
  if(!parameterStable || references!==2)return false;
  let functionEscapes=false;
  walk(module.ast,(node,parent,key)=>{
    if(node.type==='Identifier' && node.name===fn.id.name &&
        !(node===fn.id && parent===fn && key==='id'))functionEscapes=true;
  });
  if(functionEscapes)return false;
  const receiverName=member.object.name;
  if(module.bindings.get(receiverName)!==1 ||
      module.bindings.has('Object') || module.bindings.has('Reflect'))return false;
  /** @type {AstNode|null} */
  let declaration=null;
  for(const statement of module.ast.body) {
    if(statement.type!=='VariableDeclaration'||statement.kind!=='const')continue;
    for(const dec of statement.declarations) {
      if(dec.id.type==='Identifier' && dec.id.name===receiverName &&
          dec.init?.type==='ObjectExpression')declaration=dec;
    }
  }
  if(!declaration || !declaration.init ||
      declaration.init.type!=='ObjectExpression')return false;
  const recordEntries=declaration.init.properties;
  // An ordinary literal has an inherited Object.prototype: unknown or
  // missing keys can resolve to a host-installed Function. The special,
  // noncomputed __proto__:null initializer has no inherited properties and
  // creates no own __proto__ field. Do not confuse this syntax with
  // ['__proto__']:null, a normal computed own property.
  const nullPrototype=recordEntries.some((/** @type {AstNode} */ property)=>
    property.type==='Property' && property.kind==='init' &&
    !property.method && !property.shorthand && !property.computed &&
    ownPropertyName(property)==='__proto__' &&
    property.value.type==='Literal' && property.value.value===null);
  if(!recordEntries.every((/** @type {AstNode} */ property)=>{
    if(property.type!=='Property' || property.kind!=='init' ||
        property.method || property.shorthand || property.computed ||
        property.value.type!=='Literal' ||
        !(property.value.value===null ||
          ['string','number','boolean','bigint'].includes(typeof property.value.value)))return false;
    const name=ownPropertyName(property);
    if(name===null)return false;
    if(name==='__proto__')return nullPrototype && property.value.value===null;
    return nullPrototype || !['constructor','prototype'].includes(String(name));
  }))return false;
  // Only these unescaped read-only uses of the private record are admissible.
  let receiverStable=true;
  walk(module.ast,(node,parent,key)=>{
    if(node.type!=='Identifier'||node.name!==receiverName)return;
    if(node===declaration.id || parent===member && key==='object')return;
    if(parent?.type==='CallExpression' && key==='arguments' &&
        parent.arguments[0]===node && parent.callee.type==='MemberExpression' &&
        !parent.callee.computed && parent.callee.object.type==='Identifier') {
      const method=parent.callee.property.name;
      const host=parent.callee.object.name;
      if(host==='Reflect' && method==='ownKeys' && parent.arguments.length===1 ||
          host==='Object' && method==='getOwnPropertyDescriptor' &&
          parent.arguments.length===2)return;
    }
    receiverStable=false;
  });
  if(!receiverStable)return false;
  // Direct named ESM calls must enumerate every access to the exported
  // function. Namespace calls, aliases, callbacks and reexports decline.
  const keys=new Set();
  let calls=0;
  for(const [filename,consumer] of modules) {
    if(filename===module.file.path)continue;
    const aliases=new Set();
    for(const statement of consumer.ast.body) {
      if(!statement.source?.value ||
          resolveImport(filename,statement.source.value)!==module.file.path)continue;
      if(statement.type==='ExportAllDeclaration' ||
          statement.type==='ExportNamedDeclaration')return false;
      if(statement.type!=='ImportDeclaration')continue;
      for(const spec of statement.specifiers) {
        if(spec.type==='ImportNamespaceSpecifier')return false;
        if(spec.type==='ImportSpecifier' &&
            (spec.imported.name??spec.imported.value)===fn.id.name) {
          if(consumer.bindings.get(spec.local.name)!==1)return false;
          aliases.add(spec.local.name);
        }
      }
    }
    if(!aliases.size)continue;
    let usesValid=true;
    walk(consumer.ast,(node,parent,key)=>{
      if(node.type!=='Identifier'||!aliases.has(node.name))return;
      if(parent?.type==='ImportSpecifier' &&
          (parent.local===node || parent.imported===node))return;
      if(parent?.type==='CallExpression' && key==='callee' &&
          parent.callee===node && !parent.optional &&
          parent.arguments.length===1) {
        const literal=staticString(parent.arguments[0]);
        if(literal!==null){keys.add(literal);calls++;return;}
      }
      usesValid=false;
    });
    if(!usesValid)return false;
  }
  if(!calls)return false;
  const inherited=new Set(['__proto__','constructor','prototype',
    '__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__',
    'hasOwnProperty','isPrototypeOf','propertyIsEnumerable',
    'toLocaleString','toString','valueOf']);
  const ownNames=new Set(recordEntries.filter((/** @type {AstNode} */ property)=>
    ownPropertyName(property)!=='__proto__').map(ownPropertyName));
  return [...keys].every(key=>nullPrototype ||
    ownNames.has(key) && !inherited.has(key));
}

/**
 * Across an explicit closed-world set of ESM modules, rename properties of
 * direct named exported const-object literals and all proven import aliases.
 * Reject reexports, reflection, dynamic import and unproven uses rather than
 * speculating about the complete JavaScript object graph.
 * @param {SourceFile[]} files
 * @param {string} seed
 * @returns {{files:SourceFile[],objects:number,properties:number}}
 */
function renameCrossFileProperties(files,seed) {
  // Mixed executable formats can hide ESM consumers. The closed-world
  // integrator additionally promises that these explicitly declared inert
  // style/image/font assets are served with non-JavaScript MIME types and
  // never interpreted as source; file extensions alone cannot prove that.
  const inertAssetExtensions=new Set(['.css','.png','.jpg','.jpeg','.gif',
    '.webp','.ico','.woff','.woff2','.ttf','.otf']);
  if (files.some(file => {
    const type=file.sourceType ?? (file.path.endsWith('.mjs') ? 'module' : 'script');
    return type!=='module' && !(type==='asset' &&
      inertAssetExtensions.has(path.posix.extname(file.path).toLowerCase()));
  })) {
    return {files,objects:0,properties:0};
  }
  /** @type {Map<string,{file:SourceFile,ast:AstNode,bindings:Map<string,number>}>} */
  const modules=new Map();
  for(const file of files) {
    if ((file.sourceType ?? (file.path.endsWith('.mjs') ? 'module' : 'script'))==='module' && typeof file.code==='string') {
      const ast=parse(file.code,'module');
      modules.set(file.path,{file,ast,bindings:collectBindings(ast)});
    }
  }
  const knownFiles=new Set(files.map(file=>file.path));
  const verifiedStrings=collectVerifiedImportedStrings(files);
  const verifiedClones=collectVerifiedImportedCloneAliases(files);
  const acyclicImports=hasAcyclicStaticImports(modules);
  // The filename-oriented resolver only proves canonical relative imports.
  // Absolute file URLs, package aliases and encoded/query/fragment paths can
  // reach the same ESM source through another spelling without being tracked.
  // Node builtins cannot resolve to an input module under the default loader.
  // Dynamic source generation can hide additional consumers of an otherwise
  // statically closed ESM module graph. Even a constructor held as an alias
  // must make the property-renaming proof decline the whole graph.
  const dynamicCompilerNames=new Set(['eval','Function','AsyncFunction','GeneratorFunction','AsyncGeneratorFunction']);
  // A separate Worker, child process, VM context or service worker may load a
  // supplied module through a runtime-only string/URL. No static ESM import
  // edge then exists for our property-ownership graph, so decline the graph.
  const secondaryLoaderNames=new Set(['Worker','SharedWorker','importScripts','serviceWorker']);
  const secondaryLoaderModules=new Set(['node:worker_threads','node:child_process','node:vm']);
  for(const module of modules.values()) {
    // Function source can be inspected by a separate ESM consumer that never
    // imports the object whose field is being renamed. Check the whole graph,
    // rather than relying on object-alias consumers alone.
    if(observesFunctionSource(module.ast,verifiedStrings.get(module.file.path),
       verifiedClones.get(module.file.path)) ||
       observesDistributedSource(module.ast,verifiedStrings.get(module.file.path)))return {files,objects:0,properties:0};
    // An unknown key on a global object may resolve to Function, Worker,
    // importScripts or another untracked module loader. Track direct global
    // aliases conservatively, including assignments, before proving that all
    // consumers of an exported owner are present in this source group.
    const globalAliases=new Set(['globalThis','window','self','global']);
    const reflectAliases=new Set(['Reflect']);
    const objectAliases=new Set(['Object']);
    /** @type {[string,string][]} */
    const aliasEdges=[];
    /** @type {Map<string,string>} */
    const localStaticKeys=new Map();
    /** @type {{source:string|null,key:AstNode|null,computed:boolean}[]} */
    const destructuringReads=[];
    walk(module.ast,(node,parent)=>{
      if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
         node.init?.type==='Identifier')aliasEdges.push([node.id.name,node.init.name]);
      if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
         parent?.type==='VariableDeclaration' && parent.kind==='const' &&
         module.bindings.get(node.id.name)===1 && node.init) {
        const value=staticString(node.init);
        if(value!==null)localStaticKeys.set(node.id.name,value);
      }
      if(node.type==='AssignmentExpression' && node.operator==='=' &&
         node.left.type==='Identifier' && node.right.type==='Identifier') {
        aliasEdges.push([node.left.name,node.right.name]);
      }
      // Object destructuring can acquire a loader without any MemberExpression,
      // including a computed key and a value bound under an unrelated name.
      const pattern=node.type==='VariableDeclarator' ? node.id :
        node.type==='AssignmentExpression' && node.operator==='=' ? node.left : null;
      const initial=node.type==='VariableDeclarator' ? node.init :
        node.type==='AssignmentExpression' ? node.right : null;
      if(pattern?.type==='ObjectPattern' && initial) {
        const source=initial.type==='Identifier' ? initial.name : null;
        for(const property of pattern.properties) {
          if(property.type!=='Property') {
            destructuringReads.push({source,key:null,computed:true});
            continue;
          }
          destructuringReads.push({source,key:property.key,
            computed:property.computed});
          const name=property.computed ? staticString(property.key) : staticName(property.key);
          if(source!==null && name!==null && globalAliases.has(name)) {
            if(property.value.type==='Identifier')aliasEdges.push([property.value.name,source]);
            else destructuringReads.push({source,key:null,computed:true});
          }
        }
      }
    });
    let aliasChanged;
    do {
      aliasChanged=false;
      for(const [target,source] of aliasEdges) {
        for(const names of [globalAliases,reflectAliases,objectAliases]) {
          if(names.has(source) && !names.has(target)) {
            names.add(target);
            aliasChanged=true;
          }
        }
      }
    } while(aliasChanged);
    /**
     * Resolve a key only if its expression is a pure static string or the
     * unique local/imported immutable string proven by the ESM graph.
     * @param {AstNode|null|undefined} key
     * @param {boolean} [computed]
     * @returns {string|null}
     */
    function provenKey(key,computed=true) {
      if(!key)return null;
      const direct=computed?staticString(key):staticName(key);
      return direct===null && computed && key.type==='Identifier' ?
        localStaticKeys.get(key.name) ??
          verifiedStrings.get(module.file.path)?.get(key.name) ?? null : direct;
    }
    /** @param {AstNode|null|undefined} key @returns {boolean} */
    function primitiveInertKey(key) {
      return Boolean(key?.type==='Literal' &&
        (key.value===null || ['number','boolean','bigint'].includes(typeof key.value)));
    }
    let ambiguous=false;
    for(const read of destructuringReads) {
      const name=provenKey(read.key,read.computed);
      // Unknown destructuring can extract Function.prototype.constructor
      // from native constructors, ordinary functions or opaque receivers.
      if(read.computed && name===null && !primitiveInertKey(read.key))ambiguous=true;
      if(name==='constructor')ambiguous=true;
      if(read.source!==null && globalAliases.has(read.source) &&
         (name===null || dynamicCompilerNames.has(name) || secondaryLoaderNames.has(name) ||
          ['require','createRequire','getBuiltinModule'].includes(name))) ambiguous=true;
    }
    walk(module.ast,(node,parent,key,ancestors)=>{
      if (node.type==='Identifier' &&
          (dynamicCompilerNames.has(node.name)||secondaryLoaderNames.has(node.name))) ambiguous=true;
      // Every ordinary function's inherited .constructor resolves to the
      // Function constructor. Even a seemingly unrelated constructor read can
      // create a runtime import that escapes the static ownership graph.
      if(node.type==='Property' && parent?.type==='ObjectPattern') {
        // Binding patterns in parameters, catch clauses and for-of loops
        // have no VariableDeclarator initializer. They can still extract
        // a native Function constructor through an unknown computed key.
        const keyName=provenKey(node.key,node.computed);
        if(keyName==='constructor' ||
           keyName!==null && (dynamicCompilerNames.has(keyName) ||
             secondaryLoaderNames.has(keyName)) ||
           node.computed && keyName===null && !primitiveInertKey(node.key)) ambiguous=true;
      }
      if (node.type==='MemberExpression') {
        // A computed constant spelling such as globalThis['Fun'+'ction']
        // is a loader just as globalThis.Function is. A dynamic global key
        // is also unsafe because it can resolve to any untracked loader.
        const name=provenKey(node.property,node.computed);
        if (typeof name==='string' &&
            (dynamicCompilerNames.has(name)||secondaryLoaderNames.has(name) ||
             name==='constructor')) ambiguous=true;
        // Unknown computed keys on *any* object can resolve to an
        // inherited constructor, including Number[key] and [].filter[key].
        // Such a Function constructor can dynamically import an ESM owner,
        // defeating the static-only consumer proof. Primitive literal keys
        // cannot become the string "constructor" via ToPropertyKey.
        if(node.computed && name===null && !primitiveInertKey(node.property) &&
            !safeClosedCallerRecordRead(modules,module,node,ancestors))ambiguous=true;
      }
      // A Node ESM file can acquire a CommonJS require function without using
      // ImportExpression or a static import from the target. This is another
      // way to read an exported object's original keys, so the proof must
      // decline the graph until such consumers are resolved explicitly.
      if (node.type==='CallExpression') {
        const callee=node.callee;
        // Reflect.get and descriptor reads can obtain a runtime Function
        // constructor from the global object without any direct member
        // expression on that object. Follow simple immutable/mutable aliases.
        if(callee.type==='MemberExpression' && callee.object.type==='Identifier') {
          const method=provenKey(callee.property,callee.computed);
          const reflectiveMethod=reflectAliases.has(callee.object.name) &&
            ['get','getOwnPropertyDescriptor'].includes(method??'');
          const descriptorMethod=objectAliases.has(callee.object.name) &&
            method==='getOwnPropertyDescriptor';
          // A computed Reflect method alias can get an inherited Function
          // constructor from any function receiver, even Number. Its unknown
          // second argument invalidates static-only ESM consumer coverage.
          if(reflectiveMethod||descriptorMethod) {
            const selected=provenKey(node.arguments[1]);
            if(selected===null && !primitiveInertKey(node.arguments[1]) ||
               selected!==null && (dynamicCompilerNames.has(selected) ||
                 secondaryLoaderNames.has(selected))) ambiguous=true;
          }
        }
        if(callee.type==='MemberExpression' && callee.object.type==='Identifier' &&
           provenKey(node.arguments[1])==='constructor') {
          const method=provenKey(callee.property,callee.computed);
          if(reflectAliases.has(callee.object.name) &&
             ['get','getOwnPropertyDescriptor'].includes(method??'') ||
             objectAliases.has(callee.object.name) &&
             ['getOwnPropertyDescriptor','getOwnPropertyDescriptors'].includes(method??'')) {
            ambiguous=true;
          }
        }
        if(callee.type==='MemberExpression' &&
           callee.object.type==='Identifier' && node.arguments[0]?.type==='Identifier' &&
           globalAliases.has(node.arguments[0].name)) {
          const method=provenKey(callee.property,callee.computed);
          const reflective=reflectAliases.has(callee.object.name) &&
            ['get','getOwnPropertyDescriptor'].includes(method??'');
          const descriptors=objectAliases.has(callee.object.name) &&
            ['getOwnPropertyDescriptor','getOwnPropertyDescriptors'].includes(method??'');
          if(reflective||descriptors) {
            const selected=provenKey(node.arguments[1]);
            if(method==='getOwnPropertyDescriptors' || selected===null ||
               dynamicCompilerNames.has(selected) || secondaryLoaderNames.has(selected) ||
               ['require','createRequire','getBuiltinModule'].includes(selected)) ambiguous=true;
          }
        }
        const name=callee.type==='Identifier' ? callee.name :
          callee.type==='MemberExpression' ?
            (callee.computed ? staticString(callee.property) : staticName(callee.property)) : null;
        if (typeof name==='string' && ['require','createRequire','getBuiltinModule'].includes(name)) ambiguous=true;
      }
      if (!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) ||
          node.source?.type!=='Literal' || typeof node.source.value!=='string') return;
      const specifier=node.source.value;
      // node:module exposes createRequire and loader hooks. A separate
      // require('./target.mjs') would not appear as an ESM import edge.
      if (specifier==='node:module'||secondaryLoaderModules.has(specifier)) ambiguous=true;
      if (specifier.startsWith('node:')) return;
      if (!specifier.startsWith('./') && !specifier.startsWith('../') ||
          /[?#%\\]/.test(specifier)) {ambiguous=true;return;}
      // All relative dependencies must be in the declared file group. This
      // also refuses alternate capitalization that can resolve to the same
      // disk file on case-insensitive Windows/macOS volumes.
      const resolved=resolveImport(module.file.path,specifier);
      if (!resolved || !knownFiles.has(resolved)) ambiguous=true;
    });
    if(ambiguous) return {files,objects:0,properties:0};
  }

  // Prove a very small inter-module function summary: an exported function
  // with exactly one plain parameter and exactly "return parameter" in its
  // body. The exporting module must never reference that mutable function
  // binding again, so its implementation cannot be reassigned behind an
  // importer's live binding. An impure or async wrapper is never summarized.
  /** @type {Map<string,Set<string>>} */
  const identities=new Map();
  for(const [filename,module] of modules) {
    const exported=new Set();
    for(const statement of module.ast.body) {
      if(statement.type!=='ExportNamedDeclaration' || statement.source ||
          statement.declaration?.type!=='FunctionDeclaration') continue;
      const fn=statement.declaration;
      const name=fn.id?.name;
      if(typeof name!=='string' || module.bindings.get(name)!==1 ||
          fn.async || fn.generator || fn.params.length!==1 ||
          fn.params[0].type!=='Identifier' || fn.body.body.length!==1 ||
          fn.body.body[0].type!=='ReturnStatement' ||
          fn.body.body[0].argument?.type!=='Identifier' ||
          fn.body.body[0].argument.name!==fn.params[0].name) continue;
      let additionalReference=false;
      walk(module.ast,(node,parent,key)=>{
        if(node.type==='Identifier' && node.name===name &&
            !(node===fn.id && parent===fn && key==='id')) additionalReference=true;
      });
      if(!additionalReference) exported.add(name);
    }
    // An exported const arrow with a single identifier expression body is
    // also a stable pure identity. Unlike a function declaration, the const
    // binding cannot be reassigned by its declaring module.
    for(const statement of module.ast.body) {
      if(statement.type!=='ExportNamedDeclaration' || statement.source ||
          statement.declaration?.type!=='VariableDeclaration' ||
          statement.declaration.kind!=='const') continue;
      for(const dec of statement.declaration.declarations) {
        const fn=dec.init;
        if(dec.id.type!=='Identifier' || module.bindings.get(dec.id.name)!==1 ||
            !fn || !['ArrowFunctionExpression','FunctionExpression'].includes(fn.type) ||
            fn.async || fn.generator || fn.params.length!==1 ||
            fn.params[0].type!=='Identifier') continue;
        const parameter=fn.params[0].name;
        const arrowIdentity=fn.type==='ArrowFunctionExpression' &&
          fn.body.type==='Identifier' && fn.body.name===parameter;
        const functionIdentity=fn.body.type==='BlockStatement' &&
          fn.body.body.length===1 && fn.body.body[0].type==='ReturnStatement' &&
          fn.body.body[0].argument?.type==='Identifier' &&
          fn.body.body[0].argument.name===parameter;
        if(arrowIdentity||functionIdentity) exported.add(dec.id.name);
      }
    }
    identities.set(filename,exported);
  }
  /** @type {Map<string,Map<string,number>>} */
  const importedIdentities=new Map();
  for(const [filename,module] of modules) {
    const imported=new Map();
    for(const statement of module.ast.body) {
      if(statement.type!=='ImportDeclaration') continue;
      const origin=resolveImport(filename,statement.source.value);
      const target=origin ? identities.get(origin) : null;
      if(!target) continue;
      for(const spec of statement.specifiers) {
        const exportedName=spec.type==='ImportSpecifier' ?
          (spec.imported.name ?? spec.imported.value) : null;
        if(typeof exportedName==='string' && target.has(exportedName) &&
            module.bindings.get(spec.local.name)===1) imported.set(spec.local.name,0);
      }
    }
    importedIdentities.set(filename,imported);
  }

  // Restrict cross-module readers to single-member returns from a plain
  // parameter, with no local references to their exported binding.
  // Direct exported function declarations and immutable function expressions
  // have stable call identities across ordinary ESM named imports.
  /** @type {Map<string,Map<string,{member:AstNode,property:string,argIndex:number}>>} */
  const exportedReaders=new Map();
  for(const [filename,module] of modules) {
    /** @type {Map<string,{member:AstNode,property:string,argIndex:number}>} */
    const readers=new Map();
    /** @param {string} name @param {AstNode} binding @param {AstNode} fn */
    function inspectReader(name,binding,fn) {
      if(module.bindings.get(name)!==1 || fn.async||fn.generator ||
          !['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(fn.type) ||
          !fn.params.length ||
          fn.params.some((/** @type {AstNode} */ param)=>param.type!=='Identifier'))return;
      const returned=fn.body.type==='BlockStatement'
        ? fn.body.body.length===1 && fn.body.body[0].type==='ReturnStatement'
          ? fn.body.body[0].argument : null
        : fn.body;
      if(returned?.type!=='MemberExpression'||returned.object.type!=='Identifier')return;
      const argIndex=fn.params.findIndex((/** @type {AstNode} */ param)=>param.name===returned.object.name);
      if(argIndex<0)return;
      const property=returned.computed ? staticString(returned.property) : staticName(returned.property);
      if(property===null)return;
      let usedInExporter=false;
      walk(module.ast,node=>{
        if(node.type==='Identifier' && node.name===name && node!==binding)usedInExporter=true;
      });
      if(!usedInExporter)readers.set(name,{member:returned,property,argIndex});
    }
    for(const statement of module.ast.body) {
      if(statement.type!=='ExportNamedDeclaration'||statement.source)continue;
      const declaration=statement.declaration;
      if(declaration?.type==='FunctionDeclaration'&&declaration.id?.type==='Identifier') {
        inspectReader(declaration.id.name,declaration.id,declaration);
      }
      if(declaration?.type==='VariableDeclaration'&&declaration.kind==='const') {
        for(const dec of declaration.declarations) {
          if(dec.id.type==='Identifier'&&dec.init)inspectReader(dec.id.name,dec.id,dec.init);
        }
      }
    }
    exportedReaders.set(filename,readers);
  }

  /** @type {Map<string,import('./ast').Edit[]>} */
  const allEdits = new Map();
  /** @param {string} file @param {import('./ast').Edit} edit */
  function add(file,edit) {
    const existing=allEdits.get(file) ?? [];
    existing.push(edit);
    allEdits.set(file,existing);
  }
  let objects=0;
  let properties=0;
  for(const [exporterName,exporter] of modules) {
    for(const declaration of exporter.ast.body) {
      if (declaration.type !== 'ExportNamedDeclaration' || declaration.source ||
          declaration.declaration?.type !== 'VariableDeclaration' || declaration.declaration.kind!=='const') continue;
      for(const decl of declaration.declaration.declarations) {
        if (decl.id.type!=='Identifier'||!decl.init||
            exporter.bindings.get(decl.id.name)!==1) continue;
        const literal=decl.init.type==='ObjectExpression' ? decl.init :
          singleUseFactoryObject(exporter.ast,exporter.bindings,decl.init);
        if(!literal)continue;
        /** @type {AstNode[]} */
        const props=literal.properties;
        if (!props.length || props.some(p => p.type!=='Property' || p.method || p.shorthand ||
              p.kind!=='init' || !isLiteralValue(p.value) || !ownPropertyName(p) ||
              ['__proto__','constructor','prototype'].includes(String(ownPropertyName(p))))) continue;
        const names=props.map(ownPropertyName);
        if (new Set(names).size!==names.length) continue;
        const exportName=decl.id.name;
        // Only direct named const-string exports evaluated before this owner
        // can be safe keys in an imported owner read. Since the imported
        // owner's const binding cannot be observed before initialization,
        // its earlier string keys must already be initialized even in an
        // ESM cycle. Later keys may still be in TDZ and are excluded.
        /** @type {Map<string,string>} */
        const earlierKeyExports=new Map();
        /** @type {Map<string,string>} */
        const earlierLocalConsts=new Map();
        // The ESM binding's initializer, rather than the position of an
        // export specifier, decides whether a reentrant cyclic importer can
        // read this key after the owner has initialized.
        for(const statement of exporter.ast.body) {
          const declaration=statement.type==='VariableDeclaration' ? statement :
            statement.type==='ExportNamedDeclaration' && !statement.source ?
              statement.declaration : null;
          if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const')continue;
          for(const keyDecl of declaration.declarations) {
            if(keyDecl.id.type!=='Identifier'||!keyDecl.init||
               keyDecl.start>=decl.start||
               exporter.bindings.get(keyDecl.id.name)!==1)continue;
            const literalKey=staticString(keyDecl.init);
            if(literalKey!==null&&names.includes(literalKey)) {
              earlierLocalConsts.set(keyDecl.id.name,literalKey);
            }
          }
        }
        for(const statement of exporter.ast.body) {
          if(statement.type!=='ExportNamedDeclaration'||statement.source)continue;
          if(statement.declaration?.type==='VariableDeclaration') {
            for(const keyDecl of statement.declaration.declarations) {
              if(keyDecl.id.type!=='Identifier')continue;
              const literalKey=earlierLocalConsts.get(keyDecl.id.name);
              if(literalKey!==undefined)earlierKeyExports.set(keyDecl.id.name,literalKey);
            }
          } else if(!statement.declaration) {
            for(const spec of statement.specifiers) {
              if(spec.type!=='ExportSpecifier'||spec.local.type!=='Identifier')continue;
              const literalKey=earlierLocalConsts.get(spec.local.name);
              const publicName=spec.exported.name??spec.exported.value;
              if(literalKey!==undefined && typeof publicName==='string') {
                earlierKeyExports.set(publicName,literalKey);
              }
            }
          }
        }
        const readers=new Map([.../** @type {Map<string,{member:AstNode,property:string,argIndex:number}>} */ (exportedReaders.get(exporterName)??new Map())]
          .filter(([,reader])=>names.includes(reader.property)));
        /** @type {Set<string>} */
        const usedReaders=new Set();
        const localProof=proveLocalObject(exporter.ast,exportName,exporter.bindings,importedIdentities.get(exporterName));
        if(!localProof) continue;
        /** @type {{file:string,source:string,proof:NonNullable<ReturnType<typeof proveLocalObject>>}[]} */
        const users=[{file:exporterName,source:/** @type {string} */ (exporter.file.code),proof:localProof}];
        let failed=false;
        for(const [importerName,importer] of modules) {
          if (failed) break;
          /** @type {string[]} */
          const importedAliases=[];
          /** @type {Map<string,string>} Proven local binding name to immutable exported string. */
          const importedKeys=new Map();
          /** @type {Map<string,string>} Local reader alias to original exported reader name. */
          const readerAliases=new Map();
          for(const statement of importer.ast.body) {
            if(statement.type==='ImportDeclaration') {
              const origin=resolveImport(importerName,statement.source.value);
              if(acyclicImports && origin && origin!==exporterName) {
                // Every dependency has completed evaluation before an
                // acyclic importer's body runs, so reading this immutable
                // imported string cannot be an observable TDZ access.
                // Still require exact direct ESM provenance and an own key.
                for(const spec of statement.specifiers) {
                  if(spec.type!=='ImportSpecifier'||importer.bindings.get(spec.local.name)!==1)continue;
                  const key=verifiedStrings.get(importerName)?.get(spec.local.name);
                  if(key!==undefined && names.includes(key))importedKeys.set(spec.local.name,key);
                }
              }
            }
            if (statement.type==='ImportDeclaration' && resolveImport(importerName,statement.source.value)===exporterName) {
              for(const spec of statement.specifiers) {
                if (spec.type==='ImportNamespaceSpecifier') {failed=true;break;}
                if(spec.type!=='ImportSpecifier')continue;
                const exportedName=spec.imported.name ?? spec.imported.value;
                if(exportedName===exportName)importedAliases.push(spec.local.name);
                const key=earlierKeyExports.get(exportedName);
                if(key!==undefined&&importer.bindings.get(spec.local.name)===1) {
                  importedKeys.set(spec.local.name,key);
                }
                if(readers.has(exportedName))readerAliases.set(spec.local.name,exportedName);
              }
            }
            if ((statement.type==='ExportAllDeclaration'||(statement.type==='ExportNamedDeclaration'&&statement.source)) &&
                resolveImport(importerName,statement.source.value)===exporterName) failed=true;
          }
          if (failed) break;
          let hasDynamic=false;
          walk(importer.ast,node=>{if(node.type==='ImportExpression')hasDynamic=true;});
          if (hasDynamic) {failed=true;break;}
          // A reader imported without the candidate state, or alongside two
          // separately proved state bindings, has insufficient call ownership
          // evidence. Refuse rather than treating the reader as a free alias.
          if(readerAliases.size && importedAliases.length!==1) {failed=true;break;}
          const consumerIndices=new Map([...readerAliases].map(([name,exported])=>
            [name,/** @type {{member:AstNode,property:string,argIndex:number}} */ (readers.get(exported)).argIndex]));
          /** @type {NonNullable<ReturnType<typeof proveLocalObject>>|null} */
          let readerProof=null;
          for(const alias of importedAliases) {
            if(importer.bindings.get(alias)!==1) {failed=true;break;}
            // Source-observation safety can use every independently proven imported
            // string. Object-field rewriting remains limited to keys that
            // were initialized before the owner and match its own fields.
            const proof=proveLocalObject(importer.ast,alias,importer.bindings,
              importedIdentities.get(importerName),consumerIndices,importedKeys,
              verifiedStrings.get(importerName));
            if(!proof) {failed=true;break;}
            users.push({file:importerName,source:/** @type {string} */ (importer.file.code),proof});
            if(readerAliases.size)readerProof=proof;
          }
          if(failed)break;
          if(readerAliases.size) {
            let unsafeReaderUse=false;
            walk(importer.ast,(node,parent,key)=>{
              if(node.type!=='Identifier'||!readerAliases.has(node.name))return;
              if(parent?.type==='ImportSpecifier')return;
              const exportedReader=readerAliases.get(node.name);
              const readInfo=exportedReader ? readers.get(exportedReader) : null;
              const input=readInfo ? parent?.arguments?.[readInfo.argIndex] : null;
              const provenInput=Boolean(input &&
                (input.type==='Identifier' && readerProof?.aliases.has(input.name) ||
                 input.type==='CallExpression' && readerProof?.forwardedCalls.has(input)));
              if(parent?.type==='CallExpression' && key==='callee' && !parent.optional &&
                  node===parent.callee && provenInput) {
                if(exportedReader)usedReaders.add(exportedReader);
              } else unsafeReaderUse=true;
            });
            if(unsafeReaderUse) {failed=true;break;}
          }
        }
        if (failed) continue;
        // An inherited getter in any importer can inspect the exported
        // object's original own keys even when the reference never escapes.
        const ownNames=new Set(names);
        if (users.some(user=>
          user.proof.members.some(member=>{const field=user.proof.memberNames.get(member);return typeof field!=='string'||!ownNames.has(field);}) ||
          user.proof.patterns.some(property=>!ownNames.has(ownPropertyName(property))))) continue;
        // Prevent externally exposed exports of the same object via an export specifier.
        let reexported=false;
        walk(exporter.ast,(node,parent)=>{
          if(node.type==='ExportSpecifier' && node.local.name===exportName) reexported=true;
        });
        if(reexported) continue;
        const mapping=new Map();
        for(const prop of props) {
          const old=ownPropertyName(prop);
          const token=createHash('sha256').update(`${seed}/${exporterName}/${exportName}/${old}`).digest('hex').slice(0,12);
          mapping.set(old,`_p${token}`);
        }
        // Keep the exported object's shape intact if truncated digests collide.
        if (new Set(mapping.values()).size !== mapping.size) continue;
        // The export binding name is unchanged; its public object shape is
        // changed only when callers opted into closed-world semantics.
        for(const prop of props) add(exporterName,{start:prop.key.start,end:prop.key.end,text:JSON.stringify(mapping.get(ownPropertyName(prop)))});
        // Rewrite the reader's one proven member access only after every
        // importing call site has passed ownership validation.
        for(const name of usedReaders) {
          const reader=readers.get(name);
          if(!reader)continue;
          const replacement=mapping.get(reader.property);
          if(!replacement)continue;
          add(exporterName,{start:reader.member.property.start,end:reader.member.property.end,
            text:reader.member.computed?JSON.stringify(replacement):replacement});
        }
        for(const user of users) {
          for(const member of user.proof.members) {
            const old=user.proof.memberNames.get(member);
            if(old!==undefined && mapping.has(old)) add(user.file,{start:member.property.start,end:member.property.end,
              text:member.computed ? JSON.stringify(mapping.get(old)) : mapping.get(old)});
          }
          for (const edit of patternPropertyEdits(user.source,user.proof.patterns,mapping)) {
            add(user.file,edit);
          }
        }
        objects++;
        properties+=mapping.size;
      }
    }
  }
  return {files:files.map(f => {
    const edits=allEdits.get(f.path);
    if(!edits) return f;
    if(typeof f.code!=='string') throw new TypeError(`Cannot rewrite binary module ${f.path}`);
    return {...f,code:applyEdits(f.code,edits)};
  }),objects,properties};
}

module.exports={renameCrossFileProperties,collectVerifiedImportedStrings,collectVerifiedImportedCloneAliases,collectImportedFunctionArrays};
