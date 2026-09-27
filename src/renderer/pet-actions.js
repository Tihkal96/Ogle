'use strict';
function runPetClickAction(){
  switch(state.settings.petClickAction || 'reveal'){
    case 'none':return;
    case 'animation':{
      const name=['waving','review'][Math.floor(Math.random()*2)],now=performance.now();
      const [,frames,duration]=animations[name];state.clickAnimation={name,startedAt:now,until:now+frames*duration};return;
    }
    case 'expand':return switchPanel(state.activePanel);
    case 'reveal':return setMode(state.mode==='reveal'?'idle':'reveal');
    case 'toggle':return state.mode==='expand'?collapse(true):switchPanel(state.activePanel);
    case 'chatgpt':return switchPanel('chatgpt');
    default:return api.openCodex(state.selected?.id);
  }
}
