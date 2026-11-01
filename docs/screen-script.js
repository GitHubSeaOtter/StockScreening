// Small expression language: no eval, property access, assignments or network calls.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScreenScript = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  const fields = ['close','r1','r3','rw','dividend_yield','rights_days','rights_date','pe','pbr','volume','volume_ratio','sector','industry','jpx_industry','semiconductor'];
  const functions = ['sma','high','low','change','rsi','avg_volume','volatility','weekly_up','weekly_down'];
  const help = '式: &&, ||, !, >, >=, <, <=, ==, !=, +, -, *, /, 括弧。変数 close,r1,r3,rw,dividend_yield(%),rights_days(権利付き最終日までの暦日),rights_date(YYYY-MM-DD),pe,pbr,volume,volume_ratio。当日から過去へ最大260営業日の調整済終値を使用。関数 sma(n),high(n),low(n) は終値の平均/最大/最小、change(n) はn営業日前からの騰落率%、avg_volume(n) は平均出来高、rsi(n) は単純平均方式RSI、volatility(n) は年率ボラティリティ%、weekly_up(n)/weekly_down(n) はn週連続上昇/下落。n=1..252、weeklyは1..12。sector(セクター),industry(業種),jpx_industry(東証33業種)は文字列で比較。例: sector == "Technology"。semiconductor は半導体関連なら1、対象外なら0、情報不足なら欠損。文字列は二重引用符で囲む。日付は "YYYY-MM-DD" で比較。未取得の値を必要とする比較は不成立。';
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
        pos++; const arg = parse(0,depth+1);
        if (tokens[pos++] !== ')') throw Error('関数には引数を1つ指定してください');
        node = {op:'call',name:token,arg};
      } else if (fields.includes(token)) node = {op:'field',name:token};
      else throw Error('不明な変数または関数: ' + (token || '(空)'));
      while (pos < tokens.length && precedence[tokens[pos]] >= min) {
        const op = tokens[pos++]; node = {op,left:node,right:parse(precedence[op]+1,depth+1)};
      }
      return node;
    }
    const ast = parse();
    if (pos !== tokens.length) throw Error('式を最後まで解釈できません');
    if(cache.size > 100) cache.clear();
    cache.set(source,ast); return ast;
  }
  function indicator(f, name, n) {
    if (!Number.isInteger(n) || n < 1 || n > 252) return null;
    if (name.startsWith('weekly_')) {
      if (n > 12 || !f.wc || f.wc.length <= n) return null;
      for(let i=0;i<n;i++) {
        if(f.wc[i] == null || f.wc[i+1] == null) return null;
        if(name === 'weekly_up' ? f.wc[i] <= f.wc[i+1] : f.wc[i] >= f.wc[i+1]) return false;
      }
      return true;
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
    if(ast.op === 'call') return indicator(f,ast.name,run(ast.arg,f));
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
  return {compile,evaluate,indicator,help};
});
