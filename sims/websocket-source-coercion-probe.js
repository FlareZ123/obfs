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
  try{
    vm.runInNewContext(source,{WebSocket,__url:'ws://127.0.0.1:'+address.port},{timeout:10000});
    return await Promise.race([
      observed,
      new Promise((_,reject)=>setTimeout(()=>reject(Error('WebSocket source frame timeout')),10000))
    ]);
  }finally{
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

async function main(){
  const native=await captureSourceFrame(source);
  const compiled=obfuscateFiles([{
    path:'websocket-client.js',sourceType:'script',code:source
  }],{
    mode:'coo',seed:'agent41-websocket-source-20261123',
    identifiers:true,strings:false,properties:false
  });
  const code=compiled.files[0].code;
  const transformed=await captureSourceFrame(code);
  const evidence={
    transformApplied:code!==source,
    nativeFrameBytes:Buffer.byteLength(native),
    obfuscatedFrameBytes:Buffer.byteLength(transformed),
    parity:native===transformed,
    observedFunctionSource:native.includes('function protocolSensitive()'),
    emittedSourceNamePreserved:transformed.includes('function protocolSensitive()')
  };
  console.log('WEBSOCKET_SOURCE_COERCION '+JSON.stringify(evidence));
  assert.ok(evidence.observedFunctionSource,'The native WebSocket did not transmit the expected function source');
  assert.equal(transformed,native,'Native WebSocket.send(function) source-text output changed');
  return evidence;
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,captureSourceFrame};
