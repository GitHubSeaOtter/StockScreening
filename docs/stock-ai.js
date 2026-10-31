// Shared OpenAI Responses / Anthropic client. Responses are displayed as plain text.
(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.StockAI=factory();
})(typeof self!=='undefined'?self:this,function(){
  async function request({provider,key,instructions,input,schema,signal,fetchImpl=globalThis.fetch}) {
    if(!key || !key.trim()) throw Error('設定から API キーを保存してください');
    if(!['openai','anthropic'].includes(provider)) throw Error('API プロバイダーを選択してください');
    const openai=provider==='openai';
    const body=openai?{
      model:'gpt-4.1-mini',instructions,input,max_output_tokens:3500,
      ...(schema?{text:{format:{type:'json_schema',name:'screening_expression',strict:true,schema}}}:{})
    }:{
      model:'claude-haiku-4-5',max_tokens:3500,system:instructions,
      messages:typeof input==='string'?[{role:'user',content:input}]:input,
      ...(schema?{output_config:{format:{type:'json_schema',schema}}}:{})
    };
    const res=await fetchImpl(openai?'https://api.openai.com/v1/responses':'https://api.anthropic.com/v1/messages',{
      method:'POST',signal,
      headers:openai?{'content-type':'application/json',Authorization:'Bearer '+key}:
        {'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify(body)
    });
    const data=await res.json();
    if(!res.ok) throw Error(data.error?.message || 'API エラー ('+res.status+')');
    if(data.status==='incomplete' || data.stop_reason==='max_tokens') throw Error('応答が途中で終了しました。質問を短くして再試行してください');
    const parts=openai?data.output?.flatMap(item=>item.content||[]):data.content;
    if(parts?.some(part=>part.type==='refusal')) throw Error('API はこのリクエストに回答できませんでした');
    const raw=openai?(data.output_text || parts?.filter(part=>part.type==='output_text').map(part=>part.text).join('\n')):
      parts?.filter(part=>part.type==='text').map(part=>part.text).join('\n');
    if(!raw?.trim()) throw Error('API が応答を返しませんでした');
    return raw;
  }
  return {request};
});
