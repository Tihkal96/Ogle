(() => {
  'use strict';
  const MAX_COUNT = 4, MAX_EACH = 8 * 1024 * 1024, MAX_TOTAL = 16 * 1024 * 1024;
  const buckets = new Map();
  const inputImages = new WeakMap();
  let composer, tray, errorBox, picker, attachButton, callback = () => {}, context = '', version = 0;
  const bucket = key => { if (!buckets.has(key)) buckets.set(key, { images: [], pending: 0, error: '', version: 0, allowFiles: false }); return buckets.get(key); };
  const current = () => bucket(context);
  function notify() { render(); callback({ count: current().images.length, busy: current().pending > 0 }); }
  function render() {
    if (!tray) return;
    tray.replaceChildren();
    const state = current();
    if(picker)picker.accept=state.allowFiles?'':'.png,.jpg,.jpeg,.webp';
    if(attachButton){attachButton.title=state.allowFiles?'Attach files or images':'Attach images';attachButton.setAttribute('aria-label',attachButton.title);}
    for (const [index, attachment] of state.images.entries()) {
      const card = document.createElement('div');
      Object.assign(card.style, { position: 'relative', width: '72px', height: '64px', flex: '0 0 auto', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden', background: 'var(--surface)' });
      const image = document.createElement(attachment.type==='image'?'img':'span');
      if(attachment.type==='image'){image.src=attachment.url;image.alt=attachment.name||`Attached image ${index+1}`;}else{image.textContent='▤ '+attachment.name;Object.assign(image.style,{display:'block',fontSize:'10px',padding:'22px 4px 4px',overflowWrap:'anywhere'});}
      card.title=attachment.name;
      Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'contain' });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Ã—'; remove.title = `Remove ${attachment.name || `attachment ${index + 1}`}`; remove.setAttribute('aria-label', remove.title);
      Object.assign(remove.style, { position: 'absolute', right: '2px', top: '2px', width: '22px', height: '22px', padding: '0', background: 'var(--raised)', color: 'var(--text)', fontSize: '18px', lineHeight: '20px' });
      remove.onclick = () => { state.images.splice(index, 1); state.error = ''; notify(); };
      card.append(image, remove); tray.append(card);
    }
    if (state.pending) { const loading = document.createElement('span'); loading.textContent = 'Reading pasted imageâ€¦'; loading.style.color = 'var(--muted)'; loading.style.fontSize = '11px'; tray.append(loading); }
    tray.hidden = !state.images.length && !state.pending;
    errorBox.textContent = state.error; errorBox.hidden = !state.error;
  }
  async function readImage(file, allowFiles) {
    const isImage=['image/png','image/jpeg','image/webp'].includes(file.type);
    if (!allowFiles && !isImage) throw new Error('Paste PNG, JPEG, or WebP images.');
    if (file.size > MAX_EACH) throw new Error('Each attachment must be 8 MB or smaller.');
    const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read the attachment.')); reader.readAsDataURL(file); });
    const metadata={name:file.name||'attachment',mimeType:file.type||'application/octet-stream',bytes:file.size};
    if(!isImage)return {type:'file',url,...metadata};
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Could not decode the pasted image.')); image.src = url; });
    if (image.naturalWidth > 16384 || image.naturalHeight > 16384 || image.naturalWidth * image.naturalHeight > 40e6) throw new Error('Image is too large: maximum 40 megapixels.');
    return { type: 'image', url, ...metadata };
  }
  function paste(event) {
    const files=Array.from(event.clipboardData?.items||[]).filter(item=>item.kind==='file'&&(current().allowFiles||item.type.startsWith('image/'))).map(item=>item.getAsFile()).filter(Boolean);
    if(!files.length)return;
    event.preventDefault();addFiles(files);
  }
  function dragover(event){if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();}
  function drop(event){const files=Array.from(event.dataTransfer?.files||[]);if(!files.length)return;event.preventDefault();event.stopPropagation();addFiles(files);}
  function addFiles(files) {
    const key = context, state = bucket(key), revision = state.version;
    state.error = '';
    if (state.images.length + state.pending + files.length > MAX_COUNT) { state.error = 'Attach up to 4 items. Remove one before adding more.'; notify(); return; }
    state.pending += files.length; notify();
    for (const file of files) readImage(file,state.allowFiles).then(image => {
      if (state.version !== revision) return;
      if (state.images.reduce((sum, image) => sum + image.bytes, 0) + image.bytes > MAX_TOTAL) throw new Error('Attachments must total 16 MB or less.');
      state.images.push(image);
    }).catch(error => { if (state.version === revision) state.error = error.message; }).finally(() => { if (state.version === revision) state.pending--; if (context === key) notify(); });
  }
  function mount(element, onChange = () => {}) {
    if(composer){composer.removeEventListener('paste',paste);composer.removeEventListener('dragover',dragover);composer.removeEventListener('drop',drop);}
    composer = element; callback = onChange;
    tray?.remove(); errorBox?.remove(); picker?.remove(); attachButton?.remove();
    tray = document.createElement('div'); tray.className = 'attachment-previews'; tray.setAttribute('aria-label', 'Attachments');
    Object.assign(tray.style, { display: 'flex', gap: '7px', alignItems: 'center', overflowX: 'auto', padding: '6px 0' });
    errorBox = document.createElement('div'); errorBox.className = 'attachment-error'; errorBox.setAttribute('role', 'alert');
    Object.assign(errorBox.style, { color: 'var(--danger)', fontSize: '11px', padding: '4px 0' });
    const row = composer.querySelector('.compose-row'); composer.insertBefore(tray, row); composer.insertBefore(errorBox, row);
    picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.hidden=true;picker.className='attachment-picker';
    picker.onchange=()=>{addFiles(Array.from(picker.files||[]));picker.value='';};
    attachButton=document.createElement('button');attachButton.type='button';attachButton.className='attachment-add icon';attachButton.textContent='＋';attachButton.onclick=()=>picker.click();
    row.prepend(attachButton);composer.append(picker);
    composer.addEventListener('paste',paste);composer.addEventListener('dragover',dragover);composer.addEventListener('drop',drop);notify();
  }
  function clear(key = context, sentInputs) {
    const state = bucket(key);
    if (Array.isArray(sentInputs)) {
      const sent = new Set(sentInputs.map(input => inputImages.get(input)).filter(Boolean));
      state.images = state.images.filter(image => !sent.has(image));
    } else { state.version = ++version; state.images = []; state.pending = 0; }
    state.error = ''; if (context === key) notify();
  }
  window.PetDockAttachments = {
    mount, clear,
    setContext(key = '', {allowFiles=false}={}) { context=String(key||'');current().allowFiles=Boolean(allowFiles);notify(); },
    getInputs() { return current().images.map(image => { const input = { type: image.type, url: image.url, ...(current().allowFiles?{name:image.name,mimeType:image.mimeType}:{}) }; inputImages.set(input, image); return input; }); },
    hasImages() { return current().images.length > 0; },
    hasAttachments() { return current().images.length > 0; },
    isBusy() { return current().pending > 0; }
  };
})();
