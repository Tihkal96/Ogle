'use strict';
window.OgleCaret=(()=>{
  let mirror,marker,lastKey='',offset={x:0,y:0};
  const properties=['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','textIndent','textAlign','textTransform','tabSize','direction','paddingTop','paddingRight','paddingBottom','paddingLeft'];
  function point(input){
    const rect=input.getBoundingClientRect(),style=getComputedStyle(input),position=input.selectionDirection==='backward'?input.selectionStart:input.selectionEnd;
    const key=JSON.stringify([input.value,position,input.clientWidth,...properties.map(name=>style[name])]);
    if(key!==lastKey){
      lastKey=key;
      if(!mirror){mirror=document.createElement('div');mirror.setAttribute('aria-hidden','true');mirror.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;border:0;';document.body.append(mirror);}
      for(const property of properties)mirror.style[property]=style[property];
      mirror.style.width=input.clientWidth+'px';
      marker=document.createElement('span');marker.textContent='\u200b';
      mirror.replaceChildren(document.createTextNode(input.value.slice(0,position)),marker,document.createTextNode(input.value.slice(position)));
      const box=marker.getBoundingClientRect(),base=mirror.getBoundingClientRect();
      offset={x:box.left-base.left,y:box.top-base.top+box.height/2};
    }
    return {x:rect.left+input.clientLeft+Math.max(0,Math.min(input.clientWidth,offset.x-input.scrollLeft)),y:rect.top+input.clientTop+Math.max(0,Math.min(input.clientHeight,offset.y-input.scrollTop))};
  }
  return {point};
})();
