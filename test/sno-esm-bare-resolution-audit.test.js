'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');
const {directBareImports,assertSnoDirectBareImportParity}=require('../src/sno-bare-audit');

const packageName='sno-esm-resolution-probe';

/**
 * Run a native or generated SNO entry in a separate Node process.
 * @param {string} entry
 * @returns {number}
 */
function execute(entry) {
  const child=spawnSync(process.execPath,['-e',
    'process.stdout.write(String(require(process.argv[1])))',entry],{
      encoding:'utf8',timeout:15000
    });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return Number(child.stdout);
}

/**
 * @param {string} root
 * @param {number} importValue
 * @param {number} requireValue
 * @returns {Promise<void>}
 */
async function writePackage(root,importValue,requireValue) {
  const directory=path.join(root,'node_modules',packageName);
  await atomicWrite(path.join(directory,'package.json'),JSON.stringify({
    type:'module',
    exports:{'.':{import:'./import.mjs',require:'./require.cjs'}}
  }));
  await atomicWrite(path.join(directory,'import.mjs'),
    'export const value='+String(importValue)+';');
  await atomicWrite(path.join(directory,'require.cjs'),
    'module.exports='+String(requireValue)+';');
}

/**
 * @param {string} root
 * @returns {Promise<void>}
 */
async function writeApplication(root) {
  await atomicWrite(path.join(root,'engine.mjs'),
    "import {value} from '"+packageName+"';export default value+13;");
  await atomicWrite(path.join(root,'entry.cjs'),
    "module.exports=require('./engine.mjs').default;");
}

/**
 * @param {(directory:string)=>Promise<void>} callback
 * @returns {Promise<void>}
 */
async function fixture(callback) {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-esm-bare-audit-'));
  try {await callback(temp);}
  finally {await fs.rm(temp,{recursive:true,force:true});}
}

test('opt-in SNO ESM audit detects a different import-condition dependency before publication',async()=>{
  await fixture(async temp=>{
    const source=path.join(temp,'source');
    const output=path.join(temp,'output');
    const guarded=path.join(temp,'guarded');
    await writeApplication(source);
    await writePackage(source,103,401);
    await writePackage(output,107,401);
    assert.equal(execute(path.join(source,'entry.cjs')),116);

    await main('sno',['--root',source,'--entry','entry.cjs',
      '--out',output,'--seed','sno-esm-relocation-control']);
    assert.equal(execute(path.join(output,'sno-entry.cjs')),120,
      'Without the optional audit the relocated ESM import selects different package bytes');

    await writePackage(guarded,107,401);
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs',
        '--out',guarded,'--seed','sno-esm-relocation-control','--audit-bare-esm']),
      error=>error instanceof Error&&
        /SNO ESM bare dependency resolution differs: engine\.mjs -> sno-esm-resolution-probe/u.test(error.message)&&
        /import\.mjs/u.test(error.message)
    );
    await assert.rejects(fs.stat(path.join(guarded,'sno-entry.cjs')),{code:'ENOENT'});
    await assert.rejects(fs.stat(path.join(guarded,'engine.mjs')),{code:'ENOENT'});
  });
});

test('opt-in SNO ESM audit accepts one shared dependency and preserves emitted bytes',async()=>{
  await fixture(async temp=>{
    const root=path.join(temp,'project');
    const source=path.join(root,'source');
    const output=path.join(root,'output');
    const control=path.join(root,'control');
    await writeApplication(source);
    await writePackage(root,103,401);
    const args=['--root',source,'--entry','entry.cjs',
      '--seed','sno-esm-shared-dependency'];
    await main('sno',[...args,'--out',output,'--audit-bare-esm']);
    await main('sno',[...args,'--out',control]);
    for(const filename of ['engine.mjs','entry.cjs','sno-entry.cjs']) {
      assert.deepEqual(
        await fs.readFile(path.join(output,filename)),
        await fs.readFile(path.join(control,filename))
      );
    }
    assert.equal(execute(path.join(source,'entry.cjs')),116);
    assert.equal(execute(path.join(output,'sno-entry.cjs')),116);
  });
});


test('ESM audit resolves import.meta without evaluating external package code',async()=>{
  await fixture(async temp=>{
    const root=path.join(temp,'project');
    const source=path.join(root,'source');
    const output=path.join(root,'output');
    const marker=path.join(temp,'dependency-executed.txt');
    await writeApplication(source);
    const directory=path.join(root,'node_modules',packageName);
    await atomicWrite(path.join(directory,'package.json'),JSON.stringify({
      type:'module',
      exports:{'.':{import:'./import.mjs',require:'./require.cjs'}}
    }));
    await atomicWrite(path.join(directory,'import.mjs'),
      "import {writeFileSync} from 'node:fs';"+
      "writeFileSync("+JSON.stringify(marker)+",'executed');"+
      "export const value=103;");
    await atomicWrite(path.join(directory,'require.cjs'),'module.exports=401;');
    await atomicWrite(path.join(source,'engine.mjs'),
      "import {value} from '"+packageName+"';"+
      "export default {value,resolved:import.meta.resolve('"+packageName+"')};");
    await main('sno',['--root',source,'--entry','entry.cjs',
      '--out',output,'--seed','sno-esm-resolution-does-not-evaluate','--audit-bare-esm']);
    await assert.rejects(fs.stat(marker),{code:'ENOENT'});
  });
});

test('ESM audit collects static, re-export, literal dynamic and import.meta.resolve specifiers',()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[
    {path:'entry.mjs',sourceType:'module',code:
      "import value from 'alpha';export {value as other} from 'beta';"+
      "export * from 'gamma';void import('delta');"+
      "const resolved=import.meta.resolve('epsilon');"+
      "import 'node:fs';import './relative.mjs';"},
    {path:'dynamic.cjs',sourceType:'commonjs',code:
      "module.exports=import('zeta');"}
  ];
  assert.deepEqual([...directBareImports(files)],[
    ['entry.mjs',['alpha','beta','delta','epsilon','gamma']],
    ['dynamic.cjs',['zeta']]
  ]);
});


test('ESM audit refuses escaped import.meta resolver aliases before publication',async()=>{
  const name='sno-esm-resolution-probe';
  await fixture(async temp=>{
    const source=path.join(temp,'source');
    const output=path.join(temp,'output');
    const guarded=path.join(temp,'guarded');
    await writeApplication(source);
    await atomicWrite(path.join(source,'engine.mjs'),
      "const meta=import.meta;export default meta.resolve('"+name+"');");
    await writePackage(source,103,401);
    await writePackage(output,107,401);
    await writePackage(guarded,107,401);
    /** @param {string} entry */
    const evaluate=entry=>{
      const child=spawnSync(process.execPath,['-e',
        'process.stdout.write(String(require(process.argv[1])))',entry],{
          encoding:'utf8',timeout:15000
        });
      if(child.error)throw child.error;
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    };
    const before=evaluate(path.join(source,'entry.cjs'));
    await main('sno',['--root',source,'--entry','entry.cjs',
      '--out',output,'--seed','sno-escaped-meta-resolver']);
    const after=evaluate(path.join(output,'sno-entry.cjs'));
    assert.notEqual(before,after,'relocated alias resolves a different package URL');
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs',
        '--out',guarded,'--seed','sno-escaped-meta-resolver','--audit-bare-esm']),
      /cannot prove literal imports/u
    );
    await assert.rejects(fs.stat(path.join(guarded,'sno-entry.cjs')),{code:'ENOENT'});
  });

  for(const code of [
    "const meta=import.meta;void meta.resolve('pkg');",
    "const {resolve}=import.meta;void resolve('pkg');",
    "const resolve=Reflect.get(import.meta,'resolve');void resolve('pkg');",
    "const copied=Object.assign({},import.meta);void copied.resolve('pkg');"
  ]) {
    assert.throws(()=>directBareImports([
      {path:'engine.mjs',sourceType:'module',code}
    ]),/cannot prove literal imports/u,code);
  }
  assert.deepEqual([...directBareImports([{
    path:'engine.mjs',sourceType:'module',code:'export default import.meta.url;'
  }])],[],'known nonresolver import.meta.url remains supported');
});

test('ESM audit refuses unresolved dynamic imports, aliases, package imports and opaque modules',()=>{
  for(const code of [
    "void import(specifier);",
    "const resolved=import.meta.resolve(specifier);",
    "const resolve=import.meta.resolve;resolve('pkg');",
    "import '#internal';",
    "eval(\"import('pkg')\");",
    "new Function(\"return import('pkg')\")();"
  ]) {
    assert.throws(()=>directBareImports([{
      path:'entry.mjs',sourceType:'module',code
    }]),/cannot prove literal imports/u);
  }
  assert.throws(()=>directBareImports([{
    path:'opaque.mjs',sourceType:'asset',
    code:Buffer.from("import value from 'pkg';")
  }]),/cannot inspect opaque JavaScript/u);
});


test('ESM audit refuses custom conditions, loaders and symlink-preservation modes',async()=>{
  await fixture(async temp=>{
    const root=path.join(temp,'root');
    const output=path.join(temp,'output');
    await fs.mkdir(root,{recursive:true});
    await fs.mkdir(output,{recursive:true});
    /** @type {import('../src/core').SourceFile[]} */
    const files=[{
      path:'engine.mjs',sourceType:'module',
      code:"import value from 'sno-esm-resolution-probe';export default value;"
    }];
    const previous=process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS='--conditions=custom';
    try {
      await assert.rejects(
        assertSnoDirectBareImportParity(files,files,root,output),
        /does not model custom loaders/u
      );
    } finally {
      if(previous===undefined)delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS=previous;
    }
  });
});



test('ESM audit refuses NODE_PRESERVE_SYMLINKS before symlinked package-resolution drift',async()=>{
  await fixture(async temp=>{
    const real=path.join(temp,'real');
    const source=path.join(real,'source');
    const output=path.join(real,'output');
    const guarded=path.join(real,'guarded');
    const publicDir=path.join(temp,'public');
    const alias=path.join(publicDir,'source-alias');
    await writeApplication(source);
    await writePackage(real,103,401);
    await writePackage(publicDir,107,401);
    await fs.mkdir(publicDir,{recursive:true});
    await fs.symlink(source,alias,process.platform==='win32'?'junction':'dir');
    const previous=process.env.NODE_PRESERVE_SYMLINKS;
    process.env.NODE_PRESERVE_SYMLINKS='1';
    try {
      // The program is loaded by require() from a Node -e invocation,
      // rather than as a symlink-canonicalized main entrypoint.
      if(process.platform!=='win32') {
        assert.equal(execute(path.join(alias,'entry.cjs')),120);
      }
      await main('sno',['--root',alias,'--entry','entry.cjs','--out',output,
        '--seed','sno-esm-preserve-symlink-control']);
      assert.equal(execute(path.join(output,'sno-entry.cjs')),116);
      await assert.rejects(
        main('sno',['--root',alias,'--entry','entry.cjs','--out',guarded,
          '--seed','sno-esm-preserve-symlink-control','--audit-bare-esm']),
        /does not model custom loaders/u
      );
      await assert.rejects(fs.stat(path.join(guarded,'sno-entry.cjs')),{code:'ENOENT'});
    } finally {
      if(previous===undefined)delete process.env.NODE_PRESERVE_SYMLINKS;
      else process.env.NODE_PRESERVE_SYMLINKS=previous;
    }
  });
});


test('ESM audit refuses --no-addons when the helper would resolve the wrong condition',async()=>{
  await fixture(async temp=>{
    const source=path.join(temp,'source','app');
    const output=path.join(temp,'output','app');
    const guarded=path.join(temp,'guarded','app');
    const shared=path.join(temp,'shared');
    await atomicWrite(path.join(shared,'native.mjs'),'export const value=1000;');
    await writeApplication(source);
    /** @param {string} root @param {number} fallback */
    async function conditionalPackage(root,fallback) {
      const pkg=path.join(root,'node_modules',packageName);
      await atomicWrite(path.join(pkg,'package.json'),JSON.stringify({
        type:'module',
        exports:{'.':{'node-addons':'./native-scope/native.mjs',default:'./fallback.mjs'}}
      }));
      await atomicWrite(path.join(pkg,'fallback.mjs'),
        'export const value='+String(fallback)+';');
      await fs.symlink(shared,path.join(pkg,'native-scope'),
        process.platform==='win32'?'junction':'dir');
    }
    await conditionalPackage(path.join(temp,'source'),103);
    await conditionalPackage(path.join(temp,'output'),107);
    await conditionalPackage(path.join(temp,'guarded'),107);
    await main('sno',['--root',source,'--entry','entry.cjs',
      '--out',output,'--seed','sno-no-addons-conditional-control']);

    /** @param {string} file */
    const runNative=file=>{
      const child=spawnSync(process.execPath,['--no-addons','-e',
        'process.stdout.write(String(require(process.argv[1])))',file],{
          encoding:'utf8',timeout:15000,env:{...process.env,NODE_OPTIONS:''}
        });
      if(child.error)throw child.error;
      assert.equal(child.status,0,child.stderr);
      return Number(child.stdout);
    };
    assert.equal(runNative(path.join(source,'entry.cjs')),116);
    assert.equal(runNative(path.join(output,'sno-entry.cjs')),120);
    const args=['--root',source,'--entry','entry.cjs','--out',guarded,
      '--seed','sno-no-addons-conditional-control','--audit-bare-esm'];
    const script=[
      'const {main}=require('+JSON.stringify(require.resolve('../src/cli'))+');',
      'main("sno",'+JSON.stringify(args)+').then(',
      '()=>{process.stderr.write("audit admitted changed dependency");process.exitCode=71;},',
      'error=>{if(!/does not model custom loaders/u.test(String(error.message))){',
      'process.stderr.write(String(error.stack||error));process.exitCode=72;',
      '}else process.stdout.write("refused");});'
    ].join('\n');
    for(const {description,flags,options} of [
      {description:'direct argv',flags:['--no-addons'],options:''},
      {description:'inherited NODE_OPTIONS',flags:[],options:'--no-addons'}
    ]) {
      const child=spawnSync(process.execPath,[...flags,'-e',script],{
        encoding:'utf8',timeout:30000,env:{...process.env,NODE_OPTIONS:options}
      });
      if(child.error)throw child.error;
      assert.equal(child.status,0,description+': '+child.stderr);
      assert.equal(child.stdout,'refused',description);
    }
    await assert.rejects(fs.stat(path.join(guarded,'sno-entry.cjs')),{code:'ENOENT'});
  });
});

test('ESM audit rejects short -C conditions in direct argv and inherited NODE_OPTIONS',()=>{
  // The resolver helper is a child process: it inherits NODE_OPTIONS but not
  // the compiler's process.execArgv. Both forms must be refused explicitly.
  const script=[
    'const audit=require('+JSON.stringify(require.resolve('../src/sno-bare-audit'))+');',
    'const files=[{path:"engine.mjs",sourceType:"module",'+
      'code:"import \u0027sno-esm-resolution-probe\u0027;"}];',
    'audit.assertSnoDirectBareImportParity(files,files,"/missing/source","/missing/output")',
    '.then(()=>{process.stderr.write("audit unexpectedly admitted");process.exitCode=91;},',
    'error=>{if(!/does not model custom loaders/u.test(String(error.message))){',
    'process.stderr.write(String(error.stack||error));process.exitCode=92;',
    '}else process.stdout.write("refused");});'
  ].join('\n');
  for(const {label,args,options} of [
    {label:'process.execArgv',args:['-C','custom','-e',script],options:''},
    {label:'NODE_OPTIONS',args:['-e',script],options:'-C custom'}
  ]) {
    const child=spawnSync(process.execPath,args,{
      encoding:'utf8',timeout:15000,env:{...process.env,NODE_OPTIONS:options}
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,label+': '+child.stderr);
    assert.equal(child.stdout,'refused',label);
  }
});

test('ESM audit supports identical type-only package scopes for .js ESM modules',async()=>{
  await fixture(async temp=>{
    const root=path.join(temp,'project');
    const source=path.join(root,'source');
    const output=path.join(root,'output');
    await atomicWrite(path.join(source,'package.json'),JSON.stringify({type:'module'}));
    await atomicWrite(path.join(source,'engine.js'),
      "import {value} from '"+packageName+"';export default value+13;");
    await atomicWrite(path.join(source,'entry.cjs'),
      "module.exports=require('./engine.js').default;");
    await writePackage(root,103,401);
    assert.equal(execute(path.join(source,'entry.cjs')),116);
    await main('sno',['--root',source,'--entry','entry.cjs',
      '--out',output,'--seed','sno-esm-js-type-module-scope','--audit-bare-esm']);
    assert.equal(execute(path.join(output,'sno-entry.cjs')),116);
  });
});




test('ESM audit refuses case-variant package.json in resolved dependency',async()=>{
  await fixture(async temp=>{
    const root=path.join(temp,'project');
    const source=path.join(root,'source');
    const output=path.join(root,'output');
    await writeApplication(source);
    await atomicWrite(path.join(source,'engine.mjs'),
      "import value from '"+packageName+"';export default value+13;");
    const directory=path.join(root,'node_modules',packageName);
    await atomicWrite(path.join(directory,'Package.json'),JSON.stringify({
      type:'module',exports:{'.':{import:'./import.mjs'}}
    }));
    await atomicWrite(path.join(directory,'import.mjs'),'export default 103;');
    await atomicWrite(path.join(directory,'index.js'),'module.exports=103;');
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs',
        '--out',output,'--seed','sno-esm-case-variant-dependency','--audit-bare-esm']),
      /case-variant package.json dependency scope/u
    );
  });
});

test('ESM audit refuses case-variant package.json external ancestors',async()=>{
  await fixture(async temp=>{
    const project=path.join(temp,'project');
    const source=path.join(project,'source');
    const output=path.join(project,'output');
    await fs.mkdir(source,{recursive:true});
    await atomicWrite(path.join(project,'Package.json'),JSON.stringify({type:'module'}));
    /** @type {import('../src/core').SourceFile[]} */
    const files=[{
      path:'engine.mjs',sourceType:'module',
      code:"import value from 'sno-esm-resolution-probe';export default value;"
    }];
    await assert.rejects(
      assertSnoDirectBareImportParity(files,files,source,output),
      /case-variant package.json ancestor/u
    );
  });
});

test('ESM audit refuses case-variant package.json paths',async()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{
    path:'engine.js',sourceType:'module',
    code:"import value from 'sno-esm-resolution-probe';export default value;"
  },{
    path:'Package.json',sourceType:'asset',code:'{"type":"module"}'
  }];
  await assert.rejects(
    assertSnoDirectBareImportParity(files,files,'/not-created/source','/not-created/output'),
    /case-variant package.json path/u
  );
});

test('ESM audit refuses changed or unsupported emitted package scopes',async()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const source=[{
    path:'engine.mjs',sourceType:'module',
    code:"import value from 'sno-esm-resolution-probe';export default value;"
  },{
    path:'package.json',sourceType:'asset',code:'{"type":"module"}'
  }];
  /** @type {import('../src/core').SourceFile[]} */
  const changed=[source[0],{
    path:'package.json',sourceType:'asset',code:'{"type":"commonjs"}'
  }];
  await assert.rejects(
    assertSnoDirectBareImportParity(source,changed,'/not-created/source','/not-created/output'),
    /found changed package scope metadata/u
  );
  /** @type {import('../src/core').SourceFile[]} */
  const withImports=[source[0],{
    path:'package.json',sourceType:'asset',
    code:'{"type":"module","imports":{"#private":"./private.mjs"}}'
  }];
  await assert.rejects(
    assertSnoDirectBareImportParity(withImports,withImports,'/not-created/source','/not-created/output'),
    /cannot model package imports\/self-reference/u
  );
  /** @type {import('../src/core').SourceFile[]} */
  const outputOnly=[source[0],{
    path:'package.json',sourceType:'asset',code:'{"type":"module"}'
  }];
  await assert.rejects(
    assertSnoDirectBareImportParity([source[0]],outputOnly,'/not-created/source','/not-created/output'),
    /cannot model changed package scope/u
  );
});
test('ESM audit flag is restricted to SNO',async()=>{
  await fixture(async temp=>{
    const source=path.join(temp,'source');
    await atomicWrite(path.join(source,'entry.mjs'),'export default 7;');
    await assert.rejects(main('coo',[
      '--root',source,'--entry','entry.mjs','--audit-bare-esm'
    ]),/--audit-bare-esm is SNO-only/u);
  });
});
