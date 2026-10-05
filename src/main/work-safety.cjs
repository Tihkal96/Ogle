'use strict';
// Return only a boolean, never draft text, attachment names or conversation data.
const DRAFT_PROBE=`(()=>{
 const visible=node=>!!(node&&node.getClientRects().length);
 const composer=[...document.querySelectorAll('#prompt-textarea,[contenteditable="true"][role="textbox"],[contenteditable="true"].ProseMirror,textarea')].find(visible);
 if(!composer)return false;
 if(String(composer.value??composer.textContent??'').trim())return true;
 const scope=composer.closest('form')||composer.parentElement?.parentElement;
 return !!scope&&([...scope.querySelectorAll('input[type="file"]')].some(input=>input.files?.length)||[...scope.querySelectorAll('[data-testid*="attachment"],[data-testid*="file-thumbnail"],[data-composer-attachments]>*')].some(visible)||[...scope.querySelectorAll('button[aria-label]')].some(button=>visible(button)&&/^(remove|delete|ukloni|supprimer|entfernen).*(file|image|attachment|datotek|slik|prilog)/i.test(button.getAttribute('aria-label')||'')));
})()`;
async function bounded(task,timeout=3000){let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The website is busy. Wait before restarting.')),timeout);})]);}finally{clearTimeout(timer);}}
async function websiteHasDraft(panel){
  const contents=panel?.view?.webContents;
  if(!contents||contents.isDestroyed())return false;
  if(contents.isLoadingMainFrame?.())throw Error('Wait for the website to finish loading before restarting.');
  try{const result=await bounded(contents.executeJavaScript(DRAFT_PROBE));if(typeof result!=='boolean')throw Error('Invalid website draft state');return result;}
  catch{throw Error('The website state could not be checked. Reload it before restarting.');}
}
async function freshActivity(panel){
  const activity=panel?.activity;if(!activity)return;
  const deadline=Date.now()+3000;
  while(activity.pending){if(Date.now()>=deadline)throw Error('The website is busy. Wait before restarting.');await new Promise(resolve=>setTimeout(resolve,20));}
  const fresh=await bounded(activity.poll(),Math.max(1,deadline-Date.now()));if(fresh!==true)throw Error('The website activity could not be checked. Reload it before restarting.');
}
module.exports={websiteHasDraft,freshActivity,DRAFT_PROBE};


