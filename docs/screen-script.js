// Small expression language: no eval, property access, assignments or network calls.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScreenScript = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  const fields = ['close','r1','r3','rw','dividend_yield','rights_days','rights_date','pe','pbr','volume','volume_ratio','sector','industry','jpx_industry','semiconductor','banking'];
  const specs={};
  for(const name of ['sma','high','low','change','rsi','avg_volume','volatility']) specs[name]={type:'number',max:252,arity:1};
  for(const [unit,max] of [['daily',252],['weekly',52],['monthly',12]])
    for(const name of ['up','down','up_count','down_count','min_gain','max_gain','gain_count','loss_count'])
      specs[unit+'_'+name]={type:['up','down'].includes(name)?'boolean':'number',max,arity:['gain_count','loss_count'].includes(name)?2:1};
  specs.industry_has={type:'boolean',string:true,arity:1};
  const functions=Object.keys(specs);
  const help = '式: &&, ||, !, >, >=, <, <=, ==, !=, +, -, *, /, 括弧。変数 close,r1,r3,rw,dividend_yield(%),rights_days(権利付き最終日までの暦日),rights_date(YYYY-MM-DD),pe,pbr,volume,volume_ratio。当日から過去へ最大260営業日の調整済終値を使用。関数 sma(n),high(n),low(n) は終値の平均/最大/最小、change(n) はn営業日前からの騰落率%、avg_volume(n) は平均出来高、rsi(n) は単純平均方式RSI、volatility(n) は年率ボラティリティ%、daily/weekly/monthly の各接頭辞について _up(n)/_down(n) は全期間連続上昇/下落（真偽値）、_up_count(n)/_down_count(n) は上昇/下落期間数、_min_gain(n)/_max_gain(n) は各期間騰落率%の最小/最大、_gain_count(n,pct)/_loss_count(n,pct) は騰落率がpct%以上/以下だった期間数。日1..252、週1..52、月1..12。月は基準日から暦の1ヶ月ずつ遡る終値比較。横ばいは上昇にも下落にも数えない。連続判定の真偽値を数値と比較しない。期間の引数は範囲内の定数にする。sector(セクター),industry(業種),jpx_industry(東証33業種)は文字列で比較。例: sector == "Technology"。semiconductor は半導体関連なら1、対象外なら0、情報不足なら欠損。banking は日米の銀行・銀行持株会社の業種（industryまたはjpx_industry）なら1、その他0、分類不明は欠損。銀行関連は banking == 1。industry_has("Insurance") は業種（YahooとJPX双方）に文字列を含むかを判定する。文字列は二重引用符で囲む。日付は "YYYY-MM-DD" で比較。未取得の値を必要とする比較は不成立。';
  const cache = new Map();
  function compile(source) {
    if (typeof source !== 'string' || source.length > 2000) throw Error('式は2000文字以内で指定してください');
    if (cache.has(source)) return cache.get(source);
    const tokens = [];
    const re = /\s*(\d+(?:\.\d+)?|"(?:[^"\\\r\n]|\\.)*"|[a-z_][a-z_0-9]*|&&|\|\||>=|<=|==|!=|[()+*\/!,<>-])/gy;
    let offset = 0;
    while (offset < source.trimEnd().length) {
      re.lastIndex = offset;
      const m = re.exec(source);
      if (!m) throw Error('式に使えない文字があります: ' + source.slice(offset, offset + 20));
      tokens.push(m[1]); offset = re.lastIndex;
      if (tokens.length > 500) throw Error('式が複雑すぎます');
    }
    let pos = 0;
    const precedence = {'||':1,'&&':2,'==':3,'!=':3,'>':3,'>=':3,'<':3,'<=':3,'+':4,'-':4,'*':5,'/':5};
    function parse(min = 0, depth = 0) {
      if (depth > 40) throw Error('括弧が深すぎます');
      const token = tokens[pos++];
      let node;
      if (['!','-','+'].includes(token)) node = {op:'unary',kind:token,value:parse(6,depth+1)};
      else if (token === '(') {node = parse(0,depth+1); if(tokens[pos++] !== ')') throw Error('閉じ括弧が必要です');}
      else if (token && /^\d/.test(token)) node = {op:'literal',value:Number(token)};
      else if (token && token[0] === '"') {
        const value=JSON.parse(token);
        if(value.length>120) throw Error('文字列は120文字以内で指定してください');
        if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
          const stamp=Date.parse(value);
          if(!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10)!==value) throw Error('存在する日付を指定してください');
        }
        node={op:'literal',value};
      }
      else if (functions.includes(token) && tokens[pos] === '(') {
        pos++; const args=[];
        if(tokens[pos]!==')')while(true){
          args.push(parse(0,depth+1));
          if(args.length>2)throw Error('関数の引数が多すぎます');
          if(tokens[pos]!==',')break;
          pos++;
        }
        if(tokens[pos++]!==')')throw Error('関数の閉じ括弧が必要です');
        node={op:'call',name:token,args};
      } else if (fields.includes(token)) node = {op:'field',name:token};
      else throw Error('不明な変数または関数: ' + (token || '(空)'));
      while (pos < tokens.length && precedence[tokens[pos]] >= min) {
        const op = tokens[pos++]; node = {op,left:node,right:parse(precedence[op]+1,depth+1)};
      }
      return node;
    }
    const ast = parse();
    if (pos !== tokens.length) throw Error('式を最後まで解釈できません');
    if(infer(ast)!=='boolean') throw Error('式全体が真偽値になるよう、回数や指標を数値と比較してください');
    if(cache.size > 100) cache.clear();
    cache.set(source,ast); return ast;
  }
  function constant(node){
    if(node.op==='literal')return node.value;
    if(node.op==='unary'&&['+','-'].includes(node.kind)){
      const v=constant(node.value);return typeof v==='number'?(node.kind==='-'?-v:v):undefined;
    }
    if(['+','-','*','/'].includes(node.op)){
      const a=constant(node.left),b=constant(node.right);
      if(typeof a!=='number'||typeof b!=='number')return undefined;
      return {'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>a/b}[node.op]();
    }
  }
  function infer(node){
    if(node.op==='literal')return typeof node.value;
    if(node.op==='field')return ['sector','industry','jpx_industry','rights_date'].includes(node.name)?'string':'number';
    if(node.op==='call'){
      const spec=specs[node.name];
      if(node.args.length!==spec.arity)throw Error(node.name+' の引数は'+spec.arity+'個です');
      const values=node.args.map(constant);
      if(spec.string){
        if(typeof values[0]!=='string'||!values[0].trim())throw Error(node.name+' には空でない文字列を指定してください');
      }else{
        if(!Number.isInteger(values[0])||values[0]<1||values[0]>spec.max)
          throw Error(node.name+' の期間は1〜'+spec.max+'の整数定数です');
        if(spec.arity===2&&!Number.isFinite(values[1]))throw Error(node.name+' の騰落率は数値定数です');
      }
      return spec.type;
    }
    if(node.op==='unary'){
      const type=infer(node.value),expected=node.kind==='!'?'boolean':'number';
      if(type!==expected)throw Error('演算子 '+node.kind+' に必要な型は '+expected+' です');
      return expected;
    }
    const left=infer(node.left),right=infer(node.right);
    if(['&&','||'].includes(node.op)){
      if(left!=='boolean'||right!=='boolean')throw Error('AND/ORには比較式または連続判定を指定してください');
      return 'boolean';
    }
    if(['+','-','*','/'].includes(node.op)){
      if(left!=='number'||right!=='number')throw Error('四則演算は数値だけに使えます');
      return 'number';
    }
    if(left!==right){
      const call=[node.left,node.right].find(n=>n.op==='call'&&specs[n.name].type==='boolean');
      throw Error(call?'真偽値の '+call.name+' は数値と比較できません。上昇/下落の回数には _up_count / _down_count を使ってください':'異なる型の値は比較できません');
    }
    if(left==='boolean'&&!['==','!='].includes(node.op))throw Error('連続判定の真偽値に大小比較は使えません');
    return 'boolean';
  }
  function inspect(source){
    const ast=compile(source),calls=[],names=new Set();
    function visit(node){
      if(node.op==='field')names.add(node.name);
      if(node.op==='call'){calls.push({name:node.name,args:node.args.map(constant)});node.args.forEach(visit);}
      if(node.left)visit(node.left);if(node.right)visit(node.right);if(node.value&&typeof node.value==='object')visit(node.value);
    }
    visit(ast);return {calls,fields:[...names]};
  }

  function indicator(f, name, n, threshold) {
    if(name==='industry_has'){
      const industries=[f.industry,f.jpx_industry].filter(v=>typeof v==='string'&&v);
      return industries.length?industries.some(v=>v.toLocaleLowerCase().includes(String(n).toLocaleLowerCase())):null;
    }
    const spec=specs[name];
    if(!spec||!Number.isInteger(n)||n<1||n>spec.max)return null;
    const match=/^(daily|weekly|monthly)_(.+)$/.exec(name);
    if(match){
      const [,unit,kind]=match;
      const series=unit==='daily'?f.daily?.slice().reverse():unit==='weekly'?f.wc:f.mc;
      if(!series||series.length<=n)return null;
      const changes=[];
      for(let i=0;i<n;i++){
        const newer=series[i],older=series[i+1];
        if(!Number.isFinite(newer)||!Number.isFinite(older)||older<=0)return null;
        changes.push(Math.round((newer/older-1)*100*1e10)/1e10);
      }
      if(kind==='up')return changes.every(v=>v>0);
      if(kind==='down')return changes.every(v=>v<0);
      if(kind==='up_count')return changes.filter(v=>v>0).length;
      if(kind==='down_count')return changes.filter(v=>v<0).length;
      if(kind==='min_gain')return Math.min(...changes);
      if(kind==='max_gain')return Math.max(...changes);
      if(!Number.isFinite(threshold))return null;
      if(kind==='gain_count')return changes.filter(v=>v>=threshold).length;
      if(kind==='loss_count')return changes.filter(v=>v<=threshold).length;
      return null;
    }
    const all = name === 'avg_volume' ? f.volumes : f.daily;
    const needed = ['change','rsi','volatility'].includes(name) ? n+1 : n;
    if (!all || all.length < needed) return null;
    const a = all.slice(-needed);
    if(!a.every(Number.isFinite)) return null;
    const mean = x => x.reduce((s,v)=>s+v,0)/x.length;
    if(name === 'sma' || name === 'avg_volume') return mean(a);
    if(name === 'high') return Math.max(...a);
    if(name === 'low') return Math.min(...a);
    if(name === 'change') return a[0] > 0 ? (a.at(-1)/a[0]-1)*100 : null;
    const changes = a.slice(1).map((v,i)=>v-a[i]);
    if(name === 'rsi') {
      const gain=mean(changes.map(v=>Math.max(v,0))), loss=mean(changes.map(v=>Math.max(-v,0)));
      return loss===0 ? (gain===0 ? 50 : 100) : 100-100/(1+gain/loss);
    }
    if(name === 'volatility') {
      if(a.some(v=>v<=0)) return null;
      const returns=a.slice(1).map((v,i)=>Math.log(v/a[i])), avg=mean(returns);
      return Math.sqrt(mean(returns.map(v=>(v-avg)**2))*252)*100;
    }
    return null;
  }
  function run(ast, f) {
    if(ast.op === 'literal') return ast.value;
    if(ast.op === 'field') {
      if(['sector','industry','jpx_industry'].includes(ast.name)) return typeof f[ast.name]==='string' && f[ast.name] ? f[ast.name] : null;
      if(ast.name==='banking'){
        const industries=[f.industry,f.jpx_industry].filter(v=>typeof v==='string'&&v);
        return industries.length?(industries.some(v=>/\bbank(?:s|ing)?\b|銀行/i.test(v))?1:0):null;
      }
      if(ast.name==='semiconductor') return f.semiconductor_related==null?null:(f.semiconductor_related?1:0);
      if(ast.name === 'rights_date') return f.entitlement_date || null;
      if(ast.name === 'rights_days') {
        if(!f.entitlement_date) return null;
        const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        return Math.round((Date.parse(f.entitlement_date)-Date.parse(today))/86400000);
      }
      if(ast.name === 'volume') return f.volumes?.at(-1) ?? null;
      if(ast.name === 'volume_ratio') {
        const avg=indicator(f,'avg_volume',20);
        return avg > 0 ? (f.volumes.at(-1)/avg) : null;
      }
      return Number.isFinite(f[ast.name]) ? f[ast.name] : null;
    }
    if(ast.op === 'call') return indicator(f,ast.name,...ast.args.map(arg=>run(arg,f)));
    if(ast.op === 'unary') {
      const v=run(ast.value,f); if(v==null) return null;
      return ast.kind==='!' ? !v : typeof v==='number' ? (ast.kind==='-'?-v:v) : null;
    }
    const a=run(ast.left,f), b=run(ast.right,f);
    if(ast.op==='&&') return a===false || b===false ? false : a==null || b==null ? null : Boolean(a&&b);
    if(ast.op==='||') return a===true || b===true ? true : a==null || b==null ? null : Boolean(a||b);
    if(a==null || b==null || typeof a!==typeof b) return null;
    switch(ast.op) {
      case '>':return a>b; case '>=':return a>=b; case '<':return a<b; case '<=':return a<=b;
      case '==':return a===b;case '!=':return a!==b;
    }
    if(typeof a!=='number') return null;
    const value={'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>b===0?NaN:a/b}[ast.op]?.();
    return Number.isFinite(value)?value:null;
  }
  function evaluate(f, source) { return run(compile(source),f) === true; }
  return {compile,evaluate,indicator,inspect,help};
});
