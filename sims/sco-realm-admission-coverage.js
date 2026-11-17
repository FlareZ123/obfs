'use strict';

const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Independent small semantic-control corpus for the *admission rate* of the
 * selective-SCO source partition. Safe labels are manual judgments for the
 * indicated JSON-return workload, never a whole-program equivalence proof.
 *
 * @typedef {{label:string,kind:'safe-control'|'unsafe-witness',
 *   privateBody:string,publicBody?:string}} AdmissionCase
 */

/** @type {AdmissionCase[]} */
const cases=[
  {label:'pure arithmetic',kind:'safe-control',
    privateBody:'return (7+3)*2;'},
  {label:'local object field',kind:'safe-control',
    privateBody:'const x={value:7};return x.value;'},
  {label:'Object.keys own data',kind:'safe-control',
    privateBody:'return Object.keys({value:7}).length;'},
  {label:'Object.getOwnPropertyDescriptor own data',kind:'safe-control',
    privateBody:"return Object.getOwnPropertyDescriptor({value:7},'value').value;"},
  {label:'Object.getPrototypeOf own object',kind:'safe-control',
    privateBody:'const x={};return Object.getPrototypeOf(x)===Object.prototype;'},
  {label:'shadowed window local',kind:'safe-control',
    privateBody:'const window=7;return window;'},
  {label:'shadowed document local',kind:'safe-control',
    privateBody:'const document=7;return document;'},
  {label:'plain RegExp.test private',kind:'safe-control',
    privateBody:"return /x/.test('x');"},
  {label:'Math.PI read',kind:'safe-control',
    privateBody:'return Math.PI>3;'},
  {label:'Reflect.get own data',kind:'safe-control',
    privateBody:"return Reflect.get({value:7},'value');"},
  {label:'local prototype-labelled field',kind:'safe-control',
    privateBody:'const x={prototype:7};return x.prototype;'},
  {label:'local constructor equality',kind:'safe-control',
    privateBody:'const x={};return x.constructor===Object;'},
  {label:'Object.assign private local',kind:'safe-control',
    privateBody:'const x={};Object.assign(x,{value:7});return x.value;'},
  {label:'Object.defineProperty private local',kind:'safe-control',
    privateBody:"const x={};Object.defineProperty(x,'value',{value:7});return x.value;"},
  {label:'JSON.stringify private local',kind:'safe-control',
    privateBody:'return JSON.stringify({value:7});'},
  {label:'Number.isFinite',kind:'safe-control',
    privateBody:'return Number.isFinite(7);'},
  {label:'Date UTC year',kind:'safe-control',
    privateBody:'return new Date(0).getUTCFullYear();'},
  {label:'Date UTC static destructure',kind:'safe-control',
    privateBody:'const {UTC:utc}=Date;return utc(2020,0,1);'},
  {label:'defaulted immutable Math.PI destructure',kind:'safe-control',
    privateBody:'const {PI:pi=0}=Math;return pi>3;'},
  {label:'defaulted immutable Number maximum destructure',kind:'safe-control',
    privateBody:'const {MAX_SAFE_INTEGER:max=0}=Number;return max>0;'},
  {label:'stable native Error message',kind:'safe-control',
    privateBody:"return new Error('safe').message;"},
  {label:'plain local stack field',kind:'safe-control',
    privateBody:"const record={stack:'safe'};return record.stack;"},
  {label:'Date.parse explicit UTC',kind:'safe-control',
    privateBody:"return Date.parse('2020-01-01T00:00:00.000Z');"},
  {label:'Intl canonical locale tag',kind:'safe-control',
    privateBody:"return Intl.getCanonicalLocales('en-US')[0];"},
  {label:'local mutable counter',kind:'safe-control',
    privateBody:'const x={value:1};x.value++;return x.value;'},
  {label:'private prototype mutation',kind:'unsafe-witness',
    privateBody:'Object.prototype.__realm=41;return 1;',
    publicBody:'return ({}).__realm??0;'},
  {label:'private RegExp capture',kind:'unsafe-witness',
    privateBody:'return /(XY)(Z)/.test("XYZ");',
    publicBody:'return RegExp.$1;'},
  {label:'private Math static mutation',kind:'unsafe-witness',
    privateBody:'Math.__realm=41;return 1;',
    publicBody:'return Math.__realm??0;'},
  {label:'private Error static mutation',kind:'unsafe-witness',
    privateBody:'Error.stackTraceLimit=0;return 1;',
    publicBody:'return Error.stackTraceLimit;'},
  {label:'private window external bridge',kind:'unsafe-witness',
    privateBody:'return window.externalBridge.value;'},
  {label:'reflective constructor prototype mutation',kind:'unsafe-witness',
    privateBody:"Reflect.get(Object,'prototype').__realm=41;return 1;",
    publicBody:'return ({}).__realm??0;'},
  {label:'aliased native prototype mutation',kind:'unsafe-witness',
    privateBody:'const Native=Object;Native["proto"+"type"].__realm=41;return 1;',
    publicBody:'return ({}).__realm??0;'},
  {label:'destructured Intl.DateTimeFormat host timezone',kind:'unsafe-witness',
    privateBody:"const {DateTimeFormat:F}=Intl;return F('en-US').resolvedOptions().timeZone;"},
  {label:'bound Intl.DateTimeFormat host timezone',kind:'unsafe-witness',
    privateBody:"const F=Intl.DateTimeFormat;return F.bind(null)('en-US').resolvedOptions().timeZone;"},
  {label:'destructured Date.now host clock',kind:'unsafe-witness',
    privateBody:'const {now:tick}=Date;return tick();'},
  {label:'aliased Date.parse host timezone',kind:'unsafe-witness',
    privateBody:"const P=Date.parse;return P('2020-01-01T00:00');"},
  {label:'nested Intl method extraction',kind:'unsafe-witness',
    privateBody:"const {DateTimeFormat:{supportedLocalesOf:list}}=Intl;return list(['en-US']).length;"},
  {label:'native Error.stack direct execution origin',kind:'unsafe-witness',
    privateBody:"return new Error('trace').stack;"},
  {label:'native Error.stack direct local factory',kind:'unsafe-witness',
    privateBody:"function make(){return new Error('trace');}return make().stack;"},
  {label:'native Error.captureStackTrace',kind:'unsafe-witness',
    privateBody:"const target={};Error.captureStackTrace(target);return target.stack;"}
];

/**
 * @param {AdmissionCase} sample
 * @returns {{label:string,kind:AdmissionCase['kind'],admitted:boolean,reason:string}}
 */
function check(sample){
  const code='export async function protectedOp(){'+sample.privateBody+'}\n'+
    'export function visible(){'+(sample.publicBody??'return 7;')+'}\n';
  try{
    partitionScoSelectedAsyncExports(
      {path:'coverage.mjs',code,sourceType:'module'},
      {seed:'admission-coverage-v1',privateNames:['protectedOp']});
    return {label:sample.label,kind:sample.kind,admitted:true,reason:''};
  }catch(error){
    return {label:sample.label,kind:sample.kind,admitted:false,
      reason:error instanceof Error?error.message:String(error)};
  }
}

const details=cases.map(check);
const counts={safeControls:cases.filter(x=>x.kind==='safe-control').length,
  unsafeWitnesses:cases.filter(x=>x.kind==='unsafe-witness').length,
  safeAdmitted:details.filter(x=>x.kind==='safe-control'&&x.admitted).length,
  safeRefused:details.filter(x=>x.kind==='safe-control'&&!x.admitted).length,
  unsafeAdmitted:details.filter(x=>x.kind==='unsafe-witness'&&x.admitted).length,
  unsafeRefused:details.filter(x=>x.kind==='unsafe-witness'&&!x.admitted).length};
console.log(JSON.stringify({source:'sims/sco-realm-admission-coverage.js',
  scope:'Small reviewed semantic controls and explicit realm-mismatch witnesses',
  counts,details},null,2));
