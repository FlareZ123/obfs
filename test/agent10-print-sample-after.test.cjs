'use strict';
// @ts-nocheck
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {obfuscateFiles}=require('../src');
for(const [label,dir,file,seed] of [
  ['OWNED','owned-constant-key','before.cjs','owned-constant-key-sample'],
  ['PRIMITIVE','primitive-coercer','before.cjs','primitive-coercer-proof-sample']
]) {
  const source=readFileSync(join(__dirname,'..','examples',dir,file),'utf8');
  const output=obfuscateFiles([{path:dir+'.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed,strings:false,identifiers:false
  }).files[0];
  process.stdout.write('COMPILED_'+label+'_BEGIN\n'+JSON.stringify(output.code)+'\nCOMPILED_'+label+'_END\n');
}
throw new Error('intentional output capture');
