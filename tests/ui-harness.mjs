import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ScreenScript=require('../docs/screen-script.js');
const ChartInteraction=require('../docs/chart-interaction.js');
const AI=require('../docs/stock-ai.js');
export function node(){
  return {value:'',checked:false,hidden:true,textContent:'',innerHTML:'',className:'',disabled:false,style:{},children:[],
    insertAdjacentHTML(){},scrollIntoView(){},replaceChildren(...items){this.children=items;},
    appendChild(item){this.children.push(item);},querySelector(){return null;},classList:{toggle(){}}
  };
}
export async function createUI(apiReply,{keys={openai_api_key:'test-key'}}={}){
  const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  const storage=new Map(Object.entries(keys)),calls=[];
  el('apiProvider').value='openai';el('catStock').checked=true;el('marketJpx').checked=true;
  const stock={code:'1301',name:'テスト株',cat:'stock',markets:['jpx'],currency:'JPY',close:120,
    dividend_yield:4,daily:[90,100,110,120],volumes:[100,200,300,400],
    mc:Array(13).fill(120),wc:[120,110,100,90,80,...Array(8).fill(null)],
    lm:Array(13).fill(100),r3:0,r1:0,rw:0,v:{'5':100,'20':100,'60':100}};
  const flat={...stock,dividend_yield:null,code:'1302',name:'横ばい株',wc:Array(13).fill(120)};
  const fetchMock=async (url,options)=>{
    if(url.includes('screening.json'))return{ok:true,json:async()=>({base_date:'2026-10-30',stocks:[stock,flat],total:2,counts:{stock:2}})};
    if(url.includes('/charts/'))return{ok:true,json:async()=>({d:['2026-10-28','2026-10-29','2026-10-30'],close:[100,110,120],vol:[100,200,300]})};
    const call={url,options,body:JSON.parse(options.body)};calls.push(call);
    return apiReply(call);
  };
  const context=vm.createContext({
    document:{getElementById:el,createElement:node,querySelectorAll:()=>[]},ScreenScript,ChartInteraction,
    StockAI:{request:options=>AI.request({...options,fetchImpl:fetchMock})},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    fetch:fetchMock,AbortController
  });
  const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],context);
  await new Promise(resolve=>setImmediate(resolve));
  return {el,context,calls,storage,html,run:code=>vm.runInContext(code,context)};
}
export function response(text){return{ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]})};}
