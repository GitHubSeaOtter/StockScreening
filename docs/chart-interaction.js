// Pointer/touch and keyboard inspection of the nearest daily close.
(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.ChartInteraction=factory();
})(typeof self!=='undefined'?self:this,function(){
  function pct(now,base){return Number.isFinite(now)&&Number.isFinite(base)&&base>0?(now/base-1)*100:null;}
  function pointAt(data,index){
    const i=Math.max(0,Math.min(data.close.length-1,Math.round(index)));
    const price=data.close[i],previous=i?data.close[i-1]:data.previousClose;
    return {index:i,date:data.dates[i],price,dayPct:pct(price,previous),periodPct:pct(price,data.close[0])};
  }
  function bind(container,data){
    const svg=container.querySelector('svg.chart'), group=container.querySelector('.chart-cross');
    const readout=container.querySelector('.chart-readout');
    if(!svg || !group || !readout || data.close.length<2) return;
    const vertical=group.querySelector('.cross-x'), horizontal=group.querySelector('.cross-y'),dot=group.querySelector('circle');
    const lo=Math.min(...data.close), hi=Math.max(...data.close),span=(hi-lo)||1;
    const format=v=>v==null?'-':(v>0?'+':'')+v.toFixed(2)+'%';
    let selected=data.close.length-1;
    function show(index){
      const p=pointAt(data,index);selected=p.index;
      const x=2+316*selected/(data.close.length-1), y=6+160*(1-(p.price-lo)/span);
      for(const k of ['x1','x2'])vertical.setAttribute(k,x);
      for(const k of ['y1','y2'])horizontal.setAttribute(k,y);
      dot.setAttribute('cx',x);dot.setAttribute('cy',y);group.style.display='';
      readout.textContent=p.date+'　'+p.price.toLocaleString('ja-JP',{maximumFractionDigits:2})+(data.currency==='USD'?' USD':' 円')+
        '　前日比 '+format(p.dayPct)+'　表示開始比 '+format(p.periodPct);
      svg.setAttribute('aria-label',readout.textContent);
      return p;
    }
    function pointer(event){
      const rect=svg.getBoundingClientRect();if(!rect.width)return;
      const viewX=(event.clientX-rect.left)/rect.width*320;
      show((viewX-2)/316*(data.close.length-1));
    }
    svg.addEventListener('pointerdown',event=>{pointer(event);svg.setPointerCapture?.(event.pointerId);});
    svg.addEventListener('pointermove',pointer);
    svg.addEventListener('keydown',event=>{
      const index={ArrowLeft:selected-1,ArrowRight:selected+1,Home:0,End:data.close.length-1}[event.key];
      if(index!==undefined){event.preventDefault();show(index);}
    });
    return show;
  }
  return {pointAt,bind};
});
