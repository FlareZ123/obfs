'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');

/**
 * Compare an immutable prepatch lexer to the revised parser. A negative
 * compatibility control is useful only if the old code really refuses it.
 * Also require both compilers to reject real nested stylesheet imports.
 *
 * @param {string} beforeRoot
 * @param {string} afterRoot
 * @returns {{oldFalseRefusals:number,newAccepted:number,realImportRefusals:number,unchangedSafeFiles:number}}
 */
function compare(beforeRoot,afterRoot) {
  const oldCompiler=require(path.resolve(beforeRoot,'src'));
  const newCompiler=require(path.resolve(afterRoot,'src'));
  const oldAudit=require(path.resolve(beforeRoot,'src/css-data-imports')).hasCssDataImport;
  const newAudit=require(path.resolve(afterRoot,'src/css-data-imports')).hasCssDataImport;
  const entry={path:'entry.mjs',sourceType:'module',code:'export const answer=41+1;'};
  const inertCss='.widget{--payload: @import url(data:text/css,canary);color:var(--payload)}';
  const genuineCss='@import url("data:text/css,canary");';
  assert.equal(oldAudit(inertCss),true);
  assert.equal(newAudit(inertCss),false);
  assert.equal(oldAudit(genuineCss),true);
  assert.equal(newAudit(genuineCss),true);
  const wrap=[
    {path:'style.css',code:inertCss},
    {path:'index.html',code:'<!doctype html><style>'+inertCss+'</style>'},
    {path:'icon.svg',code:'<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA['+inertCss+']]></style></svg>'}
  ];
  let oldFalseRefusals=0,newAccepted=0,realImportRefusals=0,unchangedSafeFiles=0;
  for(const mode of ['coo','sno','sco']){
    const options={mode,seed:'rule-context-20261118',strings:false};
    for(const asset of wrap){
      const file={path:asset.path,sourceType:'asset',code:Buffer.from(asset.code)};
      assert.throws(()=>oldCompiler.obfuscateFiles([entry,file],options),
        /(?:data import|embedded stylesheet data import)/iu);
      oldFalseRefusals++;
      const compiled=newCompiler.obfuscateFiles([entry,file],options);
      assert.deepEqual(compiled.files.find(x=>x.path===file.path)?.code,file.code);
      newAccepted++;
    }
    const active={path:'import.css',sourceType:'asset',code:Buffer.from(genuineCss)};
    for(const compiler of [oldCompiler,newCompiler]){
      assert.throws(()=>compiler.obfuscateFiles([entry,active],options),
        /CSS data import would publish unaudited nested stylesheet/u);
      realImportRefusals++;
    }
    const safe={path:'safe.css',sourceType:'asset',
      code:Buffer.from('@import "./theme.css";.ok{background:url(data:image/png;base64,AAAA)}')};
    const baseline=oldCompiler.obfuscateFiles([entry,safe],options);
    const candidate=newCompiler.obfuscateFiles([entry,safe],options);
    for(const f of baseline.files){
      assert.deepEqual(candidate.files.find(x=>x.path===f.path)?.code,f.code);
      unchangedSafeFiles++;
    }
  }
  for(const asset of wrap){
    const specimen={path:asset.path,sourceType:'asset',code:Buffer.from(asset.code)};
    assert.throws(()=>oldCompiler.createScoHandler([specimen]),
      /(?:data import|embedded stylesheet data import)/iu);
    assert.equal(typeof newCompiler.createScoHandler([specimen]),'function');
  }
  return {oldFalseRefusals,newAccepted,realImportRefusals,unchangedSafeFiles};
}

if(require.main===module){
  const before=process.argv[2],after=process.argv[3];
  if(!before||!after)throw new TypeError('Expected original and candidate checkout roots');
  process.stdout.write(JSON.stringify(compare(before,after),null,2)+'\n');
}
module.exports={compare};
