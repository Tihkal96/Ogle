'use strict';
function registerWorkspace({register,dialog,window,backups,apply}){
  const detail=summary=>`${summary.editorTabs} editor tabs, ${summary.drafts} drafts, ${summary.links} Links, ${summary.noteCharacters} note characters.`;
  let transaction=Promise.resolve();
  function transact(run){const result=transaction.then(run);transaction=result.catch(()=>{});return result;}
  async function applyTransaction(result){
    try{await apply(result.settings);return result;}
    catch(error){
      if(result.rollbackToken){const previous=await backups.rollbackAsync(result.rollbackToken);await apply(previous.settings);}
      throw error;
    }
  }
  register('workspaceExport',async snapshot=>{
    const choice=await dialog.showSaveDialog(window,{title:'Export Ogle workspace',defaultPath:'Ogle-workspace.json',filters:[{name:'Ogle workspace',extensions:['json']}]});
    return choice.canceled?{cancelled:true}:backups.exportToAsync(choice.filePath,snapshot);
  });
  register('workspaceImport',()=>transact(async()=>{
    const choice=await dialog.showOpenDialog(window,{title:'Import Ogle workspace',properties:['openFile'],filters:[{name:'Ogle workspace',extensions:['json']}]});
    if(choice.canceled)return{cancelled:true};
    const preview=await backups.previewFileAsync(choice.filePaths[0]);
    const answer=await dialog.showMessageBox(window,{type:'question',message:'Restore this workspace?',detail:detail(preview.summary)+'\nYour current workspace will be saved as a recovery copy. Imported editor tabs open as unsaved copies; sign-ins stay on this PC.',buttons:['Cancel','Restore'],defaultId:0,cancelId:0});
    if(answer.response!==1)return{cancelled:true};
    return applyTransaction(await backups.importPreviewAsync(preview.token));
  }));
  register('workspaceSnapshot',()=>backups.snapshotAsync());
  register('workspaceSnapshots',()=>backups.listSnapshotsAsync());
  register('workspaceRestore',token=>transact(async()=>{
    const list=await backups.listSnapshotsAsync(),selected=list.snapshots.find(snapshot=>snapshot.token===token);
    if(!selected)throw Error('This recovery copy is no longer available.');
    const answer=await dialog.showMessageBox(window,{type:'question',message:'Restore this recovery copy?',detail:detail(selected.summary)+'\nA recovery copy of the current workspace will be kept.',buttons:['Cancel','Restore'],defaultId:0,cancelId:0});
    if(answer.response!==1)return{cancelled:true};
    return applyTransaction(await backups.rollbackAsync(token));
  }));
}
module.exports={registerWorkspace};
