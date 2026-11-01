import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createUI,response} from './ui-harness.mjs';
const require=createRequire(import.meta.url),S=require('../docs/screen-script.js'),V=require('../docs/nl-validation.js'),examples=require('../docs/nl-examples.js');
for(const example of examples){
  S.compile(example.expression);
  V.validate({...example,markets:[],price_mode:'close',unhandled:[]},example.text);
}
const sample={close:359,daily:Array.from({length:260},(_,i)=>100+i),volumes:Array(260).fill(100000),
 mc:Array.from({length:13},(_,i)=>359/(1.05**i)),wc:Array.from({length:53},(_,i)=>359/(1.01**i)),
 sector:'Technology',industry:'Semiconductors',semiconductor_related:true,dividend_yield:4,r3:15,
 entitlement_date:new Date(Date.now()+10*86400000).toISOString().slice(0,10)};
const expected=[false,true,true,true,true,true,true,true,true,false,true,false,false,false,true,true,false,false,true,true,true,false,true,true,false,false,true,true,true];
assert.equal(examples.length,expected.length);
examples.forEach((entry,i)=>{assert.equal(S.evaluate(sample,entry.expression),expected[i],entry.text);assert.equal(S.evaluate({},entry.expression),false,entry.text+' 欠損');});
const mixed={mc:[120,110,110,100,90,100,80]};
assert.equal(S.indicator(mixed,'monthly_up_count',6),4);
assert.equal(S.indicator(mixed,'monthly_down_count',6),1);
assert.equal(S.evaluate(mixed,'monthly_up(6)'),false);
assert.equal(S.indicator(mixed,'monthly_loss_count',6,-10),1);
const rising={mc:Array.from({length:13},(_,i)=>120/(1.05**i)),wc:Array.from({length:53},(_,i)=>120/(1.01**i)),daily:[80,90,90,100]};
assert.equal(S.evaluate(rising,'monthly_up(6)'),true);
assert.equal(S.evaluate(rising,'monthly_up_count(12) > 6'),true);
assert.equal(S.evaluate(rising,'monthly_gain_count(12,5) == 12'),true);
assert.equal(S.evaluate(rising,'weekly_up_count(52) > 26'),true);
assert.equal(S.indicator(rising,'daily_up_count',3),2);
assert.equal(S.evaluate({mc:[100,null,...Array(11).fill(80)]},'monthly_up_count(12) > 6'),false);
assert.equal(S.evaluate({wc:Array(13).fill(100)},'weekly_up_count(52) > 26'),false);
for(const code of ['weekly_up(48)>=24','monthly_up(13)','weekly_up_count(53)>26','daily_up(253)','sma(close)>0'])assert.throws(()=>S.compile(code));
assert.equal(S.evaluate({industry:'Banks - Regional'},'banking == 1'),true);
assert.equal(S.evaluate({industry:'Capital Markets',jpx_industry:'銀行業'},'banking == 1'),true);
assert.equal(S.evaluate({industry:'Insurance - Life'},'banking == 1'),false);
assert.equal(S.evaluate({},'banking == 0'),false);
const out=expression=>({expression,interpretation:'テスト',markets:[],price_mode:'close',unhandled:[]});
assert.throws(()=>V.validate(out('monthly_up_count(12)>=6'),'過去一年上昇期間が多い'),/7/);
assert.throws(()=>V.validate(out('monthly_up_count(6)>0'),'半年間毎月上昇'),/連続判定/);
assert.throws(()=>V.validate(out('weekly_up(4)'),'直近4週すべて下落'),/連続判定/);
assert.throws(()=>V.validate(out('weekly_up(24)'),'半年間毎月上昇'),/monthly/);
assert.throws(()=>V.validate(out('monthly_up_count(6)>3'),'過去一年上昇期間が多い'),/12/);
assert.throws(()=>V.validate(out('sector == "Financial Services" && industry == "銀行業"'),'銀行関連'),/banking/);
for(const [text,bad,good] of [
 ['銀行関連','sector == "Financial Services" && industry == "銀行業"','banking == 1'],
 ['半年間毎月上昇','weekly_up(24)','monthly_up(6)'],
 ['過去一年上昇期間が多い','weekly_up(48)>=24','monthly_up_count(12)>6'],
]){
 const ui=await createUI(({body})=>response(JSON.stringify(out(body.instructions.includes('検証エラー:')?good:bad))));
 ui.el('nlText').value=text;await ui.run('parseNL()');
 assert.equal(ui.calls.length,2,text);assert.equal(ui.el('conditionExpr').value,good,text);
 assert.equal(ui.el('nlMsg').className,'ok',text);assert.equal(ui.el('resultCount').textContent,'1 銘柄',text);
}
const fail=await createUI(()=>response(JSON.stringify(out('weekly_up(48)>=24'))));
fail.el('conditionExpr').value='close>0';fail.el('nlText').value='過去一年上昇期間が多い';
await fail.run('parseNL()');
assert.equal(fail.calls.length,2);assert.equal(fail.el('nlMsg').className,'err');assert.equal(fail.el('conditionExpr').value,'close>0');
const unsupported=await createUI(()=>response(JSON.stringify({...out('close>0'),unhandled:['24ヶ月分のデータはありません']})));
unsupported.el('nlText').value='24ヶ月毎月上昇';await unsupported.run('parseNL()');
assert.equal(unsupported.calls.length,1);assert.equal(unsupported.el('nlMsg').className,'err');
console.log(examples.length+'文章例、銀行分類、月/週/日、回数、境界値、自動修正、修正不能時の停止 OK');
