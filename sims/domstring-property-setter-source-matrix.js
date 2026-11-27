'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * @typedef {{name:string,setup:string,target:string,property:string,read?:string}} SetterCase
 */

/** @type {SetterCase[]} */
const cases=[
  {name:'Document.title',setup:'',target:'document',property:'title'},
  {name:'HTMLElement.id',setup:'const target=document.createElement("div");',target:'target',property:'id'},
  {name:'HTMLElement.title',setup:'const target=document.createElement("div");',target:'target',property:'title'},
  {name:'HTMLElement.lang',setup:'const target=document.createElement("div");',target:'target',property:'lang'},
  {name:'HTMLElement.slot',setup:'const target=document.createElement("div");',target:'target',property:'slot'},
  {name:'HTMLElement.className',setup:'const target=document.createElement("div");',target:'target',property:'className'},
  {name:'Node.textContent',setup:'const target=document.createElement("div");',target:'target',property:'textContent'},
  {name:'HTMLInputElement.value',setup:'const target=document.createElement("input");',target:'target',property:'value'},
  {name:'HTMLInputElement.placeholder',setup:'const target=document.createElement("input");',target:'target',property:'placeholder'},
  {name:'HTMLInputElement.name',setup:'const target=document.createElement("input");',target:'target',property:'name'},
  {name:'HTMLTextAreaElement.value',setup:'const target=document.createElement("textarea");',target:'target',property:'value'},
  {name:'HTMLImageElement.alt',setup:'const target=document.createElement("img");',target:'target',property:'alt'},
  {name:'HTMLIFrameElement.name',setup:'const target=document.createElement("iframe");',target:'target',property:'name'},
  {name:'HTMLScriptElement.text',setup:'const target=document.createElement("script");',target:'target',property:'text'},
  {name:'HTMLLabelElement.htmlFor',setup:'const target=document.createElement("label");',target:'target',property:'htmlFor'},
  {name:'HTMLAnchorElement.download',setup:'const target=document.createElement("a");',target:'target',property:'download'},
  {name:'HTMLButtonElement.name',setup:'const target=document.createElement("button");',target:'target',property:'name'},
  {name:'HTMLOptionElement.label',setup:'const target=document.createElement("option");',target:'target',property:'label'},
  {name:'HTMLOptionElement.value',setup:'const target=document.createElement("option");',target:'target',property:'value'},
  {name:'HTMLFormElement.name',setup:'const target=document.createElement("form");',target:'target',property:'name'},
  {name:'Element.innerHTML (TrustedHTML/DOMString)',setup:'const target=document.createElement("div");',target:'target',property:'innerHTML'},
  {name:'Element.outerHTML (TrustedHTML/DOMString)',setup:'const host=document.createElement("div");const target=document.createElement("span");host.appendChild(target);',target:'target',property:'outerHTML',read:'host.innerHTML'},
  {name:'Element.id via Document.getElementById',setup:'const seed=document.createElement("div");seed.id="dom-prop-getbyid";document.body.appendChild(seed);const target=document.getElementById("dom-prop-getbyid");',target:'target',property:'id'},
  {name:'Element.id via Document.querySelector',setup:'const seed=document.createElement("div");seed.id="dom-prop-query";document.body.appendChild(seed);const target=document.querySelector("#dom-prop-query");',target:'target',property:'id'},
  {name:'HTMLElement.id via document.body',setup:'',target:'document.body',property:'id'},
  {name:'Text.textContent via Document.createTextNode',setup:'const target=document.createTextNode("");',target:'target',property:'textContent'}
];
/** @typedef {{name:string,setup:string,assignment:string,read:string,positiveAssignment:string}} DispatchCase */

/** @type {DispatchCase[]} */
const dispatchCases=[
  {name:'computed literal key',setup:'const target=document.createElement("div");',
    assignment:'target["id"]=inspect;',read:'target.id',
    positiveAssignment:'target["id"]="literal";'},
  {name:'computed constant key',setup:'const target=document.createElement("div");const key="id";',
    assignment:'target[key]=inspect;',read:'target.id',
    positiveAssignment:'target[key]="literal";'},
  {name:'element alias',setup:'const target=document.createElement("div");const alias=target;',
    assignment:'alias.id=inspect;',read:'target.id',
    positiveAssignment:'alias.id="literal";'},
  {name:'Reflect.set',setup:'const target=document.createElement("div");',
    assignment:'Reflect.set(target,"id",inspect);',read:'target.id',
    positiveAssignment:'Reflect.set(target,"id","literal");'},
  {name:'Object.assign',setup:'const target=document.createElement("div");',
    assignment:'Object.assign(target,{id:inspect});',read:'target.id',
    positiveAssignment:'Object.assign(target,{id:"literal"});'},
  {name:'logical assignment',setup:'const target=document.createElement("div");',
    assignment:'target.id ||= inspect;',read:'target.id',
    positiveAssignment:'target.id ||= "literal";'},
  {name:'native descriptor setter call',setup:'const target=document.createElement("div");const setId=Object.getOwnPropertyDescriptor(Element.prototype,"id").set;',
    assignment:'setId.call(target,inspect);',read:'target.id',
    positiveAssignment:'setId.call(target,"literal");'},
  {name:'Reflect.apply native descriptor setter',setup:'const target=document.createElement("div");const setId=Object.getOwnPropertyDescriptor(Element.prototype,"id").set;',
    assignment:'Reflect.apply(setId,target,[inspect]);',read:'target.id',
    positiveAssignment:'Reflect.apply(setId,target,["literal"]);'},
  {name:'Proxy forwarding to native setter',setup:'const target=document.createElement("div");const proxy=new Proxy(target,{set(object,key,value){return Reflect.set(object,key,value,object);}});',
    assignment:'proxy.id=inspect;',read:'target.id',
    positiveAssignment:'proxy.id="literal";'}
];;

/** @typedef {DispatchCase & {supportKey:string}} HtmlApiCase */

/**
 * @param {string} name
 * @param {string} supportKey
 * @param {string} method
 * @returns {HtmlApiCase}
 */
function elementHtmlMethodCase(name,supportKey,method) {
  return {
    name,supportKey,
    setup:'const target=document.createElement("div");',
    assignment:'target.'+method+'(inspect);',
    read:'target.innerHTML',
    positiveAssignment:'target.'+method+'("literal");'
  };
}

/**
 * @param {string} name
 * @param {string} supportKey
 * @param {string} method
 * @returns {HtmlApiCase}
 */
function elementStreamMethodCase(name,supportKey,method) {
  return {
    name,supportKey,
    setup:'const target=document.createElement("div");',
    assignment:'const stream=target.'+method+'();const writer=stream.getWriter();await writer.write(inspect);await writer.close();',
    read:'target.innerHTML',
    positiveAssignment:'const stream=target.'+method+'();const writer=stream.getWriter();await writer.write("literal");await writer.close();'
  };
}

/**
 * @param {string} name
 * @param {string} supportKey
 * @param {string} method
 * @returns {HtmlApiCase}
 */
function nodeHtmlMethodCase(name,supportKey,method) {
  return {
    name,supportKey,
    setup:'const host=document.createElement("div");const target=document.createElement("span");host.appendChild(target);',
    assignment:'target.'+method+'(inspect);',
    read:'host.textContent',
    positiveAssignment:'target.'+method+'("literal");'
  };
}

/**
 * @param {string} name
 * @param {string} supportKey
 * @param {string} method
 * @returns {HtmlApiCase}
 */
function nodeStreamMethodCase(name,supportKey,method) {
  return {
    name,supportKey,
    setup:'const host=document.createElement("div");const target=document.createElement("span");host.appendChild(target);',
    assignment:'const stream=target.'+method+'();const writer=stream.getWriter();await writer.write(inspect);await writer.close();',
    read:'host.textContent',
    positiveAssignment:'const stream=target.'+method+'();const writer=stream.getWriter();await writer.write("literal");await writer.close();'
  };
}

/** @type {HtmlApiCase[]} */
const htmlApiCases=[
  elementHtmlMethodCase('Element.setHTML','setHTML','setHTML'),
  elementHtmlMethodCase('Element.appendHTML','appendHTML','appendHTML'),
  elementHtmlMethodCase('Element.prependHTML','prependHTML','prependHTML'),
  elementHtmlMethodCase('Element.setHTMLUnsafe','setHTMLUnsafe','setHTMLUnsafe'),
  elementHtmlMethodCase('Element.appendHTMLUnsafe','appendHTMLUnsafe','appendHTMLUnsafe'),
  elementHtmlMethodCase('Element.prependHTMLUnsafe','prependHTMLUnsafe','prependHTMLUnsafe'),
  nodeHtmlMethodCase('Element.beforeHTML','beforeHTML','beforeHTML'),
  nodeHtmlMethodCase('Element.afterHTML','afterHTML','afterHTML'),
  nodeHtmlMethodCase('Element.replaceWithHTML','replaceWithHTML','replaceWithHTML'),
  {
    name:'Document.parseHTML',supportKey:'documentParseHTML',setup:'',
    assignment:'const parsed=Document.parseHTML(inspect);',
    read:'parsed.body.textContent',
    positiveAssignment:'const parsed=Document.parseHTML("literal");'
  },
  {
    name:'Document.parseHTMLUnsafe',supportKey:'documentParseHTMLUnsafe',setup:'',
    assignment:'const parsed=Document.parseHTMLUnsafe(inspect);',
    read:'parsed.body.textContent',
    positiveAssignment:'const parsed=Document.parseHTMLUnsafe("literal");'
  },
  {
    name:'DOMParser.parseFromString',supportKey:'domParserParseFromString',
    setup:'const parser=new DOMParser();',
    assignment:'const parsed=parser.parseFromString(inspect,"text/html");',
    read:'parsed.body.textContent',
    positiveAssignment:'const parsed=parser.parseFromString("literal","text/html");'
  },
  {
    name:'Range.createContextualFragment',supportKey:'rangeCreateContextualFragment',
    setup:'const target=document.createElement("div");const range=document.createRange();range.selectNodeContents(target);',
    assignment:'const fragment=range.createContextualFragment(inspect);target.appendChild(fragment);',
    read:'target.innerHTML',
    positiveAssignment:'const fragment=range.createContextualFragment("literal");target.appendChild(fragment);'
  },
  elementStreamMethodCase('Element.streamHTML','streamHTML','streamHTML'),
  {
    name:'Element.streamHTML via bound writer.write',supportKey:'streamHTML',
    setup:'const target=document.createElement("div");',
    assignment:'const stream=target.streamHTML();const writer=stream.getWriter();const write=writer.write.bind(writer);await write(inspect);await writer.close();',
    read:'target.innerHTML',
    positiveAssignment:'const stream=target.streamHTML();const writer=stream.getWriter();const write=writer.write.bind(writer);await write("literal");await writer.close();'
  },
  {
    name:'Element.streamHTML via writer.write.call',supportKey:'streamHTML',
    setup:'const target=document.createElement("div");',
    assignment:'const stream=target.streamHTML();const writer=stream.getWriter();await writer.write.call(writer,inspect);await writer.close();',
    read:'target.innerHTML',
    positiveAssignment:'const stream=target.streamHTML();const writer=stream.getWriter();await writer.write.call(writer,"literal");await writer.close();'
  },
  {
    name:'Element.streamHTML via ReadableStream.pipeTo',supportKey:'streamHTML',
    setup:'const target=document.createElement("div");',
    assignment:'const stream=target.streamHTML();const readable=new ReadableStream({start(controller){controller.enqueue(inspect);controller.close();}});await readable.pipeTo(stream);',
    read:'target.innerHTML',
    positiveAssignment:'const stream=target.streamHTML();const readable=new ReadableStream({start(controller){controller.enqueue("literal");controller.close();}});await readable.pipeTo(stream);'
  },
  elementStreamMethodCase('Element.streamAppendHTML','streamAppendHTML','streamAppendHTML'),
  elementStreamMethodCase('Element.streamPrependHTML','streamPrependHTML','streamPrependHTML'),
  elementStreamMethodCase('Element.streamHTMLUnsafe','streamHTMLUnsafe','streamHTMLUnsafe'),
  elementStreamMethodCase('Element.streamAppendHTMLUnsafe','streamAppendHTMLUnsafe','streamAppendHTMLUnsafe'),
  elementStreamMethodCase('Element.streamPrependHTMLUnsafe','streamPrependHTMLUnsafe','streamPrependHTMLUnsafe'),
  nodeStreamMethodCase('Element.streamBeforeHTML','streamBeforeHTML','streamBeforeHTML'),
  nodeStreamMethodCase('Element.streamAfterHTML','streamAfterHTML','streamAfterHTML'),
  nodeStreamMethodCase('Element.streamReplaceWithHTML','streamReplaceWithHTML','streamReplaceWithHTML'),
  nodeStreamMethodCase('Element.streamBeforeHTMLUnsafe','streamBeforeHTMLUnsafe','streamBeforeHTMLUnsafe'),
  nodeStreamMethodCase('Element.streamAfterHTMLUnsafe','streamAfterHTMLUnsafe','streamAfterHTMLUnsafe'),
  nodeStreamMethodCase('Element.streamReplaceWithHTMLUnsafe','streamReplaceWithHTMLUnsafe','streamReplaceWithHTMLUnsafe')
];;

/** @type {DispatchCase[]} */
const legacyDocumentCases=[
  {
    name:'Document.write via iframe contentDocument',
    setup:'const frame=document.createElement("iframe");document.body.appendChild(frame);const doc=frame.contentDocument;',
    assignment:'doc.open();doc.write(inspect);doc.close();',
    read:'doc.body.textContent',
    positiveAssignment:'doc.open();doc.write("literal");doc.close();'
  },
  {
    name:'Document.writeln via iframe contentDocument',
    setup:'const frame=document.createElement("iframe");document.body.appendChild(frame);const doc=frame.contentDocument;',
    assignment:'doc.open();doc.writeln(inspect);doc.close();',
    read:'doc.body.textContent.replace(/\\n$/, "")',
    positiveAssignment:'doc.open();doc.writeln("literal");doc.close();'
  }
];

/**
 * @param {DispatchCase} item
 * @param {boolean} primitive
 * @returns {string}
 */
function sourceForDispatchCase(item,primitive) {
  const lines=[];
  if(primitive) {
    lines.push('const independent={independentSecret:73};');
    lines.push(item.setup);
    lines.push(item.positiveAssignment);
    lines.push('export const observed={source:'+item.read+
      ',independent:independent.independentSecret};');
  } else {
    lines.push('const observedOwner={secretField:57};');
    lines.push('function inspect(){return observedOwner.secretField;}');
    lines.push('const independent={independentSecret:73};');
    lines.push(item.setup);
    lines.push(item.assignment);
    lines.push('export const observed={source:'+item.read+
      ',value:inspect(),independent:independent.independentSecret};');
  }
  return lines.join('\n');
}

/**
 * @param {SetterCase} item
 * @param {boolean} primitive
 * @returns {string}
 */
function sourceForCase(item,primitive) {
  const lines=[];
  const read=item.read??item.target+'.'+item.property;
  if(primitive) {
    lines.push('const independent={independentSecret:73};');
    if(item.setup)lines.push(item.setup);
    lines.push(item.target+'.'+item.property+'="literal";');
    lines.push('export const observed={source:'+read+
      ',independent:independent.independentSecret};');
  } else {
    lines.push('const observedOwner={secretField:57};');
    lines.push('function inspect(){return observedOwner.secretField;}');
    lines.push('const independent={independentSecret:73};');
    if(item.setup)lines.push(item.setup);
    lines.push(item.target+'.'+item.property+'=inspect;');
    lines.push('export const observed={source:'+read+
      ',value:inspect(),independent:independent.independentSecret};');
  }
  return lines.join('\n');
}
/**
 * @param {string} code
 * @param {string} seed
 * @returns {{code:string,properties:number}}
 */
function compile(code,seed) {
  const result=obfuscateFiles([{path:'case.mjs',sourceType:'module',code}],{
    mode:'coo',seed,closedWorld:true,
    properties:true,identifiers:true,strings:false
  });
  const file=result.files[0];
  return {code:/** @type {string} */(file.code),
    properties:file.metrics.properties};
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const bodies=new Map();
  /** @type {{name:string,native:string,compiled:string,positiveNative:string,positiveCompiled:string,negativeProperties:number,positiveProperties:number}[]} */
  const pairs=[];
  for(let index=0;index<cases.length;index++) {
    const item=cases[index];
    const negative=sourceForCase(item,false);
    const negativeOutput=compile(negative,'domstring-property-negative-'+index);
    const positive=sourceForCase(item,true);
    const positiveOutput=compile(positive,'domstring-property-positive-'+index);
    const pair={
      name:item.name,
      native:'/native-negative-'+index+'.mjs',
      compiled:'/compiled-negative-'+index+'.mjs',
      positiveNative:'/native-positive-'+index+'.mjs',
      positiveCompiled:'/compiled-positive-'+index+'.mjs',
      negativeProperties:negativeOutput.properties,
      positiveProperties:positiveOutput.properties
    };
    pairs.push(pair);
    bodies.set(pair.native,negative);
    bodies.set(pair.compiled,negativeOutput.code);
    bodies.set(pair.positiveNative,positive);
    bodies.set(pair.positiveCompiled,positiveOutput.code);
  }

  const userlandSource=[
    'const observedOwner={secretField:57};',
    'function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'const userland={id:null};',
    'userland.id=inspect;',
    'export const observed={value:userland.id(),independent:independent.independentSecret};'
  ].join('\n');
  const userlandOutput=compile(userlandSource,'domstring-property-userland-id-positive');
  bodies.set('/userland-native.mjs',userlandSource);
  bodies.set('/userland-compiled.mjs',userlandOutput.code);

  /** @type {{name:string,native:string,compiled:string,positiveNative:string,positiveCompiled:string,negativeProperties:number,positiveProperties:number}[]} */
  const dispatchPairs=[];
  for(let index=0;index<dispatchCases.length;index++) {
    const item=dispatchCases[index];
    const negative=sourceForDispatchCase(item,false);
    const negativeOutput=compile(negative,'domstring-dispatch-negative-'+index);
    const positive=sourceForDispatchCase(item,true);
    const positiveOutput=compile(positive,'domstring-dispatch-positive-'+index);
    const pair={
      name:item.name,
      native:'/dispatch-native-negative-'+index+'.mjs',
      compiled:'/dispatch-compiled-negative-'+index+'.mjs',
      positiveNative:'/dispatch-native-positive-'+index+'.mjs',
      positiveCompiled:'/dispatch-compiled-positive-'+index+'.mjs',
      negativeProperties:negativeOutput.properties,
      positiveProperties:positiveOutput.properties
    };
    dispatchPairs.push(pair);
    bodies.set(pair.native,negative);
    bodies.set(pair.compiled,negativeOutput.code);
    bodies.set(pair.positiveNative,positive);
    bodies.set(pair.positiveCompiled,positiveOutput.code);
  }
  /** @type {{name:string,native:string,compiled:string,positiveNative:string,positiveCompiled:string,negativeProperties:number,positiveProperties:number}[]} */
  const legacyDocumentPairs=[];
  for(let index=0;index<legacyDocumentCases.length;index++) {
    const item=legacyDocumentCases[index];
    const negative=sourceForDispatchCase(item,false);
    const negativeOutput=compile(negative,'domstring-legacy-document-negative-'+index);
    const positive=sourceForDispatchCase(item,true);
    const positiveOutput=compile(positive,'domstring-legacy-document-positive-'+index);
    const pair={
      name:item.name,
      native:'/legacy-document-native-'+index+'.mjs',
      compiled:'/legacy-document-compiled-'+index+'.mjs',
      positiveNative:'/legacy-document-positive-native-'+index+'.mjs',
      positiveCompiled:'/legacy-document-positive-compiled-'+index+'.mjs',
      negativeProperties:negativeOutput.properties,
      positiveProperties:positiveOutput.properties
    };
    legacyDocumentPairs.push(pair);
    bodies.set(pair.native,negative);
    bodies.set(pair.compiled,negativeOutput.code);
    bodies.set(pair.positiveNative,positive);
    bodies.set(pair.positiveCompiled,positiveOutput.code);
  }

  /** @type {{name:string,supportKey:string,native:string,compiled:string,positiveNative:string,positiveCompiled:string,negativeProperties:number,positiveProperties:number}[]} */
  const htmlApiPairs=[];
  for(let index=0;index<htmlApiCases.length;index++) {
    const item=htmlApiCases[index];
    const negative=sourceForDispatchCase(item,false);
    const negativeOutput=compile(negative,'domstring-html-api-negative-'+index);
    const positive=sourceForDispatchCase(item,true);
    const positiveOutput=compile(positive,'domstring-html-api-positive-'+index);
    const pair={
      name:item.name,supportKey:item.supportKey,
      native:'/html-api-native-'+index+'.mjs',
      compiled:'/html-api-compiled-'+index+'.mjs',
      positiveNative:'/html-api-positive-native-'+index+'.mjs',
      positiveCompiled:'/html-api-positive-compiled-'+index+'.mjs',
      negativeProperties:negativeOutput.properties,
      positiveProperties:positiveOutput.properties
    };
    htmlApiPairs.push(pair);
    bodies.set(pair.native,negative);
    bodies.set(pair.compiled,negativeOutput.code);
    bodies.set(pair.positiveNative,positive);
    bodies.set(pair.positiveCompiled,positiveOutput.code);
  }

  const dataPropertySource=[
    'const observedOwner={secretField:57};',
    'function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'const target=document.createElement("div");',
    'Object.defineProperty(target,"id",{value:inspect,writable:true,configurable:true});',
    'export const observed={value:target.id(),independent:independent.independentSecret};'
  ].join('\n');
  const dataPropertyOutput=compile(dataPropertySource,'domstring-own-data-property-positive');
  bodies.set('/data-property-native.mjs',dataPropertySource);
  bodies.set('/data-property-compiled.mjs',dataPropertyOutput.code);

  const customAccessorSource=[
    'const observedOwner={secretField:57};',
    'function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'const target=document.createElement("div");',
    'Object.defineProperty(target,"id",{configurable:true,set(value){this._stored=value;}});',
    'target.id=inspect;',
    'export const observed={value:target._stored(),independent:independent.independentSecret};'
  ].join('\n');
  const customAccessorOutput=compile(customAccessorSource,'domstring-custom-accessor-positive');
  bodies.set('/custom-accessor-native.mjs',customAccessorSource);
  bodies.set('/custom-accessor-compiled.mjs',customAccessorOutput.code);

  const proxyStorageSource=[
    'const observedOwner={secretField:57};',
    'function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'const target=document.createElement("div");',
    'const proxy=new Proxy(target,{set(object,key,value){object._stored=value;return true;}});',
    'proxy.id=inspect;',
    'export const observed={value:target._stored(),independent:independent.independentSecret};'
  ].join('\n');
  const proxyStorageOutput=compile(proxyStorageSource,'domstring-proxy-storage-positive');
  bodies.set('/proxy-storage-native.mjs',proxyStorageSource);
  bodies.set('/proxy-storage-compiled.mjs',proxyStorageOutput.code);

  const proxyBrandCheckSource=[
    'const observedOwner={secretField:57};',
    'function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'const target=document.createElement("div");',
    'const proxy=new Proxy(target,{});',
    'let errorName=null;',
    'try{proxy.id=inspect;}catch(error){errorName=error.name;}',
    'export const observed={errorName,source:target.id,value:inspect(),independent:independent.independentSecret};'
  ].join('\n');
  const proxyBrandCheckOutput=compile(proxyBrandCheckSource,'domstring-proxy-brand-check-positive');
  bodies.set('/proxy-brand-native.mjs',proxyBrandCheckSource);
  bodies.set('/proxy-brand-compiled.mjs',proxyBrandCheckOutput.code);

  const htmlMethodSource=[
    'const observedOwner={secretField:57};',
    'function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'const target=document.createElement("div");',
    'target.insertAdjacentHTML("beforeend",inspect);',
    'export const observed={source:target.innerHTML,value:inspect(),independent:independent.independentSecret};'
  ].join('\n');
  const htmlMethodOutput=compile(htmlMethodSource,'domstring-insert-adjacent-html-negative');
  bodies.set('/html-method-native.mjs',htmlMethodSource);
  bodies.set('/html-method-compiled.mjs',htmlMethodOutput.code);
  const htmlMethodPositiveSource=[
    'const independent={independentSecret:73};',
    'const target=document.createElement("div");',
    'target.insertAdjacentHTML("beforeend","literal");',
    'export const observed={source:target.innerHTML,independent:independent.independentSecret};'
  ].join('\n');
  const htmlMethodPositiveOutput=compile(htmlMethodPositiveSource,'domstring-insert-adjacent-html-positive');
  bodies.set('/html-method-positive-native.mjs',htmlMethodPositiveSource);
  bodies.set('/html-method-positive-compiled.mjs',htmlMethodPositiveOutput.code);

  const negativeLogic=[
    'const observedOwner={secretField:57};',
    'export function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'export const independentValue=independent.independentSecret;'
  ].join('\n');
  const negativeObserver=[
    'import {inspect,independentValue} from "./logic.mjs";',
    'const target=document.createElement("div");',
    'target.id=inspect;',
    'export const observed={source:target.id,value:inspect(),independent:independentValue};'
  ].join('\n');
  const positiveLogic=[
    'const independent={independentSecret:73};',
    'export const independentValue=independent.independentSecret;'
  ].join('\n');
  const positiveObserver=[
    'import {independentValue} from "./logic.mjs";',
    'const target=document.createElement("div");',
    'target.id="literal";',
    'export const observed={source:target.id,independent:independentValue};'
  ].join('\n');
  const graphResult=obfuscateFiles([
    {path:'negative-logic.mjs',sourceType:'module',code:negativeLogic},
    {path:'negative-observer.mjs',sourceType:'module',code:negativeObserver},
    {path:'positive-logic.mjs',sourceType:'module',code:positiveLogic},
    {path:'positive-observer.mjs',sourceType:'module',code:positiveObserver}
  ],{
    mode:'coo',seed:'domstring-property-crossfile',closedWorld:true,
    properties:true,identifiers:true,strings:false
  });
  const negativeLogicOutput=graphResult.files.find(file=>file.path==='negative-logic.mjs');
  const negativeObserverOutput=graphResult.files.find(file=>file.path==='negative-observer.mjs');
  const positiveLogicOutput=graphResult.files.find(file=>file.path==='positive-logic.mjs');
  const positiveObserverOutput=graphResult.files.find(file=>file.path==='positive-observer.mjs');
  assert.ok(negativeLogicOutput&&negativeObserverOutput&&
    positiveLogicOutput&&positiveObserverOutput,'Cross-file compiler outputs are incomplete');
  const crossNegativeProperties=negativeLogicOutput.metrics.properties+
    negativeObserverOutput.metrics.properties;
  const crossPositiveProperties=positiveLogicOutput.metrics.properties+
    positiveObserverOutput.metrics.properties;
  bodies.set('/native-negative/logic.mjs',negativeLogic);
  bodies.set('/native-negative/observer.mjs',negativeObserver);
  bodies.set('/compiled-negative/logic.mjs',/** @type {string} */(negativeLogicOutput.code));
  bodies.set('/compiled-negative/observer.mjs',/** @type {string} */(negativeObserverOutput.code));
  bodies.set('/native-positive/logic.mjs',positiveLogic);
  bodies.set('/native-positive/observer.mjs',positiveObserver);
  bodies.set('/compiled-positive/logic.mjs',/** @type {string} */(positiveLogicOutput.code));
  bodies.set('/compiled-positive/observer.mjs',/** @type {string} */(positiveObserverOutput.code));


  const negativeStreamObserver=[
    'import {inspect,independentValue} from "./logic.mjs";',
    'const target=document.createElement("div");',
    'const stream=target.streamHTML();',
    'const writer=stream.getWriter();',
    'await writer.write(inspect);',
    'await writer.close();',
    'export const observed={source:target.innerHTML,value:inspect(),independent:independentValue};'
  ].join('\n');
  const positiveStreamObserver=[
    'import {independentValue} from "./logic.mjs";',
    'const target=document.createElement("div");',
    'const stream=target.streamHTML();',
    'const writer=stream.getWriter();',
    'await writer.write("literal");',
    'await writer.close();',
    'export const observed={source:target.innerHTML,independent:independentValue};'
  ].join('\n');
  const streamGraphResult=obfuscateFiles([
    {path:'negative-stream-logic.mjs',sourceType:'module',code:negativeLogic},
    {path:'negative-stream-observer.mjs',sourceType:'module',code:negativeStreamObserver},
    {path:'positive-stream-logic.mjs',sourceType:'module',code:positiveLogic},
    {path:'positive-stream-observer.mjs',sourceType:'module',code:positiveStreamObserver}
  ],{
    mode:'coo',seed:'domstring-property-crossfile-stream',closedWorld:true,
    properties:true,identifiers:true,strings:false
  });
  const negativeStreamLogicOutput=streamGraphResult.files.find(file=>file.path==='negative-stream-logic.mjs');
  const negativeStreamObserverOutput=streamGraphResult.files.find(file=>file.path==='negative-stream-observer.mjs');
  const positiveStreamLogicOutput=streamGraphResult.files.find(file=>file.path==='positive-stream-logic.mjs');
  const positiveStreamObserverOutput=streamGraphResult.files.find(file=>file.path==='positive-stream-observer.mjs');
  assert.ok(negativeStreamLogicOutput&&negativeStreamObserverOutput&&
    positiveStreamLogicOutput&&positiveStreamObserverOutput,'Cross-file stream compiler outputs are incomplete');
  const crossStreamNegativeProperties=negativeStreamLogicOutput.metrics.properties+
    negativeStreamObserverOutput.metrics.properties;
  const crossStreamPositiveProperties=positiveStreamLogicOutput.metrics.properties+
    positiveStreamObserverOutput.metrics.properties;
  bodies.set('/native-negative-stream/logic.mjs',negativeLogic);
  bodies.set('/native-negative-stream/observer.mjs',negativeStreamObserver);
  bodies.set('/compiled-negative-stream/logic.mjs',/** @type {string} */(negativeStreamLogicOutput.code));
  bodies.set('/compiled-negative-stream/observer.mjs',/** @type {string} */(negativeStreamObserverOutput.code));
  bodies.set('/native-positive-stream/logic.mjs',positiveLogic);
  bodies.set('/native-positive-stream/observer.mjs',positiveStreamObserver);
  bodies.set('/compiled-positive-stream/logic.mjs',/** @type {string} */(positiveStreamLogicOutput.code));
  bodies.set('/compiled-positive-stream/observer.mjs',/** @type {string} */(positiveStreamObserverOutput.code));

  const page=[    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">',
    'const pairs='+JSON.stringify(pairs)+';',
    'const dispatchPairs='+JSON.stringify(dispatchPairs)+';',
    'const htmlApiPairs='+JSON.stringify(htmlApiPairs)+';',
    'const legacyDocumentPairs='+JSON.stringify(legacyDocumentPairs)+';',
    'const htmlProbe=document.createElement("div");',
    'const nodeProbe=document.createTextNode("");',
    'const browserEnvironment={userAgent:navigator.userAgent,htmlApiSupport:{',
    ' setHTML:typeof htmlProbe.setHTML==="function",',
    ' appendHTML:typeof htmlProbe.appendHTML==="function",',
    ' prependHTML:typeof htmlProbe.prependHTML==="function",',
    ' setHTMLUnsafe:typeof htmlProbe.setHTMLUnsafe==="function",',
    ' appendHTMLUnsafe:typeof htmlProbe.appendHTMLUnsafe==="function",',
    ' prependHTMLUnsafe:typeof htmlProbe.prependHTMLUnsafe==="function",',
    ' beforeHTML:typeof nodeProbe.beforeHTML==="function",',
    ' afterHTML:typeof nodeProbe.afterHTML==="function",',
    ' replaceWithHTML:typeof nodeProbe.replaceWithHTML==="function",',
    ' documentParseHTML:typeof Document.parseHTML==="function",',
    ' documentParseHTMLUnsafe:typeof Document.parseHTMLUnsafe==="function",',
    ' domParserParseFromString:typeof DOMParser.prototype.parseFromString==="function",',
    ' rangeCreateContextualFragment:typeof document.createRange().createContextualFragment==="function",',
    ' streamHTML:typeof htmlProbe.streamHTML==="function",',
    ' streamAppendHTML:typeof htmlProbe.streamAppendHTML==="function",',
    ' streamPrependHTML:typeof htmlProbe.streamPrependHTML==="function",',
    ' streamHTMLUnsafe:typeof htmlProbe.streamHTMLUnsafe==="function",',
    ' streamAppendHTMLUnsafe:typeof htmlProbe.streamAppendHTMLUnsafe==="function",',
    ' streamPrependHTMLUnsafe:typeof htmlProbe.streamPrependHTMLUnsafe==="function",',
    ' streamBeforeHTML:typeof nodeProbe.streamBeforeHTML==="function",',
    ' streamAfterHTML:typeof nodeProbe.streamAfterHTML==="function",',
    ' streamReplaceWithHTML:typeof nodeProbe.streamReplaceWithHTML==="function",',
    ' streamBeforeHTMLUnsafe:typeof nodeProbe.streamBeforeHTMLUnsafe==="function",',
    ' streamAfterHTMLUnsafe:typeof nodeProbe.streamAfterHTMLUnsafe==="function",',
    ' streamReplaceWithHTMLUnsafe:typeof nodeProbe.streamReplaceWithHTMLUnsafe==="function",',
    ' documentWrite:typeof Document.prototype.write==="function",',
    ' documentWriteln:typeof Document.prototype.writeln==="function",',
    ' insertAdjacentHTML:typeof htmlProbe.insertAdjacentHTML==="function"',
    '}};',
    'try {',
    ' const rows=[];',
    ' for(const pair of pairs){',
    '  const [n,e,pn,pe]=await Promise.all([',
    '   import(pair.native),import(pair.compiled),',
    '   import(pair.positiveNative),import(pair.positiveCompiled)]);',
    '  const native=n.observed,emitted=e.observed,',
    '   positiveNative=pn.observed,positiveEmitted=pe.observed;',
    '  rows.push({name:pair.name,',
    '   nativeSourceValid:native.source.includes("observedOwner.secretField"),',
    '   sourceMismatch:native.source!==emitted.source,',
    '   nativeValue:native.value,emittedValue:emitted.value,',
    '   nativeIndependent:native.independent,emittedIndependent:emitted.independent,',
    '   numericParity:native.value===emitted.value&&native.value===57,',
    '   independentParity:native.independent===emitted.independent&&native.independent===73,',
    '   positiveParity:positiveNative.source==="literal"&&',
    '     JSON.stringify(positiveNative)===JSON.stringify(positiveEmitted),',
    '   negativeProperties:pair.negativeProperties,',
    '   positiveProperties:pair.positiveProperties});',
    ' }',
    ' const legacyDocumentRows=[];',
    ' for(const pair of legacyDocumentPairs){',
    '  const [n,e,pn,pe]=await Promise.all([',
    '   import(pair.native),import(pair.compiled),',
    '   import(pair.positiveNative),import(pair.positiveCompiled)]);',
    '  const native=n.observed,emitted=e.observed,',
    '   positiveNative=pn.observed,positiveEmitted=pe.observed;',
    '  legacyDocumentRows.push({name:pair.name,',
    '   nativeSourceValid:native.source.includes("observedOwner.secretField"),',
    '   sourceMismatch:native.source!==emitted.source,',
    '   numericParity:native.value===emitted.value&&native.value===57,',
    '   independentParity:native.independent===emitted.independent&&native.independent===73,',
    '   positiveParity:positiveNative.source==="literal"&&',
    '     JSON.stringify(positiveNative)===JSON.stringify(positiveEmitted),',
    '   negativeProperties:pair.negativeProperties,positiveProperties:pair.positiveProperties});',
    ' }',
    ' const htmlApiRows=[];',
    ' for(const pair of htmlApiPairs){',
    '  const supported=!!browserEnvironment.htmlApiSupport[pair.supportKey];',
    '  if(!supported){htmlApiRows.push({name:pair.name,supported:false});continue;}',
    '  const [n,e,pn,pe]=await Promise.all([',
    '   import(pair.native),import(pair.compiled),',
    '   import(pair.positiveNative),import(pair.positiveCompiled)]);',
    '  const native=n.observed,emitted=e.observed,',
    '   positiveNative=pn.observed,positiveEmitted=pe.observed;',
    '  htmlApiRows.push({name:pair.name,supported:true,',
    '   nativeSourceValid:native.source.includes("observedOwner.secretField"),',
    '   sourceMismatch:native.source!==emitted.source,',
    '   numericParity:native.value===emitted.value&&native.value===57,',
    '   independentParity:native.independent===emitted.independent&&native.independent===73,',
    '   positiveParity:positiveNative.source==="literal"&&',
    '     JSON.stringify(positiveNative)===JSON.stringify(positiveEmitted),',
    '   negativeProperties:pair.negativeProperties,positiveProperties:pair.positiveProperties});',
    ' }',
    ' const dispatchRows=[];',
    ' for(const pair of dispatchPairs){',
    '  const [n,e,pn,pe]=await Promise.all([',
    '   import(pair.native),import(pair.compiled),',
    '   import(pair.positiveNative),import(pair.positiveCompiled)]);',
    '  const native=n.observed,emitted=e.observed,',
    '   positiveNative=pn.observed,positiveEmitted=pe.observed;',
    '  dispatchRows.push({name:pair.name,',
    '   nativeSourceValid:native.source.includes("observedOwner.secretField"),',
    '   sourceMismatch:native.source!==emitted.source,',
    '   numericParity:native.value===emitted.value&&native.value===57,',
    '   independentParity:native.independent===emitted.independent&&native.independent===73,',
    '   positiveParity:positiveNative.source==="literal"&&',
    '     JSON.stringify(positiveNative)===JSON.stringify(positiveEmitted),',
    '   negativeProperties:pair.negativeProperties,positiveProperties:pair.positiveProperties});',
    ' }',
    ' const [un,ue]=await Promise.all([',
    '  import("/userland-native.mjs"),import("/userland-compiled.mjs")]);',
    ' const userland={native:un.observed,emitted:ue.observed,',
    '  parity:JSON.stringify(un.observed)===JSON.stringify(ue.observed)};',
    ' const [dn,de]=await Promise.all([',
    '  import("/data-property-native.mjs"),import("/data-property-compiled.mjs")]);',
    ' const dataPropertyControl={native:dn.observed,emitted:de.observed,',
    '  parity:JSON.stringify(dn.observed)===JSON.stringify(de.observed)};',
    ' const [an,ae]=await Promise.all([',
    '  import("/custom-accessor-native.mjs"),import("/custom-accessor-compiled.mjs")]);',
    ' const customAccessorControl={native:an.observed,emitted:ae.observed,',
    '  parity:JSON.stringify(an.observed)===JSON.stringify(ae.observed)};',
    ' const [psn,pse]=await Promise.all([',
    '  import("/proxy-storage-native.mjs"),import("/proxy-storage-compiled.mjs")]);',
    ' const proxyStorageControl={native:psn.observed,emitted:pse.observed,',
    '  parity:JSON.stringify(psn.observed)===JSON.stringify(pse.observed)};',
    ' const [pbn,pbe]=await Promise.all([',
    '  import("/proxy-brand-native.mjs"),import("/proxy-brand-compiled.mjs")]);',
    ' const proxyBrandCheckControl={native:pbn.observed,emitted:pbe.observed,',
    '  parity:JSON.stringify(pbn.observed)===JSON.stringify(pbe.observed)};',
    ' const [hmn,hme,hmpn,hmpe]=await Promise.all([',
    '  import("/html-method-native.mjs"),import("/html-method-compiled.mjs"),',
    '  import("/html-method-positive-native.mjs"),import("/html-method-positive-compiled.mjs")]);',
    ' const htmlMethodControl={native:hmn.observed,emitted:hme.observed,',
    '  sourceMismatch:hmn.observed.source!==hme.observed.source,',
    '  nativeSourceValid:hmn.observed.source.includes("observedOwner.secretField"),',
    '  numericParity:hmn.observed.value===hme.observed.value&&hmn.observed.value===57,',
    '  independentParity:hmn.observed.independent===hme.observed.independent&&',
    '    hmn.observed.independent===73,',
    '  positiveParity:hmpn.observed.source==="literal"&&',
    '    JSON.stringify(hmpn.observed)===JSON.stringify(hmpe.observed)};',
    ' const [cn,ce,pn,pe]=await Promise.all([',
    '  import("/native-negative/observer.mjs"),import("/compiled-negative/observer.mjs"),',
    '  import("/native-positive/observer.mjs"),import("/compiled-positive/observer.mjs")]);',
    ' const [csn,cse,cspn,cspe]=await Promise.all([',
    '  import("/native-negative-stream/observer.mjs"),import("/compiled-negative-stream/observer.mjs"),',
    '  import("/native-positive-stream/observer.mjs"),import("/compiled-positive-stream/observer.mjs")]);',
    ' const crossStream={native:csn.observed,emitted:cse.observed,',
    '  nativeSourceValid:csn.observed.source.includes("observedOwner.secretField"),',
    '  sourceMismatch:csn.observed.source!==cse.observed.source,',
    '  numericParity:csn.observed.value===cse.observed.value&&csn.observed.value===57,',
    '  independentParity:csn.observed.independent===cse.observed.independent&&csn.observed.independent===73,',
    '  positiveParity:cspn.observed.source==="literal"&&',
    '   JSON.stringify(cspn.observed)===JSON.stringify(cspe.observed)};',
    ' const crossFile={native:cn.observed,emitted:ce.observed,',
    '  nativeSourceValid:cn.observed.source.includes("observedOwner.secretField"),',
    '  sourceMismatch:cn.observed.source!==ce.observed.source,',
    '  numericParity:cn.observed.value===ce.observed.value&&cn.observed.value===57,',
    '  independentParity:cn.observed.independent===ce.observed.independent&&',
    '    cn.observed.independent===73,',
    '  positiveParity:pn.observed.source==="literal"&&',
    '    JSON.stringify(pn.observed)===JSON.stringify(pe.observed),',
    '  negativeProperties:'+crossNegativeProperties+',',
    '  positiveProperties:'+crossPositiveProperties+'};',
    ' document.getElementById("result").textContent=JSON.stringify({rows,dispatchRows,htmlApiRows,legacyDocumentRows,userland,dataPropertyControl,customAccessorControl,proxyStorageControl,proxyBrandCheckControl,htmlMethodControl,browserEnvironment,crossFile,crossStream});',
    '}catch(error){document.getElementById("result").textContent=',
    ' "BROWSER_ERROR "+String(error.stack||error);}',
    '</script>'
  ].join('\n');
  bodies.set('/',page);

  const server=http.createServer((request,response)=>{
    const code=bodies.get(request.url??'');
    if(code===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen({port:0,host:'127.0.0.1'},()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected loopback port');
    const {stdout,stderr}=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run',
        '--virtual-time-budget=10000','--dump-dom',
        'http://127.0.0.1:'+address.port+'/'
      ],{timeout:60000,maxBuffer:16*1024*1024,encoding:'utf8'});
    const match=stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/u);
    assert.ok(match,'Chromium did not emit the result node: '+stderr);
    assert.ok(!match[1].startsWith('BROWSER_ERROR '),match[1]);
    const browser=JSON.parse(match[1]);
    const browserEnvironment=browser.browserEnvironment;
    const htmlApiRows=browser.htmlApiRows;
    const legacyDocumentRows=browser.legacyDocumentRows;
    const legacyDocumentParity=legacyDocumentRows.length===legacyDocumentCases.length&&
      legacyDocumentRows.every((/** @type {any} */ row)=>row.numericParity&&
        row.independentParity&&row.positiveParity);
    const supportedHtmlApiCases=htmlApiCases.filter((/** @type {HtmlApiCase} */ item)=>
      !!browserEnvironment.htmlApiSupport[item.supportKey]);
    const htmlApiExpectedRed=htmlApiRows.length===htmlApiCases.length&&
      htmlApiRows.filter((/** @type {any} */ row)=>row.supported).length===supportedHtmlApiCases.length&&
      htmlApiRows.every((/** @type {any} */ row)=>!row.supported||
        (row.nativeSourceValid&&row.sourceMismatch&&row.numericParity&&
         row.independentParity&&row.positiveParity&&row.negativeProperties>=1&&
         row.positiveProperties>=1));
    const rows=browser.rows;
    const allExpectedRed=rows.length===cases.length&&rows.every(
      (/** @type {any} */ row)=>row.nativeSourceValid&&row.sourceMismatch&&
        row.numericParity&&row.independentParity&&row.positiveParity&&
        row.negativeProperties>=1&&row.positiveProperties>=1);
    const userland=browser.userland;
    const userlandPositive=userland.parity&&userland.native.value===57&&
      userland.emitted.value===57&&userland.native.independent===73&&
      userland.emitted.independent===73&&userlandOutput.properties>=1;
    const crossFile=browser.crossFile;
    const crossStream=browser.crossStream;
    const crossStreamExpectedRed=crossStream.nativeSourceValid&&crossStream.sourceMismatch&&
      crossStream.numericParity&&crossStream.independentParity&&crossStream.positiveParity&&
      crossStreamNegativeProperties>=1&&crossStreamPositiveProperties>=1;
    const crossFileExpectedRed=crossFile.nativeSourceValid&&crossFile.sourceMismatch&&
      crossFile.numericParity&&crossFile.independentParity&&crossFile.positiveParity&&
      crossFile.negativeProperties>=1&&crossFile.positiveProperties>=1;
    const dispatchRows=browser.dispatchRows;
    const dispatchSummary={
      count:dispatchRows.length,
      sourceMismatchCount:dispatchRows.filter((/** @type {any} */ row)=>row.sourceMismatch).length,
      rows:dispatchRows
    };
    const dataPropertyControl=browser.dataPropertyControl;
    const dataPropertyPositive=dataPropertyControl.parity&&
      dataPropertyControl.native.value===57&&dataPropertyControl.emitted.value===57&&
      dataPropertyControl.native.independent===73&&dataPropertyControl.emitted.independent===73&&
      dataPropertyOutput.properties>=1;
    const customAccessorControl=browser.customAccessorControl;
    const customAccessorPositive=customAccessorControl.parity&&
      customAccessorControl.native.value===57&&customAccessorControl.emitted.value===57&&
      customAccessorControl.native.independent===73&&customAccessorControl.emitted.independent===73&&
      customAccessorOutput.properties>=1;
    const proxyStorageControl=browser.proxyStorageControl;
    const proxyStoragePositive=proxyStorageControl.parity&&
      proxyStorageControl.native.value===57&&proxyStorageControl.emitted.value===57&&
      proxyStorageControl.native.independent===73&&proxyStorageControl.emitted.independent===73&&
      proxyStorageOutput.properties>=1;
    const proxyBrandCheckControl=browser.proxyBrandCheckControl;
    const proxyBrandCheckPositive=proxyBrandCheckControl.parity&&
      proxyBrandCheckControl.native.errorName==='TypeError'&&
      proxyBrandCheckControl.emitted.errorName==='TypeError'&&
      proxyBrandCheckControl.native.source===proxyBrandCheckControl.emitted.source&&
      proxyBrandCheckControl.native.value===57&&proxyBrandCheckControl.emitted.value===57&&
      proxyBrandCheckControl.native.independent===73&&proxyBrandCheckControl.emitted.independent===73&&
      proxyBrandCheckOutput.properties>=1;
    const htmlMethodControl=browser.htmlMethodControl;
    const htmlMethodExpectedRed=htmlMethodControl.nativeSourceValid&&
      htmlMethodControl.sourceMismatch&&htmlMethodControl.numericParity&&
      htmlMethodControl.independentParity&&htmlMethodControl.positiveParity&&
      htmlMethodOutput.properties>=1&&htmlMethodPositiveOutput.properties>=1;
    const dispatchExpectedRed=dispatchRows.length===dispatchCases.length&&
      dispatchRows.every((/** @type {any} */ row)=>row.sourceMismatch&&row.numericParity&&
        row.independentParity&&row.positiveParity);
    const currentSinkParity=rows.length===pairs.length&&
      rows.every((/** @type {any} */ row)=>row.nativeSourceValid&&!row.sourceMismatch&&
        row.numericParity&&row.independentParity&&row.positiveParity&&
        row.negativeProperties>=1&&row.positiveProperties>=1);
    const currentDispatchParity=dispatchRows.length===dispatchCases.length&&
      dispatchRows.every((/** @type {any} */ row)=>row.nativeSourceValid&&!row.sourceMismatch&&
        row.numericParity&&row.independentParity&&row.positiveParity&&
        row.negativeProperties>=1&&row.positiveProperties>=1);
    const currentHtmlMethodParity=htmlMethodControl.nativeSourceValid&&
      !htmlMethodControl.sourceMismatch&&htmlMethodControl.numericParity&&
      htmlMethodControl.independentParity&&htmlMethodControl.positiveParity&&
      htmlMethodOutput.properties>=1&&htmlMethodPositiveOutput.properties>=1;
    const currentHtmlApiParity=htmlApiRows.every((/** @type {any} */ row)=>
      !row.supported || row.nativeSourceValid&&!row.sourceMismatch&&row.numericParity&&
        row.independentParity&&row.positiveParity&&
        row.negativeProperties>=1&&row.positiveProperties>=1);
    const currentCrossFileParity=crossFile.nativeSourceValid&&!crossFile.sourceMismatch&&
      crossFile.numericParity&&crossFile.independentParity&&crossFile.positiveParity&&
      crossFile.negativeProperties===0&&crossFile.positiveProperties>=1;
    const currentCrossStreamParity=crossStream.nativeSourceValid&&!crossStream.sourceMismatch&&
      crossStream.numericParity&&crossStream.independentParity&&crossStream.positiveParity&&
      crossStreamNegativeProperties===0&&crossStreamPositiveProperties>=1;
    const acceptancePassed=currentSinkParity&&currentDispatchParity&&
      currentHtmlMethodParity&&currentHtmlApiParity&&legacyDocumentParity&&
      currentCrossFileParity&&currentCrossStreamParity&&userlandPositive&&
      dataPropertyPositive&&customAccessorPositive&&proxyStoragePositive&&
      proxyBrandCheckPositive;
    const summary={
      acceptancePassed,
      expectedRedReproduced:allExpectedRed&&userlandPositive&&crossFileExpectedRed&&crossStreamExpectedRed&&dataPropertyPositive&&customAccessorPositive&&proxyStoragePositive&&proxyBrandCheckPositive&&htmlMethodExpectedRed&&htmlApiExpectedRed&&legacyDocumentParity&&dispatchExpectedRed,
      sinkCount:rows.length,
      sourceMismatchCount:rows.filter((/** @type {any} */ row)=>row.sourceMismatch).length,
      sourceMismatchNames:rows.filter((/** @type {any} */ row)=>row.sourceMismatch).map(
        (/** @type {any} */ row)=>row.name),
      crossFileExpectedRed,crossFile,crossStreamExpectedRed,crossStream,dispatchSummary,dataPropertyControl,customAccessorControl,proxyStorageControl,proxyBrandCheckControl,
      htmlMethodExpectedRed,htmlMethodControl,htmlApiExpectedRed,htmlApiRows,legacyDocumentRows,
      htmlMethodProperties:{negative:htmlMethodOutput.properties,positive:htmlMethodPositiveOutput.properties},
      browserEnvironment,
      rows,userland,
      userlandProperties:userlandOutput.properties
    };
    fs.writeFileSync('domstring-property-setter-matrix.json',
      JSON.stringify(summary,null,2)+'\n');
    process.stdout.write('DOMSTRING_PROPERTY_SETTER_MATRIX '+
      JSON.stringify(summary)+'\n');
    assert.equal(summary.acceptancePassed,true,
      'DOMString/parser source-observation parity or positive rewrite yield regressed');
    process.stdout.write('DOMSTRING_PROPERTY_SETTER_MATRIX_ACCEPTANCE PASS\n');
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
module.exports={main};
