import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),AI=require('../docs/stock-ai.js');
let sent;
const result=await AI.request({provider:'anthropic',key:'test',instructions:'system',input:[{role:'user',content:'分析'},{role:'assistant',content:'回答'},{role:'user',content:'質問'}],
 fetchImpl:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return{ok:true,json:async()=>({content:[{type:'text',text:'追加回答'}]})};}});
assert.equal(result,'追加回答');assert.equal(sent.body.messages.length,3);
assert.equal(sent.body.system,'system');assert.equal(sent.body.output_config,undefined);
await assert.rejects(()=>AI.request({provider:'openai',key:'',input:'x'}),/キー/);
await assert.rejects(()=>AI.request({provider:'openai',key:'test',input:'x',fetchImpl:async()=>({ok:true,json:async()=>({status:'incomplete'})})}),/途中/);
console.log('OpenAI/Anthropic 共通APIとエラー処理 OK');
