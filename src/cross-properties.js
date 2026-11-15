'use strict';

const path = require('node:path');
const {createHash} = require('node:crypto');
const {walk,applyEdits,parse} = require('./ast');
const {collectBindings,proveLocalObject,staticName,patternPropertyEdits} = require('./properties');

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
  // Without a proof for other language/runtime boundaries, inline scripts,
  // assets, and CommonJS code are potential consumers of any ESM export.
  // Decline the entire closed-world property pass for mixed-format projects.
  if (files.some(file => (file.sourceType ?? (file.path.endsWith('.mjs') ? 'module' : 'script')) !== 'module')) {
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
  // Query/fragment and percent-encoded ESM URLs can resolve to an input
  // file through a different spelling. An ordinary path join misses them.
  // Refuse the complete pass until a URL-aware resolution proof is available.
  for(const module of modules.values()) {
    let ambiguous=false;
    walk(module.ast,node=>{
      if ((node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration') &&
          node.source?.type==='Literal' && typeof node.source.value==='string' &&
          /^[.][.\/]?/.test(node.source.value) && /[?#%]/.test(node.source.value)) ambiguous=true;
    });
    if(ambiguous) return {files,objects:0,properties:0};
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
              p.kind!=='init' || p.value.type!=='Literal' || !staticName(p.key) ||
              ['__proto__','constructor','prototype'].includes(String(staticName(p.key))))) continue;
        const names=props.map(p=>staticName(p.key));
        if (new Set(names).size!==names.length) continue;
        const exportName=decl.id.name;
        const localProof=proveLocalObject(exporter.ast,exportName,exporter.bindings);
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
            const proof=proveLocalObject(importer.ast,alias,importer.bindings);
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
