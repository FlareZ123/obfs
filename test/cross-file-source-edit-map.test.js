'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {renameCrossFileProperties}=require('../src/cross-properties');
const {parserContractIdFor,mapSourceSpan,sourceGenerationOf}=require('../src/source-edit-map');

const PARSER=parserContractIdFor('module');

/** @param {string} unit @param {string} source @param {number} start @param {number} end */
function span(unit,source,start,end) {
  return {
    spanId:unit+':'+sourceGenerationOf(source,PARSER)+':'+start+':'+end,
    sourceUnitRef:unit,
    sourceGeneration:sourceGenerationOf(source,PARSER),
    startOffset:start,endOffset:end,
    coordinateUnit:'utf16-code-unit',
    astNodeType:'MemberExpression'
  };
}

test('cross-file property pass emits per-module maps and marks changed source spans unrelocatable',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:23}; export function peek(x){return x.secretField;}'},
    {path:'main.mjs',sourceType:'module',
      code:'import {state,peek} from "./state.mjs"; console.log(peek(state));'}
  ];
  const sourceUnits=new Map([
    ['state.mjs',{sourceUnitRef:'sno:state:module-instance-1',parserContractId:PARSER}],
    ['main.mjs',{sourceUnitRef:'sno:main:module-instance-1',parserContractId:PARSER}]
  ]);
  const result=renameCrossFileProperties(files,'cross-map-seed',{sourceUnits});
  assert.equal(result.objects,1);
  assert.equal(result.properties,1);
  assert.ok(result.editMaps instanceof Map);
  assert.equal(result.editMaps.size,2);

  const stateAfter=result.files.find(file=>file.path==='state.mjs');
  const mainAfter=result.files.find(file=>file.path==='main.mjs');
  assert.ok(stateAfter&&mainAfter);
  assert.ok(!stateAfter.code.includes('secretField'));
  assert.equal(mainAfter.code,files[1].code);

  const changedStart=files[0].code.indexOf('x.secretField');
  const changedSpan=span(sourceUnits.get('state.mjs').sourceUnitRef,files[0].code,
    changedStart,changedStart+'x.secretField'.length);
  assert.equal(mapSourceSpan(result.editMaps.get('state.mjs'),changedSpan,
    files[0].code,stateAfter.code),null,
    'a cross-file property edit inside a protected source span has no exact image');

  const unchangedStart=files[1].code.indexOf('console.log');
  const unchangedSpan=span(sourceUnits.get('main.mjs').sourceUnitRef,files[1].code,
    unchangedStart,files[1].code.length);
  const mapped=mapSourceSpan(result.editMaps.get('main.mjs'),unchangedSpan,
    files[1].code,mainAfter.code);
  assert.ok(mapped);
  assert.equal(mainAfter.code.slice(mapped.startOffset,mapped.endOffset),
    files[1].code.slice(unchangedStart));
});



test('cross-file closed-world pass declines a declared module with non-string source',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
    {path:'opaque.mjs',sourceType:'module',code:Buffer.from('export const hidden={secretField:1};')},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs"; console.log(state.secretField);'}
  ];
  const result=renameCrossFileProperties(files,'unparseable-module',{
    sourceUnits:new Map([
      ['state.mjs',{sourceUnitRef:'sno:state:1',parserContractId:PARSER}],
      ['main.mjs',{sourceUnitRef:'sno:main:1',parserContractId:PARSER}]
    ])
  });
  assert.equal(result.objects,0);
  assert.equal(result.properties,0);
  assert.equal(result.editMaps,undefined,
    'a partial module graph must not emit maps that imply closed-world coverage');
  assert.deepEqual(result.files,files);
});

test('cross-file map emission rejects duplicate module identities and wrong parser contracts',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs"; console.log(state.secretField);'}
  ];
  assert.throws(()=>renameCrossFileProperties(files,'duplicate-units',{
    sourceUnits:new Map([
      ['state.mjs',{sourceUnitRef:'same-runtime-instance',parserContractId:PARSER}],
      ['main.mjs',{sourceUnitRef:'same-runtime-instance',parserContractId:PARSER}]
    ])
  }),/SourceUnitRef must identify one module instance/);
  assert.throws(()=>renameCrossFileProperties(files,'wrong-parser',{
    sourceUnits:new Map([
      ['state.mjs',{sourceUnitRef:'sno:state:1',parserContractId:PARSER}],
      ['main.mjs',{sourceUnitRef:'sno:main:1',parserContractId:parserContractIdFor('script')}]
    ])
  }),/Parser contract mismatch/);
});

test('cross-file map emission refuses incomplete per-module source-unit contexts',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs"; console.log(state.secretField);'}
  ];
  assert.throws(()=>renameCrossFileProperties(files,'missing-unit',{
    sourceUnits:new Map([
      ['state.mjs',{sourceUnitRef:'sno:state:1',parserContractId:PARSER}]
    ])
  }),/Missing valid source-unit context for main\.mjs/);
});
