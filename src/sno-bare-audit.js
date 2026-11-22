'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire,isBuiltin}=require('node:module');
const {parse,walk}=require('./ast');
const {collectBindings}=require('./properties');

/** @typedef {import('./core').SourceFile} SourceFile */

/**
 * Resolve a future, possibly not-yet-created source tree beneath the
 * nearest existing real ancestor. This models Node's default realpath
 * lookup for build-time comparisons and does not load app modules.
 * @param {string} root
 * @returns {Promise<string>}
 */
async function futureRealRoot(root) {
  const intended=path.resolve(root);
  let existing=intended;
  for(;;) {
    try {
      const actual=await fs.realpath(existing);
      return path.resolve(actual,path.relative(existing,intended));
    } catch(error) {
      if(/** @type {NodeJS.ErrnoException} */(error).code!=='ENOENT')throw error;
      const parent=path.dirname(existing);
      if(parent===existing)throw error;
      existing=parent;
    }
  }
}

/**
 * Collect only direct, string-literal calls to the standard lexical
 * CommonJS require function. This is deliberately a narrow audit:
 * arbitrary dynamic aliases, module.createRequire, import() and custom
 * loaders need separate analysis. A lexical declaration named require
 * could shadow the builtin and is conservatively rejected.
 *
 * @param {SourceFile[]} files
 * @returns {Map<string,string[]>}
 */
function directBareRequires(files) {
  /** @type {Map<string,string[]>} */
  const entries=new Map();
  for(const file of files) {
    if(!/\.(?:cjs|js)$/u.test(file.path)||file.sourceType==='module'||
        file.sourceType==='asset'||typeof file.code!=='string')continue;
    const ast=parse(file.code,'commonjs');
    /** @type {string[]} */
    const refs=[];
    const shadow=collectBindings(ast).has('require');
    let dynamicScope=false;
    walk(ast,node=>{
      if(node.type==='WithStatement' ||
         node.type==='CallExpression'&&node.callee?.type==='Identifier'&&
           node.callee.name==='eval')dynamicScope=true;
      if(node.type!=='CallExpression'||node.callee?.type!=='Identifier'||
          node.callee.name!=='require')return;
      if(!node.arguments?.length ||
         node.arguments[0]?.type!=='Literal'||
         typeof node.arguments[0].value!=='string')return;
      const specifier=/** @type {string} */(node.arguments[0].value);
      if(specifier==='.'||specifier==='..'||
          specifier.startsWith('./')||specifier.startsWith('../')||
          (path.sep==='\\' &&
            (specifier.startsWith('.\\')||specifier.startsWith('..\\')))||
          specifier.startsWith('/')||
          specifier.startsWith('#')||path.isAbsolute(specifier)||
          isBuiltin(specifier))return;
      refs.push(specifier);
    });
    if((shadow||dynamicScope)&&refs.length)throw new TypeError(
      'SNO bare dependency audit cannot prove unshadowed require in '+file.path);
    if(refs.length)entries.set(file.path,refs.sort());
  }
  return entries;
}

/**
 * Audit the location-specific resolution of direct literal CommonJS bare
 * requires before publishing a SNO output directory. Source and output
 * resolve to the *same actual file path* under the native Node resolver,
 * including any package exports/conditional exports rules. A different
 * path can alter __filename, package-relative dependencies, native addon
 * loading or code bytes, so it is refused even if the payload matches.
 *
 * The audit observes only frozen direct literal require sites; it does
 * not certify dynamic imports, require aliases or custom loader hooks.
 *
 * @param {SourceFile[]} original
 * @param {SourceFile[]} generated
 * @param {string} inputRoot
 * @param {string} outputRoot
 * @returns {Promise<{entries:number,files:number}>}
 */
async function assertSnoDirectBareRequireParity(original,generated,inputRoot,outputRoot) {
  const sources=directBareRequires(original);
  const targets=directBareRequires(generated);
  // Resolving before publication cannot see package.json files that this
  // build will emit. They can introduce a self-reference or override an
  // external ancestor's package namespace. Decline the opt-in audit for
  // direct calls beneath a future package scope rather than assert parity
  // against a stale or incomplete resolver environment.
  const packaged=new Set(generated.filter(file=>
    file.path==='package.json'||file.path.endsWith('/package.json')
  ).map(file=>file.path));
  for(const filename of sources.keys()) {
    let directory=path.posix.dirname(filename);
    for(;;) {
      if(packaged.has(path.posix.join(directory,'package.json'))) {
        throw new Error('SNO bare dependency audit cannot model future package scope: '+filename);
      }
      if(directory==='.')break;
      directory=path.posix.dirname(directory);
    }
  }
  for(const [name,refs] of sources) {
    const transformed=targets.get(name);
    if(!transformed||JSON.stringify(transformed)!==JSON.stringify(refs)) {
      throw new Error('SNO bare dependency calls changed during compilation: '+name);
    }
  }
  for(const name of targets.keys())if(!sources.has(name)) {
    throw new Error('SNO bare dependency calls introduced during compilation: '+name);
  }

  const [input,output]=await Promise.all([
    futureRealRoot(inputRoot),futureRealRoot(outputRoot)
  ]);
  let entries=0;
  for(const [filename,specifiers] of sources) {
    const from=createRequire(path.join(input,filename));
    const to=createRequire(path.join(output,filename));
    for(const specifier of specifiers) {
      /** @type {string} */
      let before;
      /** @type {string} */
      let after;
      try {before=from.resolve(specifier);}
      catch(error) {
        throw new Error('SNO source bare dependency could not resolve: '+
          filename+' -> '+specifier+' ('+
          /** @type {Error} */(error).message+')');
      }
      try {after=to.resolve(specifier);}
      catch(error) {
        throw new Error('SNO output bare dependency could not resolve: '+
          filename+' -> '+specifier+' ('+
          /** @type {Error} */(error).message+')');
      }
      if(before!==after) {
        throw new Error('SNO bare dependency resolution differs: '+
          filename+' -> '+specifier+' ('+before+' vs '+after+')');
      }
      entries++;
    }
  }
  return {entries,files:sources.size};
}

module.exports={directBareRequires,assertSnoDirectBareRequireParity};
