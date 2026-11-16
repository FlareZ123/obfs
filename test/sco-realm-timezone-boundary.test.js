'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @param {string} privateBody
 * @returns {string}
 */
function moduleSource(privateBody){
  return 'export async function protectedOp(){'+privateBody+'}\n'+
    'export function visible(){return 7;}\n';
}

/** @param {string} privateBody */
function partition(privateBody){
  return partitionScoSelectedAsyncExports(
    {path:'time-zone.mjs',code:moduleSource(privateBody),sourceType:'module'},
    {seed:'sco-time-zone-20261116',privateNames:['protectedOp']});
}

test('Node timezone changes distinguish original client and relocated server observations',()=>{
  const originalZone=process.env.TZ;
  /** @param {string} zone */
  function snapshot(zone){
    process.env.TZ=zone;
    return {
      localDate:new Date(2020,0,1).toISOString(),
      localHour:new Date(0).getHours(),
      formatter:new Intl.DateTimeFormat('en-US').resolvedOptions().timeZone,
      stableUTC:new Date(0).getUTCFullYear(),
      pinnedIso:new Date('2020-01-01T00:00:00.000Z').toISOString()
    };
  }
  try{
    const browser=snapshot('Etc/UTC');
    const server=snapshot('Pacific/Honolulu');
    assert.notEqual(browser.localDate,server.localDate);
    assert.notEqual(browser.localHour,server.localHour);
    assert.notEqual(browser.formatter,server.formatter);
    assert.equal(browser.stableUTC,server.stableUTC);
    assert.equal(browser.pinnedIso,server.pinnedIso);
  }finally{
    if(originalZone===undefined)delete process.env.TZ;
    else process.env.TZ=originalZone;
  }
});

test('SCO refuses private calls that silently inherit the destination timezone or locale',()=>{
  const cases=[
    'return new Date(2020,0,1).toISOString();',
    'return new Date().toISOString();',
    'return Date();',
    'return Date.now();',
    "return Date.parse('2020-01-01T00:00');",
    'const Clock=Date;return new Clock(2020,0,1).toISOString();',
    'return new globalThis.Date(2020,0,1).toISOString();',
    "return Intl.DateTimeFormat('en-US').resolvedOptions().timeZone;",
    "return new Intl.DateTimeFormat('en-US').resolvedOptions().timeZone;",
    "const N=Intl;return new N.DateTimeFormat('en-US').resolvedOptions().timeZone;",
    'return Intl.NumberFormat().resolvedOptions().locale;',
    'return new Date(0).getHours();',
    'const stamp=new Date(0);return stamp.getTimezoneOffset();',
    "const stamp=new Date(0);return stamp.toLocaleDateString('en-US');",
    "const F=Intl.DateTimeFormat;return new F('en-US').resolvedOptions().timeZone;",
    "return new globalThis.Intl.DateTimeFormat('en-US').resolvedOptions().timeZone;",
    "const first=new Date(0);const second=first;return second['get'+'Hours']();",
    "return new Date(Date.UTC(2020,0,1)).getHours();",
    'return new Date(0);',
    "function localHour(d){return d.getHours();}const stamp=new Date(0);return localHour(stamp);",
    'const stamp=new Date(0);return {date:stamp};',
    'return new Date(0).getHours.call(new Date(0));',
    'return new Date(0).toString();',
    "return new Date('2020-01-01T00:00').toISOString();"
  ];
  for(const body of cases){
    assert.throws(()=>partition(body),/realm-local.*configuration|configuration.*realm-local/i,body);
  }
});

test('SCO retains local-time operations when the function remains on the client',()=>{
  const code='export async function protectedOp(){return 7;}\n'+
    'export function visible(){return new Date(2020,0,1).toISOString()+"/"+'+
    'Intl.DateTimeFormat("en-US").resolvedOptions().timeZone;}\n';
  const result=partitionScoSelectedAsyncExports(
    {path:'client-clock.mjs',code,sourceType:'module'},
    {seed:'client-clock-preserved',privateNames:['protectedOp']});
  assert.match(result.clientFile.code,/new Date\(2020,0,1\)/);
  assert.match(result.clientFile.code,/Intl.DateTimeFormat/);
});

test('SCO retains UTC-only time arithmetic and timezone-independent calls',()=>{
  for(const body of [
    'return new Date(0).getUTCFullYear();',
    'return Date.UTC(2020,0,1);',
    "return new Date('2020-01-01T00:00:00.000Z').toISOString();",
    "return Date.parse('2020-01-01T00:00:00.000Z');",
    'return new Date(0).getTime();',
    'return new Date(0).toISOString();',
    'const stamp=new Date(0);return stamp.getUTCFullYear();',
    'const stamp=new Date(0);const same=stamp;return same.getTime();',
    'return (7+3)*2;'
  ]){
    const result=partition(body);
    assert.equal(result.privateNames[0],'protectedOp',body);
    assert.ok(!result.clientFile.code.includes(body),body);
  }
});
