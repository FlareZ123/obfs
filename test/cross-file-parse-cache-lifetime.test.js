'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  collectVerifiedImportedStrings,renameCrossFileProperties
}=require('../src/cross-properties');

test('standalone imported-string collectors recompute after input source mutation',()=>{
  const files=[
    {path:'origin.mjs',sourceType:/** @type {const} */('module'),
      code:'export const key="secretField";'},
    {path:'consumer.mjs',sourceType:/** @type {const} */('module'),
      code:'import {key as selected} from "./origin.mjs";console.log(selected);'}
  ];
  const first=collectVerifiedImportedStrings(files);
  assert.equal(first.get('consumer.mjs')?.get('selected'),'secretField');
  files[0].code='export const key="otherField";';
  const second=collectVerifiedImportedStrings(files);
  assert.equal(second.get('consumer.mjs')?.get('selected'),'otherField');
  assert.equal(first.get('consumer.mjs')?.get('selected'),'secretField',
    'Fresh proof must not mutate previously returned independent maps');
});

test('separate rename invocations cannot reuse stale parsed module objects',()=>{
  const files=[
    {path:'owner.mjs',sourceType:/** @type {const} */('module'),
      code:'export const state={secretField:23};' +
        'export function peek(x){return x.secretField;}'},
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),
      code:'import {state,peek} from "./owner.mjs";console.log(peek(state));'}
  ];
  const first=renameCrossFileProperties(files,'cache-lifetime-seed');
  assert.equal(first.properties,1);
  files[0].code='export const state={otherField:23};' +
    'export function peek(x){return x.otherField;}';
  const second=renameCrossFileProperties(files,'cache-lifetime-seed');
  assert.equal(second.properties,1);
  assert.notEqual(second.files[0].code,first.files[0].code);
  assert.ok(second.files[0].code.includes('_p'));
  assert.equal(files[0].code.includes('otherField'),true,
    'Original input must remain readable and unmodified');
});
