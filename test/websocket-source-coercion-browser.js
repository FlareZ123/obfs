'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const original=[
  'const socket=new WebSocket(globalThis.__url);',
  'function protocolSensitive(){return "value-723";}',
  'socket.addEventListener("open",()=>{',
  '  socket.send(protocolSensitive);',
  '});'
].join('\n');

/**
 * Spawn a real headless Chromium page against a local HTTP/WebSocket server
 * and return its first masked client-to-server text frame, not a JavaScript
 * stub of the browser WebSocket API.
 *
 * @param {string} source
 * @returns {Promise<string>}
 */
async function captureChromiumFrame(source){
  const server=http.createServer();
  /** @type {import('node:net').Socket|null} */
  let peer=null;
  /** @type {(text:string)=>void} */
  let resolveFrame=()=>{};
  /** @type {(error:Error)=>void} */
  let rejectFrame=()=>{};
  /** @type {Promise<string>} */
  const frame=new Promise((resolve,reject)=>{
    resolveFrame=resolve;
    rejectFrame=reject;
  });
  server.on('upgrade',(req,socket)=>{
    peer=socket;
    const key=req.headers['sec-websocket-key'];
    if(typeof key!=='string'){
      rejectFrame(new Error('Missing Sec-WebSocket-Key'));
      socket.destroy();
      return;
    }
    const accept=createHash('sha1').update(key+GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\n'+
      'Upgrade: websocket\r\nConnection: Upgrade\r\n'+
      'Sec-WebSocket-Accept: '+accept+'\r\n\r\n');
    let input=Buffer.alloc(0);
    socket.on('error',rejectFrame);
    socket.on('data',data=>{
      input=Buffer.concat([input,data]);
      if(input.length<6)return;
      const opcode=input[0]&15;
      const size=input[1]&127;
      const offset=size===126?4:2;
      if(size===127 || !(input[1]&128)){
        rejectFrame(new Error('Expected masked, bounded WebSocket frame'));
        socket.destroy();return;
      }
      const len=size===126?input.readUInt16BE(2):size;
      if(input.length<offset+4+len)return;
      const mask=input.subarray(offset,offset+4);
      const decoded=Buffer.from(input.subarray(offset+4,offset+4+len));
      for(let i=0;i<decoded.length;i++)decoded[i]^=mask[i&3];
      if(opcode===1){
        resolveFrame(decoded.toString('utf8'));
        socket.end();
      }else{
        // A browser can send a control frame before its application data.
        // Consume it without confusing it for a text-data mismatch.
        input=input.subarray(offset+4+len);
        if(opcode===8){
          rejectFrame(new Error('WebSocket closed before any text frame'));
          socket.end();
        }
      }
    });
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Missing listener');
  const origin='http://127.0.0.1:'+address.port;
  const websocket='ws://127.0.0.1:'+address.port+'/ws';
  const html='<!doctype html><html><body><script>globalThis.__url='+
    JSON.stringify(websocket)+';\n'+source+'</script><pre id="out">loaded</pre></body></html>';
  server.on('request',(_req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end(html);
  });
  const browser=process.env.CHROMIUM_BIN??'chromium';
  /** @type {NodeJS.Timeout|undefined} */
  let timer;
  try{
    const chrome=promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--no-proxy-server','--virtual-time-budget=7000',
      '--dump-dom',origin
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const limited=Promise.race([
      frame,new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('No Chromium WebSocket frame')),20000);
      })
    ]);
    const [observed,output]=await Promise.all([limited,chrome]);
    assert.match(output.stdout,/id="out">loaded<\/pre>/u,
      'Chromium did not navigate to the controlled page');
    return observed;
  }finally{
    if(timer)clearTimeout(timer);
    peer?.destroy();
    server.closeAllConnections();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

async function main(){
  const compiled=obfuscateFiles([
    {path:'ws-coo.js',sourceType:'script',code:original}
  ],{mode:'coo',strings:true,identifiers:true,properties:false,
    seed:'agent41-websocket-chromium-20261123'});
  const compiledCode=compiled.files[0].code;
  if(typeof compiledCode!=='string')throw new Error('Expected JS source');
  const native=await captureChromiumFrame(original);
  const transformed=await captureChromiumFrame(compiledCode);
  const report={
    exactBrowserFrameParity:native===transformed,
    nativeFunctionSource:native.includes('function protocolSensitive()'),
    nativeBytes:Buffer.byteLength(native),
    transformedBytes:Buffer.byteLength(transformed)
  };
  console.log('CHROMIUM_WEBSOCKET_SOURCE '+JSON.stringify(report));
  assert.ok(report.nativeFunctionSource,'Browser did not send the function source');
  assert.equal(transformed,native,'Native Chromium source-text frame changed');
  return report;
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,captureChromiumFrame};
