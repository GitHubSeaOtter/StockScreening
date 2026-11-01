// One scale is shared by the rendered curve and its touch crosshair.
(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.ChartInteraction=factory();
})(typeof self!=='undefined'?self:this,function(){
  function layout(prices,zeroBased=false){
    const finite=prices.filter(Number.isFinite),minimum=finite.length?Math.min(...finite):0,maximum=finite.length?Math.max(...finite):1;
    const padding=Math.max((maximum-minimum)*0.1,Math.abs(maximum)*0.01,0.01);
    const low=zeroBased?0:Math.max(0,minimum-padding),high=Math.max(maximum+padding,low+0.01);
    const left=8,right=312,top=18,bottom=166;
    return {width:320,height:200,left,right,top,bottom,low,high,
      x:index=>left+(right-left)*index/Math.max(1,prices.length-1),
      y:price=>top+(bottom-top)*(1-(price-low)/(high-low))};
  }
  function pct(now,base){return Number.isFinite(now)&&Number.isFinite(base)&&base>0?(now/base-1)*100:null;}
  function pointAt(data,index){
    const i=Math.max(0,Math.min(data.close.length-1,Math.round(index)));
    const price=data.close[i],previous=i?data.close[i-1]:data.previousClose;
    return {index:i,date:data.dates[i],price,dayPct:pct(price,previous),periodPct:pct(price,data.close[0])};
  }
  function bind(container,data){
    const svg=container.querySelector('svg.chart'),group=container.querySelector('.chart-cross'),readout=container.querySelector('.chart-readout');
    if(!svg || !group || !readout || data.close.length<2)return;
    const vertical=group.querySelector('.cross-x'),horizontal=group.querySelector('.cross-y'),dot=group.querySelector('circle');
    const date=readout.querySelector('[data-point-date]'),price=readout.querySelector('[data-point-price]');
    const day=readout.querySelector('[data-point-day]'),period=readout.querySelector('[data-point-period]');
    const scale=layout(data.close,data.zeroBased),format=v=>v==null?'-':(v>0?'+':'')+v.toFixed(2)+'%';
    let selected=data.close.length-1;
    function show(index){
      const p=pointAt(data,index);selected=p.index;
      const x=scale.x(selected),y=scale.y(p.price);
      for(const k of ['x1','x2'])vertical.setAttribute(k,x);
      for(const k of ['y1','y2'])horizontal.setAttribute(k,y);
      dot.setAttribute('cx',x);dot.setAttribute('cy',y);group.style.display='';
      const priceText=p.price.toLocaleString('ja-JP',{minimumFractionDigits:data.currency==='USD'?2:0,maximumFractionDigits:2})+(data.currency==='USD'?' USD':' 円');
      date.textContent=p.date;price.textContent=priceText;
      for(const [target,value] of [[day,p.dayPct],[period,p.periodPct]]){
        target.textContent=format(value);target.className=value==null?'':value>=0?'pos':'neg';
      }
      svg.setAttribute('aria-label',p.date+' '+priceText+' 前日比 '+format(p.dayPct)+' 表示開始比 '+format(p.periodPct));
      return p;
    }
    function pointer(event){
      const rect=svg.getBoundingClientRect();if(!rect.width)return;
      const viewX=(event.clientX-rect.left)/rect.width*scale.width;
      show((viewX-scale.left)/(scale.right-scale.left)*(data.close.length-1));
    }
    svg.addEventListener('pointerdown',event=>{pointer(event);svg.setPointerCapture?.(event.pointerId);});
    svg.addEventListener('pointermove',pointer);
    svg.addEventListener('keydown',event=>{
      const positions={ArrowLeft:selected-1,ArrowRight:selected+1,Home:0,End:data.close.length-1};
      if(Object.hasOwn(positions,event.key)){event.preventDefault();show(positions[event.key]);}
    });
    return show;
  }
  return {layout,pointAt,bind};
});
