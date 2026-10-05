'use strict';
// Account-provided model catalog. Load once; native menus must not be rebuilt while open.
window.OgleCodexModels = {
  create({modelSelect, effortSelect, api, onChange = () => {}, onError = () => {}, value = {}}) {
    let models = [], selected = {...value}, loading, loaded = false, threadId, overridden = false;
    const signatures = new Map(), pending = new Set();
    const option = (text, value, title = '') => {const node = document.createElement('option'); node.textContent = text; node.value = value; node.title = title; return node;};
    function populate(control, choices, chosen, disabled = false) {
      const signature = JSON.stringify(choices);
      if (document.activeElement === control && (signatures.get(control) !== signature || control.value !== (chosen || ''))) {pending.add(control); return;}
      if (signatures.get(control) !== signature) {
        control.replaceChildren(...choices.map(([label,value,title]) => option(label,value,title)));
        signatures.set(control, signature);
      }
      control.value = chosen || ''; control.disabled = disabled;
    }
    function render() {
      const modelChoices = [['Task model',''], ...models.map(model => [model.displayName || model.model,model.model])];
      if (selected.model && !models.some(model => model.model === selected.model)) modelChoices.push([selected.model,selected.model]);
      populate(modelSelect, modelChoices, selected.model);
      const model = models.find(model => model.model === selected.model);
      const efforts = model?.supportedReasoningEfforts || [];
      const choices = [['Default effort',''],...efforts.map(effort => [effort.reasoningEffort,effort.reasoningEffort,effort.description || ''])];
      // Preserve a desktop setting even when a stale catalog does not contain it.
      if(selected.effort && !efforts.some(effort => effort.reasoningEffort === selected.effort)) choices.push([selected.effort,selected.effort]);
      populate(effortSelect, choices, selected.effort, !model && !selected.model);
    }
    for(const control of [modelSelect,effortSelect]) control.addEventListener('blur',()=>{if(pending.delete(control))render();});
    modelSelect.title = 'Model for the next prompt; Task model keeps the conversation settings';
    effortSelect.title = 'Reasoning effort for the next prompt; does not change a running turn';
    modelSelect.addEventListener('change', () => {overridden = true; selected = {model:modelSelect.value, effort:''}; render(); onChange({...selected});});
    effortSelect.addEventListener('change', () => {overridden = true; selected.effort = effortSelect.value; onChange({...selected});});
    render();
    return {
      load({force = false} = {}) {
        if (loading) return loading;
        if (loaded && !force) return Promise.resolve();
        loading = Promise.resolve().then(()=>api.listModels()).then(result => {models = result.data || []; loaded = true; render();}).catch(error => {onError(error);}).finally(() => {loading = null;});
        return loading;
      },
      setValue(next) {selected = {...next}; overridden = false; render();},
      setThreadValue({threadId:id,model,effort} = {}) {
        const next = {model,effort};
        if(threadId !== id) {threadId = id; overridden = false; selected = {...next}; render();}
        else if(!overridden) {selected = {...next}; render();}
      },
      getOptions() {
        const model = models.find(item => item.model === selected.model);
        const effort = selected.effort || model?.defaultReasoningEffort;
        return {...(selected.model ? {model:selected.model} : {}), ...(effort ? {effort} : {})};
      }
    };
  }
};
