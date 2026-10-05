"use strict";
function historyMenuTemplate(target){
  if(!target||!['codex','claude'].includes(target.provider)||!['conversation','project','all'].includes(target.kind))throw new Error('Invalid history menu');
  if(target.kind==='conversation'&&(typeof target.id!=='string'||!target.id||target.id.length>160))throw new Error('Invalid conversation');
  if(target.kind==='project'&&(typeof target.cwd!=='string'||!target.cwd||target.cwd.length>4096))throw new Error('Invalid project');
  const actions=target.kind==='conversation'?[['rename','Rename conversation…'],['archive','Remove conversation…']]:target.kind==='project'?[['rename','Rename project label…'],['hide','Hide project in Ogle']]:[];
  return [...actions.map(([action,label])=>({action,label})),...(actions.length?[{type:'separator'}]:[]),{action:'archives',label:'Archived conversations…'},{action:'show-hidden',label:'Show hidden projects'}];
}
module.exports={historyMenuTemplate};
