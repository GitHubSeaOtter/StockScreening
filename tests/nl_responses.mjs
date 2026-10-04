// Responses API のリクエストと、文章入力から結果表示までを確認する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ScreenConditions = require('../docs/conditions.js');
const html = fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const elements = new Map();
let scrolled = false;
function el(id) {
  if (!elements.has(id)) elements.set(id, {
    value: '', checked: false, hidden: true, textContent: '', innerHTML: '',
    className: '', disabled: false, insertAdjacentHTML() {},
    scrollIntoView() { scrolled = true; },
  });
  return elements.get(id);
}
el('nlText').value = '東証で株価が100円から150円';
el('apiProvider').value = 'openai';
el('catStock').checked = true;
el('marketJpx').checked = true;
let apiCall;
const stock = {code:'1301',name:'テスト株',cat:'stock',markets:['jpx'],currency:'JPY',close:120,
  mc:Array(13).fill(120),lm:Array(13).fill(100),r3:0,r1:0,rw:0,v:{'5':100,'20':100,'60':100}};
const context = vm.createContext({
  document:{getElementById:el}, ScreenConditions,
  localStorage:{getItem(key) {return key === 'openai_api_key' ? 'test-key' : null;},setItem() {}},
  fetch:async (url, options) => {
    if (url.includes('screening.json')) return {ok:true,json:async()=>({base_date:'2026-10-02',stocks:[stock],total:1,counts:{stock:1}})};
    apiCall = {url,options};
    const parsed = {markets:['jpx'],price_mode:'close',conditions:[{type:'price_range',min:100,max:150}]};
    return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(parsed)}]}]})};
  },
});
vm.runInContext(script, context);
await new Promise(resolve => setImmediate(resolve));
await vm.runInContext('parseNL()', context);
assert.equal(apiCall.url, 'https://api.openai.com/v1/responses');
const body = JSON.parse(apiCall.options.body);
assert.equal(body.input, '東証で株価が100円から150円');
assert.equal(body.text.format.type, 'json_schema');
assert.equal(el('resultCount').textContent, '1 銘柄');
assert.equal(el('nlMsg').className, 'ok');
assert.equal(scrolled, true);
console.log('Responses API から結果表示まで OK');
