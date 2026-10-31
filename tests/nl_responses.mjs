import assert from 'node:assert/strict';
import {createUI,response} from './ui-harness.mjs';
const ui=await createUI(({body})=>{
  const input=body.input;
  const parsed=input.includes('旧形式')?{conditions:[{type:'price_range',min:100,max:150}]}:
    input.includes('未対応')?{expression:'close > 0',markets:['jpx'],price_mode:'close',unhandled:['未対応指標']}:
    {expression:input.includes('毎週')?'weekly_up(4)':input.includes('配当')?'dividend_yield >= 3 && close > sma(2)':'close >= 100 && close <= 150',
      markets:['jpx'],price_mode:'close',unhandled:[]};
  return response(JSON.stringify(parsed));
});
assert.equal(ui.html.includes("addCond('"),false);
assert.equal(ui.html.includes('id="conditionExpr"'),true);
ui.el('nlText').value='東証で株価が100円から150円';
await ui.run('parseNL()');
assert.equal(ui.calls[0].url,'https://api.openai.com/v1/responses');
assert.equal(ui.el('conditionExpr').value,'close >= 100 && close <= 150');
assert.equal(ui.el('resultCount').textContent,'2 銘柄');
const schema=ui.calls[0].body.text.format.schema;
assert.deepEqual(Object.keys(schema.properties).sort(),['expression','markets','price_mode','unhandled'].sort());
assert.equal(schema.additionalProperties,false);
assert.match(ui.calls[0].body.instructions,/必ず expression/);
ui.el('nlText').value='直近1ヶ月、毎週上昇';
await ui.run('parseNL()');
assert.equal(ui.el('conditionExpr').value,'weekly_up(4)');
assert.equal(ui.el('resultCount').textContent,'1 銘柄');
for(const text of ['旧形式','未対応指標']){
  ui.el('nlText').value=text;await ui.run('parseNL()');
  assert.equal(ui.el('nlMsg').className,'err');
  assert.equal(ui.el('conditionExpr').value,'weekly_up(4)');
}
ui.el('nlText').value='配当3%以上で2日平均より上';
await ui.run('parseNL()');
assert.equal(ui.el('nlMsg').className,'ok');
assert.equal(ui.el('resultCount').textContent,'1 銘柄');
ui.el('conditionExpr').value='fetch(1)';assert.equal(ui.run('runScreen()'),false);
console.log('条件式のみの画面・自然言語変換・旧形式の拒否 OK');
