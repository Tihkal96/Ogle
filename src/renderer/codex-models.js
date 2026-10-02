'use strict';
// Account-provided model catalog. No hard-coded model names or effort levels.
window.OgleCodexModels = {
  create({modelSelect, effortSelect, api, onChange = () => {}, onError = () => {}, value = {}}) {
    let models = [], selected = {...value}, loading;
    const option = (text, value) => {const node = document.createElement('option'); node.textContent = text; node.value = value; return node;};
    function render() {
      modelSelect.replaceChildren(option('Task model', ''));
      for (const model of models) modelSelect.append(option(model.displayName || model.model, model.model));
      // Keep saved choices visible when offline, without inventing model support.
      if (selected.model && !models.some(model => model.model === selected.model)) modelSelect.append(option(selected.model + ' (unavailable)', selected.model));
      modelSelect.value = selected.model || '';
      const model = models.find(model => model.model === selected.model);
      effortSelect.replaceChildren(option('Default effort', ''));
      for (const effort of model?.supportedReasoningEfforts || []) {
        const node = option(effort.reasoningEffort, effort.reasoningEffort); node.title = effort.description || ''; effortSelect.append(node);
      }
      if (selected.effort && model?.supportedReasoningEfforts?.some(effort => effort.reasoningEffort === selected.effort)) effortSelect.value = selected.effort;
      else {if (model) selected.effort = ''; effortSelect.value = '';}
      effortSelect.disabled = !model;
      modelSelect.title = 'Model for the next prompt; Task model keeps the conversation settings';
      effortSelect.title = 'Reasoning effort for the next prompt; does not change a running turn';
    }
    modelSelect.addEventListener('change', () => {selected = {model:modelSelect.value, effort:''}; render(); onChange({...selected});});
    effortSelect.addEventListener('change', () => {selected.effort = effortSelect.value; onChange({...selected});});
    render();
    return {
      load() {
        if (loading) return loading;
        loading = api.listModels().then(result => {models = result.data || []; render();}).catch(error => {onError(error);}).finally(() => {loading = null;});
        return loading;
      },
      setValue(next) {selected = {...next}; render();},
      getOptions() {
        const model = models.find(item => item.model === selected.model);
        const effort = selected.effort || model?.defaultReasoningEffort;
        return {...(selected.model ? {model:selected.model} : {}), ...(effort ? {effort} : {})};
      }
    };
  }
};
