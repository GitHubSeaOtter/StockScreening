// Independent checks for unit/count semantics before applying a generated expression.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./screen-script.js'));
  else root.NLValidation=factory(root.ScreenScript);
})(typeof self!=='undefined'?self:this,function(S){
  function numeric(text){
    if(/^\d+$/.test(text))return Number(text);
    const digits={'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
    let total=0,current=0;
    for(const c of text){if(c in digits)current=digits[c];else if(c==='十'||c==='百'){total+=(current||1)*(c==='十'?10:100);current=0;}else return null;}
    return total+current;
  }
  function semantics(text){
    const value=text.normalize('NFKC').replace(/\s/g,'');
    const num='([0-9一二三四五六七八九十百〇零]+)';
    let horizon;
    let m=value.match(new RegExp(num+'年半'));
    if(m)horizon={unit:'month',n:numeric(m[1])*12+6};
    else if(value.includes('半年'))horizon={unit:'month',n:6};
    else if((m=value.match(new RegExp(num+'年'))))horizon={unit:'month',n:numeric(m[1])*12};
    else if((m=value.match(new RegExp(num+'(?:ヶ|か|カ|ケ|ヵ)?月'))))horizon={unit:'month',n:numeric(m[1])};
    else if((m=value.match(new RegExp(num+'週'))))horizon={unit:'week',n:numeric(m[1])};
    else if((m=value.match(new RegExp(num+'(?:営業日|日)'))))horizon={unit:'day',n:numeric(m[1])};
    const riseFall=/上昇|下落|値上がり|値下がり/.test(value);
    const count=riseFall&&/多[いく]|過半数|半分|のうち|回以上|上昇月|下落月|上昇週|下落週|[0-9一二三四五六七八九十]+(?:ヶ|か|カ)?月以上/.test(value);
    let unit;
    if(/毎月|月連続|月次|上昇(?:した)?月|下落(?:した)?月|月(?:すべて|全て)/.test(value))unit='monthly';
    else if(/毎週|週連続|週次|上昇(?:した)?週|下落(?:した)?週|週(?:すべて|全て)/.test(value))unit='weekly';
    else if(/毎日|営業日連続|上昇(?:した)?日|下落(?:した)?日|(?:営業日|日)のうち/.test(value))unit='daily';
    else if(count)unit='monthly';
    let periods;
    if(unit&&horizon){
      if(unit==='monthly'&&horizon.unit==='month')periods=horizon.n;
      if(unit==='weekly')periods=horizon.unit==='month'?Math.round(horizon.n*52/12):horizon.unit==='week'?horizon.n:undefined;
      if(unit==='daily')periods=horizon.unit==='month'?horizon.n*21:horizon.unit==='week'?horizon.n*5:horizon.n;
    }
    const up=/上昇|値上がり/.test(value),down=/下落|値下がり/.test(value);
    return {unit,periods,count,direction:up&&!down?'up':down&&!up?'down':null,bank:/銀行関連|銀行銘柄|銀行株|銀行業|銀行セクター|^銀行(?:を|以外|$)/.test(value)&&!/33業種|JPX/.test(value)};
  }
  function validate(parsed,text){
    if(!parsed||typeof parsed.expression!=='string'||typeof parsed.interpretation!=='string'||!parsed.interpretation.trim()||
      !Array.isArray(parsed.markets)||!Array.isArray(parsed.unhandled)||!['close','after'].includes(parsed.price_mode)||
      parsed.markets.some(m=>!['jpx','dow','nasdaq100'].includes(m)))throw Error('APIの応答形式が正しくありません。expressionとinterpretationを含めてください');
    if(parsed.unhandled.length){const e=Error('対応できない条件: '+parsed.unhandled.join('、'));e.unsupported=true;throw e;}
    const info=S.inspect(parsed.expression),expected=semantics(text);
    if(expected.bank&&!info.fields.includes('banking'))throw Error('銀行関連には banking == 1 を使ってください。sectorと日本語industryのANDでは分類差を取りこぼします');
    if(expected.count&&!info.calls.some(c=>/_count$/.test(c.name)))throw Error('期間数の比較には _up_count / _down_count / _gain_count / _loss_count を使ってください');
    if(expected.unit){
      const relevant=info.calls.filter(c=>c.name.startsWith(expected.unit+'_'));
      if(!relevant.length)throw Error('この文章は '+expected.unit+' 単位で比較してください。週と月を置き換えないでください');
      if(expected.direction){
        const allowed=expected.count?[expected.direction+'_count',expected.direction==='up'?'gain_count':'loss_count']:
          [expected.direction,expected.direction==='up'?'min_gain':'max_gain'];
        if(!relevant.some(c=>allowed.includes(c.name.slice(expected.unit.length+1))))
          throw Error(expected.count?'上昇/下落の方向に合った回数関数を使ってください':'毎期間の連続判定には _up / _down、または _min_gain / _max_gain を使ってください。一部の期間だけでは不成立です');
      }
      if(expected.periods&&!relevant.some(c=>c.args[0]===expected.periods))throw Error('この文章の比較期間数は '+expected.periods+' です');
    }
    if(expected.count&&expected.periods&&/多[いく]|過半数|半分/.test(text)&&!(/上昇|値上がり/.test(text)&&/下落|値下がり/.test(text))){
      const minimum=/半分以上/.test(text)?Math.ceil(expected.periods/2):Math.floor(expected.periods/2)+1;
      const direction=/下落|値下がり/.test(text)?'down':'up';
      let matched=false;
      function literal(node){
        if(node.op==='literal'&&typeof node.value==='number')return node.value;
        if(node.op==='unary'&&['-','+'].includes(node.kind)){const v=literal(node.value);return node.kind==='-'?-v:v;}
        if(['+','-','*','/'].includes(node.op)){const a=literal(node.left),b=literal(node.right);return {'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>a/b}[node.op]();}
      }
      function check(node){
        if(node.left?.op==='call'&&node.left.name===expected.unit+'_'+direction+'_count'&&literal(node.left.args[0])===expected.periods){
          const threshold=literal(node.right);
          if(node.op==='>'&&Number.isFinite(threshold)&&Math.floor(threshold)+1===minimum)matched=true;
          if(node.op==='>='&&Number.isFinite(threshold)&&Math.ceil(threshold)===minimum)matched=true;
        }
        if(node.left)check(node.left);if(node.right)check(node.right);
      }
      check(S.compile(parsed.expression));
      if(!matched)throw Error('この文章では '+expected.periods+' 期間のうち '+minimum+' 期間以上を満たす比較式にしてください（過半数と半分以上を区別）');
    }
    return info;
  }
  return {validate,semantics};
});
