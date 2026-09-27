'use strict';
const destinations=[['chatgpt','ChatGPT'],['codex','Codex'],['powershell','PowerShell'],['cmd','Command Prompt'],['admin-powershell','PowerShell (Admin)'],['admin-cmd','Command Prompt (Admin)'],['editor','Editor — new file'],['notes','Notes']];
function selectionMenuTemplate(text,{paste,copy}){
  if(typeof text!=='string'||!text.length||text.length>100000)throw new Error('Select between 1 and 100,000 characters to paste into another panel.');
  return [{label:'Copy',click:()=>copy(text)},{type:'separator'},{label:'Paste into',submenu:destinations.map(([target,label])=>({label,click:()=>paste({target,text})}))}];
}
module.exports={selectionMenuTemplate};
