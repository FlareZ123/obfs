'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Read exactly one client-to-server WebSocket text frame, including native
 * browser/Node WebSocket.send(data) string coercion. The supplied JavaScript
 * runs in an isolated realm but uses the genuine Node 22 WebSocket object.
 *
 * @param {string} source
 * @returns {Promise<string>}
 */
async function captureSourceFrame(source){
  if(typeof WebSocket!=='function')throw new Error('Node 22 global WebSocket is required');
  const server=http.createServer();
  /** @type {import('node:net').Socket|null} */
  let peer=null;
  /** @type {(value:string)=>void} */
  let done=()=>{};
  /** @type {(error:Error)=>void} */
  let fail=()=>{};
  const observed=new Promise((resolve,reject)=>{
    done=resolve;
    fail=reject;
  });
  server.on('upgrade',(request,socket)=>{
    peer=socket;
    const key=request.headers['sec-websocket-key'];
    if(typeof key!=='string'){
      fail(new Error('Missing WebSocket handshake key'));
      socket.destroy();
      return;
    }
    const accept=createHash('sha1').update(key+GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\n'+
      'Upgrade: websocket\r\nConnection: Upgrade\r\n'+
      'Sec-WebSocket-Accept: '+accept+'\r\n\r\n');
    /** @type {Buffer} */
    let pending=Buffer.alloc(0);
    socket.on('error',error=>fail(error));
    socket.on('data',buffer=>{
      pending=Buffer.concat([pending,buffer]);
      if(pending.length<2)return;
      const opcode=pending[0]&15;
      const longLength=pending[1]&127;
      const header=longLength===126?4:2;
      if(longLength===127||opcode!==1||(pending[1]&128)===0){
        fail(new Error('Expected one masked unfragmented short WebSocket text frame'));
        socket.destroy();return;
      }
      if(pending.length<header+4+(longLength===126?pending.readUInt16BE(2):longLength))return;
      const length=longLength===126?pending.readUInt16BE(2):longLength;
      const mask=pending.subarray(header,header+4);
      const payload=Buffer.from(pending.subarray(header+4,header+4+length));
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
      done(payload.toString('utf8'));
      socket.end();
    });
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Missing listener address');
  /** @type {NodeJS.Timeout|undefined} */
  let timeout;
  try{
    vm.runInNewContext(source,{WebSocket,__url:'ws://127.0.0.1:'+address.port},{timeout:10000});
    return await Promise.race([
      observed,
      new Promise((_,reject)=>{
        timeout=setTimeout(()=>reject(Error('WebSocket source frame timeout')),10000);
      })
    ]);
  }finally{
    if(timeout)clearTimeout(timeout);
    peer?.destroy();
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
}

const source=[
  'const socket=new WebSocket(globalThis.__url);',
  'function protocolSensitive(){return "value-723";}',
  'function unrelated(value){return value+1;}',
  'const inert=unrelated(6);',
  'socket.addEventListener("open",()=>{',
  '  socket.send(protocolSensitive);',
  '  socket.close();',
  '});'
].join('\n');

const aliasSource=[
  'const Native=globalThis.WebSocket;',
  'const primary=new Native(globalThis.__url);',
  'const socket=primary;',
  'function protocolSensitive(){return "value-723";}',
  'socket.addEventListener("open",()=>{',
  '  socket.send(protocolSensitive);',
  '  socket.close();',
  '});'
].join('\n');

const detachedSource=[
  'const socket=new WebSocket(globalThis.__url);',
  'const sender=socket.send;',
  'function protocolSensitive(){return "value-723";}',
  'socket.addEventListener("open",()=>{',
  '  sender.call(socket,protocolSensitive);',
  '  socket.close();',
  '});'
].join('\n');

const boundSource=[
  'const socket=new WebSocket(globalThis.__url);',
  'const sender=socket.send.bind(socket);',
  'function protocolSensitive(){return "value-723";}',
  'socket.addEventListener("open",()=>{',
  '  sender(protocolSensitive);',
  '  socket.close();',
  '});'
].join('\n');

const reflectSource=[
  'const socket=new WebSocket(globalThis.__url);',
  'function protocolSensitive(){return "value-723";}',
  'socket.addEventListener("open",()=>{',
  '  Reflect.apply(socket.send,socket,[protocolSensitive]);',
  '  socket.close();',
  '});'
].join('\n');

const applySource=[
  'const socket=new WebSocket(globalThis.__url);',
  'function protocolSensitive(){return "value-723";}',
  'socket.addEventListener("open",()=>{',
  '  socket.send.apply(socket,[protocolSensitive]);',
  '  socket.close();',
  '});'
].join('\n');

const recordSource=[
  'const owner={socket:new WebSocket(globalThis.__url)};',
  'function protocolSensitive(){return "value-723";}',
  'owner.socket.addEventListener("open",()=>{',
  '  owner.socket.send(protocolSensitive);',
  '  owner.socket.close();',
  '});'
].join('\n');

const recordAliasSource=[
  'const owner={socket:new WebSocket(globalThis.__url)};',
  'const other=owner;',
  'function protocolSensitive(){return "value-723";}',
  'other.socket.addEventListener("open",()=>{',
  '  other.socket.send(protocolSensitive);',
  '  other.socket.close();',
  '});'
].join('\n');

const destructuredSource=[
  'const owner={socket:new WebSocket(globalThis.__url)};',
  'const {socket:ws}=owner;',
  'function protocolSensitive(){return "value-723";}',
  'ws.addEventListener("open",()=>{',
  '  ws.send(protocolSensitive);',
  '  ws.close();',
  '});'
].join('\n');

const mutatedRecordSource=[
  'const owner={};',
  'owner.socket=new WebSocket(globalThis.__url);',
  'function protocolSensitive(){return "value-723";}',
  'owner.socket.addEventListener("open",()=>{',
  '  owner.socket.send(protocolSensitive);',
  '  owner.socket.close();',
  '});'
].join('\n');

const primitiveSource=[
  'const socket=new WebSocket(globalThis.__url);',
  'socket.addEventListener("open",()=>{',
  '  socket.send("safe-literal-893");',
  '  socket.close();',
  '});'
].join('\n');

/**
 * @param {string} label
 * @param {string} input
 * @returns {Promise<{label:string,native:string,transformed:string,transformApplied:boolean,literals:number}>}
 */
async function compare(label,input){
  const native=await captureSourceFrame(input);
  const compiled=obfuscateFiles([{
    path:label+'.js',sourceType:'script',code:input
  }],{
    mode:'coo',seed:'agent41-websocket-source-20261123',
    identifiers:true,strings:true,properties:false
  });
  const output=compiled.files[0];
  if(typeof output.code!=='string')throw new Error('Expected JavaScript source');
  const transformed=await captureSourceFrame(output.code);
  return {
    label,native,transformed,transformApplied:output.code!==input,
    literals:output.metrics.literals
  };
}

async function main(){
  const direct=await compare('direct',source);
  const alias=await compare('alias',aliasSource);
  const detached=await compare('detached',detachedSource);
  const bound=await compare('bound',boundSource);
  const reflect=await compare('reflect',reflectSource);
  const apply=await compare('apply',applySource);
  const record=await compare('record',recordSource);
  const recordAlias=await compare('recordAlias',recordAliasSource);
  const destructured=await compare('destructured',destructuredSource);
  const mutatedRecord=await compare('mutatedRecord',mutatedRecordSource);
  const primitive=await compare('literal',primitiveSource);
  const evidence=[direct,alias,detached,bound,reflect,apply,record,recordAlias,destructured,mutatedRecord,primitive].map(item=>({
    case:item.label,
    transformApplied:item.transformApplied,
    literals:item.literals,
    nativeFrameBytes:Buffer.byteLength(item.native),
    obfuscatedFrameBytes:Buffer.byteLength(item.transformed),
    parity:item.native===item.transformed,
    observedFunctionSource:item.native.includes('function protocolSensitive()')
  }));
  console.log('WEBSOCKET_SOURCE_COERCION '+JSON.stringify(evidence));
  assert.ok(direct.native.includes('function protocolSensitive()'),
    'The native WebSocket did not transmit the expected function source');
  assert.ok(alias.native.includes('function protocolSensitive()'),
    'An aliased native constructor did not preserve the source observer');
  assert.equal(direct.transformed,direct.native,
    'Direct native WebSocket.send(function) source-text output changed');
  assert.equal(alias.transformed,alias.native,
    'Aliased WebSocket constructor/instance sent a different function source');
  assert.equal(detached.transformed,detached.native,
    'Detached WebSocket.send.call(source) sent a different function source');
  for(const item of [bound,reflect,apply])assert.equal(item.transformed,item.native,
    'Indirect WebSocket sender '+item.label+' changed Function source text');
  assert.equal(record.transformed,record.native,
    'A WebSocket stored in an object property leaked transformed function source');
  for(const item of [recordAlias,destructured,mutatedRecord])
    assert.equal(item.transformed,item.native,
      'A WebSocket carried by '+item.label+' leaked mutated function source');
  assert.equal(primitive.transformed,primitive.native,
    'Primitive WebSocket payload did not preserve its string contents');
  assert.ok(primitive.transformApplied && primitive.literals>0,
    'Safe primitive WebSocket.send string must retain positive string-obfuscation yield');
  return evidence;
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,captureSourceFrame};
