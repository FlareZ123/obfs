'use strict';

const path = require('node:path');
const {createHash} = require('node:crypto');
const {walk,applyEdits,parse,observesFunctionSource} = require('./ast');
const {collectBindings,proveLocalObject,staticName,patternPropertyEdits,isLiteralValue} = require('./properties');

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
  // The filename-oriented resolver only proves canonical relative imports.
  // Absolute file URLs, package aliases and encoded/query/fragment paths can
  // reach the same ESM source through another spelling without being tracked.
  // Node builtins cannot resolve to an input module under the default loader.
  // Dynamic source generation can hide additional consumers of an otherwise
  // statically closed ESM module graph. Even a constructor held as an alias
  // must make the property-renaming proof decline the whole graph.
  const dynamicCompilerNames=new Set(['eval','Function','AsyncFunction','GeneratorFunction','AsyncGeneratorFunction']);
  for(const module of modules.values()) {
    // Function source can be inspected by a separate ESM consumer that never
    // imports the object whose field is being renamed. Check the whole graph,
    // rather than relying on object-alias consumers alone.
    if(observesFunctionSource(module.ast))return {files,objects:0,properties:0};
    let ambiguous=false;
    walk(module.ast,node=>{
      if (node.type==='Identifier' && dynamicCompilerNames.has(node.name)) ambiguous=true;
      if (node.type==='MemberExpression') {
        const name=node.computed ? (node.property.type==='Literal' ? node.property.value : null) :
          staticName(node.property);
        if (typeof name==='string' && dynamicCompilerNames.has(name)) ambiguous=true;
      }
      // A Node ESM file can acquire a CommonJS require function without using
      // ImportExpression or a static import from the target. This is another
      // way to read an exported object's original keys, so the proof must
      // decline the graph until such consumers are resolved explicitly.
      if (node.type==='CallExpression') {
        const callee=node.callee;
        const name=callee.type==='Identifier' ? callee.name :
          callee.type==='MemberExpression' ?
            (callee.computed ? (callee.property.type==='Literal' ? callee.property.value : null) :
              staticName(callee.property)) : null;
        if (typeof name==='string' && ['require','createRequire','getBuiltinModule'].includes(name)) ambiguous=true;
      }
      if (!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) ||
          node.source?.type!=='Literal' || typeof node.source.value!=='string') return;
      const specifier=node.source.value;
      // node:module exposes createRequire and loader hooks. A separate
      // require('./target.mjs') would not appear as an ESM import edge.
      if (specifier==='node:module') ambiguous=true;
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
            fn?.type!=='ArrowFunctionExpression' || fn.async ||
            fn.params.length!==1 || fn.params[0].type!=='Identifier' ||
            fn.body.type!=='Identifier' || fn.body.name!==fn.params[0].name) continue;
        exported.add(dec.id.name);
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
        if (decl.id.type!=='Identifier' || decl.init?.type!=='ObjectExpression' ||
            exporter.bindings.get(decl.id.name)!==1) continue;
        /** @type {AstNode[]} */
        const props=decl.init.properties;
        if (!props.length || props.some(p => p.type!=='Property' || p.computed || p.method || p.shorthand ||
              p.kind!=='init' || !isLiteralValue(p.value) || !staticName(p.key) ||
              ['__proto__','constructor','prototype'].includes(String(staticName(p.key))))) continue;
        const names=props.map(p=>staticName(p.key));
        if (new Set(names).size!==names.length) continue;
        const exportName=decl.id.name;
        const localProof=proveLocalObject(exporter.ast,exportName,exporter.bindings,importedIdentities.get(exporterName));
        if(!localProof) continue;
        /** @type {{file:string,source:string,proof:NonNullable<ReturnType<typeof proveLocalObject>>}[]} */
        const users=[{file:exporterName,source:/** @type {string} */ (exporter.file.code),proof:localProof}];
        let failed=false;
        for(const [importerName,importer] of modules) {
          if (failed) break;
          /** @type {string[]} */
          const importedAliases=[];
          for(const statement of importer.ast.body) {
            if (statement.type==='ImportDeclaration' && resolveImport(importerName,statement.source.value)===exporterName) {
              for(const spec of statement.specifiers) {
                if (spec.type==='ImportNamespaceSpecifier') {failed=true;break;}
                if (spec.type==='ImportSpecifier' && (spec.imported.name ?? spec.imported.value)===exportName) importedAliases.push(spec.local.name);
              }
            }
            if ((statement.type==='ExportAllDeclaration'||(statement.type==='ExportNamedDeclaration'&&statement.source)) &&
                resolveImport(importerName,statement.source.value)===exporterName) failed=true;
          }
          if (failed) break;
          let hasDynamic=false;
          walk(importer.ast,node=>{if(node.type==='ImportExpression')hasDynamic=true;});
          if (hasDynamic) {failed=true;break;}
          for(const alias of importedAliases) {
            if(importer.bindings.get(alias)!==1) {failed=true;break;}
            const proof=proveLocalObject(importer.ast,alias,importer.bindings,importedIdentities.get(importerName));
            if(!proof) {failed=true;break;}
            users.push({file:importerName,source:/** @type {string} */ (importer.file.code),proof});
          }
        }
        if (failed) continue;
        // An inherited getter in any importer can inspect the exported
        // object's original own keys even when the reference never escapes.
        const ownNames=new Set(names);
        if (users.some(user=>
          user.proof.members.some(member=>!ownNames.has(member.computed ? member.property.value : staticName(member.property))) ||
          user.proof.patterns.some(property=>!ownNames.has(staticName(property.key))))) continue;
        // Prevent externally exposed exports of the same object via an export specifier.
        let reexported=false;
        walk(exporter.ast,(node,parent)=>{
          if(node.type==='ExportSpecifier' && node.local.name===exportName) reexported=true;
        });
        if(reexported) continue;
        const mapping=new Map();
        for(const prop of props) {
          const old=staticName(prop.key);
          const token=createHash('sha256').update(`${seed}/${exporterName}/${exportName}/${old}`).digest('hex').slice(0,12);
          mapping.set(old,`_p${token}`);
        }
        // Keep the exported object's shape intact if truncated digests collide.
        if (new Set(mapping.values()).size !== mapping.size) continue;
        // The export binding name is unchanged; its public object shape is
        // changed only when callers opted into closed-world semantics.
        for(const prop of props) add(exporterName,{start:prop.key.start,end:prop.key.end,text:JSON.stringify(mapping.get(staticName(prop.key)))});
        for(const user of users) {
          for(const member of user.proof.members) {
            const old=member.computed ? member.property.value : staticName(member.property);
            if(mapping.has(old)) add(user.file,{start:member.property.start,end:member.property.end,
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

module.exports={renameCrossFileProperties};
