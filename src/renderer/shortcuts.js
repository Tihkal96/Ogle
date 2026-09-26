'use strict';
const ShortcutModel = {
  canMove(items, id, parentId) {
    if (!parentId) return true;
    const target = items.find(item => item.id === parentId);
    if (!target || target.kind !== 'group') return false;
    const seen = new Set([id]);
    let current = parentId;
    while (current) {
      if (seen.has(current)) return false;
      seen.add(current);
      current = items.find(item => item.id === current)?.parentId;
    }
    return true;
  },
  move(items, id, parentId, beforeId) {
    if (!this.canMove(items, id, parentId)) throw new Error('A group cannot contain itself or its parent.');
    const entry = items.find(item => item.id === id);
    if (!entry) return items;
    const result = items.filter(item => item.id !== id);
    const moved = { ...entry, parentId: parentId || null };
    const index = beforeId ? result.findIndex(item => item.id === beforeId && item.parentId === moved.parentId) : -1;
    result.splice(index < 0 ? result.length : index, 0, moved);
    return result;
  },
  remove(items, id) {
    const entry = items.find(item => item.id === id);
    return items.filter(item => item.id !== id).map(item => item.parentId === id ? { ...item, parentId: entry?.parentId || null } : item);
  }
};
if (typeof module !== 'undefined') module.exports = ShortcutModel;
if (typeof window !== 'undefined') window.PetDockShortcuts = (() => {
  function mount(root, api, settings, save, report, showPanel = () => {}) {
    let items = Array.isArray(settings.shortcuts) ? settings.shortcuts.map(item => ({ ...item })) : [];
    let mode = settings.shortcutsView === 'details' ? 'details' : 'icons';
    let dragging = null, currentGroup = null, folderNavigation = [], pinNotice = '';
    const pinStatus=document.createElement('p');pinStatus.className='links-pin-status';pinStatus.setAttribute('role','status');
    const iconCache = new Map(), refreshedIcons = new Set();
    const expanded = new Set(), cache = new Map();
    const toolbar = document.createElement('div'); toolbar.className = 'subtoolbar';
    const title = document.createElement('strong'); title.textContent = 'Links'; toolbar.append(title);
    const spacer = document.createElement('span'); spacer.className = 'spacer'; toolbar.append(spacer);
    const destination = document.createElement('select'); destination.setAttribute('aria-label', 'Add links to'); toolbar.append(destination);
    const form = document.createElement('form'); form.className = 'links-form'; form.hidden = true;
    const content = document.createElement('div'); content.className = 'links-content';
    const navigation = document.createElement('nav'); navigation.className = 'links-navigation'; navigation.setAttribute('aria-label', 'Link folder navigation');
    const rootDrop = document.createElement('div'); rootDrop.className = 'links-root-drop'; rootDrop.textContent = 'Top level · drop files, folders, URLs or links here'; rootDrop.tabIndex = 0;
    const invoke = fn => Promise.resolve().then(fn).catch(report);
    function button(label, handler, title) { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; if (title) el.title = title; el.onclick = () => invoke(handler); return el; }
    async function persist() { await save({ shortcuts: items, shortcutsView: mode }); }
    async function commit(next) { pinNotice=''; items = next; if (currentGroup && !items.some(item => item.id === currentGroup && item.kind === 'group')) currentGroup = null; await persist(); render(); refreshIcons().catch(report); }
    async function refreshIcons(paths = items.map(item => item.path).filter(Boolean)) {
      if (typeof api.shortcutIcons !== 'function') return;
      const pending = [...new Set(paths)].filter(value => !refreshedIcons.has(value));
      for (const value of pending) refreshedIcons.add(value);
      let changed = false;
      for (let offset = 0; offset < pending.length; offset += 64) {
        const response = await api.shortcutIcons(pending.slice(offset, offset + 64));
        for (const [target, icon] of Object.entries(response || {})) if (typeof icon === 'string' && /^data:image\//.test(icon)) { iconCache.set(target, icon); changed = true; }
      }
      if (changed) { items = items.map(item => iconCache.has(item.path) ? { ...item, icon: iconCache.get(item.path) } : item); await persist(); render(); }
    }
    async function togglePin(entry) {
      if(!entry.pinned && items.filter(item=>item.pinned).length>=5) {
        pinNotice='You can pin up to 5 links. Unpin one to add another.';pinStatus.textContent=pinNotice;return;
      }
      await commit(items.map(item=>item.id===entry.id?{...item,pinned:!item.pinned}:item));
    }
    async function openPinned(entry) {
      if(entry.kind==='group' || entry.kind==='folder') {
        showPanel();mode='icons';folderNavigation=[];
        if(entry.kind==='group')openGroup(entry.id);
        else {currentGroup=entry.parentId || null;await openFolder(entry);}
        return;
      }
      await api.openShortcut(entry.path);
    }
    function renderPins() {
      const tray=document.getElementById('pinned-links');if(!tray)return;
      tray.replaceChildren();
      for(const entry of items.filter(item=>item.pinned).slice(0,5)) {
        const name=entry.alias || entry.name;
        const pin=button('',()=>openPinned(entry),`${name}${entry.path?' — '+entry.path:''}`);
        pin.className='pinned-link';pin.dataset.linkId=entry.id;pin.setAttribute('aria-label',`Open ${name}`);
        pin.append(iconFor(entry));tray.append(pin);
      }
      tray.hidden=!tray.childElementCount;
      pinStatus.textContent=pinNotice || `${items.filter(item=>item.pinned).length} of 5 toolbar pins`;
    }
    function openGroup(id) { currentGroup = id; folderNavigation = []; form.hidden = true; render(); }
    async function openFolder(entry) {
      cache.set(entry.path, await api.readDirectory(entry.path));
      folderNavigation.push({ path: entry.path, name: entry.alias || entry.name }); form.hidden = true; render();
      await refreshIcons((cache.get(entry.path) || []).map(item => item.path));
    }
    function goBack() {
      if (folderNavigation.length) folderNavigation.pop();
      else currentGroup = items.find(item => item.id === currentGroup)?.parentId || null;
      render();
    }
    function field(label, value = '') { const wrapper = document.createElement('label'); wrapper.textContent = label; const input = document.createElement('input'); input.value = value; input.setAttribute('aria-label', label); wrapper.append(input); form.append(wrapper); return input; }
    function startForm() { form.replaceChildren(); form.hidden = false; }
    function finishForm(handler, label = 'Save') { const submit = button(label, handler); submit.dataset.submit = 'true'; form.append(submit, button('Cancel', () => { form.hidden = true; })); form.onsubmit = e => { e.preventDefault(); invoke(handler); }; }
    async function imported(payload, parentId = destination.value || null) {
      const result = await api.importShortcuts(payload);
      if (!Array.isArray(result)) throw new Error('Could not import these links.');
      await commit([...items, ...result.map(entry => ({ ...entry, id: entry.id || crypto.randomUUID(), parentId }))]);
    }
    function addForm() {
      startForm();
      const description = document.createElement('p'); description.textContent = 'Paste a local path or website address, or browse for an app, file or folder.'; form.append(description);
      form.append(button('Choose file or folder…', async () => {
        const result = await api.chooseShortcut(); if (!result) return;
        const values = Array.isArray(result) ? result : [result];
        await commit([...items, ...values.map(entry => ({ ...entry, id: entry.id || crypto.randomUUID(), parentId: destination.value || null }))]);
        form.hidden = true;
      }));
      const url = field('Path or URL'); url.placeholder = 'C:\\Projects or https://example.com';
      finishForm(async () => { if (!url.value.trim()) return; const value = url.value.trim(); await imported(/^https?:\/\//i.test(value) ? { paths: [], urls: [value] } : { paths: [value], urls: [] }); form.hidden = true; }, 'Add link'); url.focus();
    }
    function groupForm() { startForm(); const name = field('Group name'); finishForm(async () => { if (!name.value.trim()) return; await commit([...items, { id: crypto.randomUUID(), name: name.value.trim(), path: null, parentId: destination.value || null, kind: 'group' }]); form.hidden = true; }, 'Create group'); name.focus(); }
    function editForm(entry) {
      startForm(); const name = field(entry.kind === 'group' ? 'Group name' : 'Display name', entry.alias || entry.name);
      const target = entry.kind === 'group' ? null : field('Target path or URL', entry.path || '');
      const parent = document.createElement('select'); parent.setAttribute('aria-label', 'Move to group'); parent.add(new Option('Top level', ''));
      for (const item of items.filter(item => item.kind === 'group' && ShortcutModel.canMove(items, entry.id, item.id))) parent.add(new Option(item.alias || item.name, item.id));
      parent.value = entry.parentId || ''; form.append(parent);
      const reorder = async direction => {
        const siblings = items.filter(item => (item.parentId || null) === (entry.parentId || null));
        const index = siblings.findIndex(item => item.id === entry.id);
        if (index + direction < 0 || index + direction >= siblings.length) return;
        const before = direction < 0 ? siblings[index - 1]?.id : siblings[index + 2]?.id;
        await commit(ShortcutModel.move(items, entry.id, entry.parentId || null, before)); form.hidden = true;
      };
      form.append(button('Move up', () => reorder(-1)), button('Move down', () => reorder(1)));
      finishForm(async () => {
        if (!name.value.trim()) throw new Error('Enter a display name.');
        let next = { ...entry, name: name.value.trim(), alias: name.value.trim(), parentId: parent.value || null };
        if (target && target.value.trim() !== entry.path) {
          const value = target.value.trim();
          const result = await api.importShortcuts(/^https?:\/\//i.test(value) ? { paths: [], urls: [value] } : { paths: [value], urls: [] });
          if (!result?.[0]) throw new Error('Choose a valid target.');
          next = { ...result[0], ...next, path: result[0].path, kind: result[0].kind, icon: result[0].icon };
        }
        await commit(items.map(item => item.id === entry.id ? next : item)); form.hidden = true;
      }); name.focus();
    }
    toolbar.append(button('＋ Add', addForm), button('＋ Group', groupForm));
    toolbar.append(button('↻', async () => { refreshedIcons.clear(); await refreshIcons([...items.map(item => item.path).filter(Boolean), ...[...cache.values()].flat().map(item => item.path)]); }, 'Refresh shortcut icons'));
    const view = button(mode === 'icons' ? 'Details' : 'Icons', async () => { mode = mode === 'icons' ? 'details' : 'icons'; folderNavigation = []; await persist(); render(); }); view.setAttribute('aria-label', 'Toggle link view'); toolbar.append(view);
    function dropTarget(element, parentId, beforeId) {
      element.addEventListener('dragover', event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = dragging ? 'move' : 'copy'; element.classList.add('drop-over'); });
      element.addEventListener('dragleave', () => element.classList.remove('drop-over'));
      element.addEventListener('drop', event => {
        event.preventDefault(); event.stopPropagation(); element.classList.remove('drop-over');
        if (mode === 'icons' && folderNavigation.length) { report(new Error('Return to a link group before adding shortcuts.')); return; }
        const transfer = event.dataTransfer;
        const resolvedParent = typeof parentId === 'function' ? parentId() : parentId;
        const id = transfer.getData('application/x-petdock-link') || dragging;
        if (id) { dragging = null; invoke(() => commit(ShortcutModel.move(items, id, resolvedParent, beforeId))); return; }
        // Resolve real File objects synchronously while the drop event is active.
        let paths;
        try { paths = api.droppedPaths ? api.droppedPaths(Array.from(transfer.files)) : []; }
        catch (error) { report(error); return; }
        const raw = transfer.getData('text/uri-list') || transfer.getData('text/plain');
        const urls = raw.split(/\r?\n/).map(value => value.trim()).filter(value => /^https?:\/\//i.test(value));
        invoke(async () => { const resolved = await paths; if (resolved.length || urls.length) await imported({ paths: resolved, urls }, resolvedParent); });
      });
    }
    dropTarget(rootDrop, () => mode === 'icons' ? currentGroup : null);
    async function browse(entry) {
      if (expanded.has(entry.path)) expanded.delete(entry.path);
      else { cache.set(entry.path, await api.readDirectory(entry.path)); expanded.add(entry.path); }
      render();
    }
    function folderTree(folder) {
      const tree = document.createElement('div'); tree.className = 'links-folder-tree';
      for (const child of cache.get(folder) || []) {
        const childRow = document.createElement('div');
        childRow.append(button((child.isDirectory ? '📁 ' : '▤ ') + child.name, () => api.openShortcut(child.path), child.path));
        if (child.isDirectory) childRow.append(button(expanded.has(child.path) ? '▾' : '▸', () => browse(child), 'Browse folder'));
        tree.append(childRow);
        if (child.isDirectory && expanded.has(child.path)) tree.append(folderTree(child.path));
      }
      if (!tree.childElementCount) tree.textContent = 'Empty folder';
      return tree;
    }
    function iconFor(entry) {
      const icon = document.createElement('span'); icon.className = 'links-icon';
      icon.textContent = entry.kind === 'group' ? '▦' : entry.kind === 'folder' ? '📁' : entry.kind === 'url' ? '↗' : '▤';
      const image = iconCache.get(entry.path) || entry.icon;
      if (image && /^data:image\//.test(image)) { const img = document.createElement('img'); img.src = image; img.alt = ''; icon.replaceChildren(img); }
      if (entry.kind === 'group' && mode === 'icons') {
        const children = items.filter(item => item.parentId === entry.id).slice(0, 4);
        if (children.length) { icon.classList.add('links-group-icon'); icon.replaceChildren(); for (const child of children) { const miniature = document.createElement('span'), source = iconCache.get(child.path) || child.icon; if (source && /^data:image\//.test(source)) { const img = document.createElement('img'); img.src = source; img.alt = ''; miniature.append(img); } else miniature.textContent = child.kind === 'group' ? '▦' : child.kind === 'folder' ? '📁' : child.kind === 'url' ? '↗' : '▤'; icon.append(miniature); } }
      }
      return icon;
    }
    function row(entry, ancestry = new Set(), filesystemEntry = false) {
      if (ancestry.has(entry.id)) return document.createElement('span');
      const branch = new Set(ancestry); branch.add(entry.id);
      const wrapper = document.createElement('div'); wrapper.className = 'links-entry'; wrapper.dataset.id = entry.id;
      const line = document.createElement('div'); line.className = 'links-row'; line.draggable = !filesystemEntry;
      line.addEventListener('dragstart', event => { dragging = entry.id; event.dataTransfer.setData('application/x-petdock-link', entry.id); event.dataTransfer.effectAllowed = 'move'; });
      line.addEventListener('dragend', () => { dragging = null; document.querySelectorAll('.drop-over').forEach(el => el.classList.remove('drop-over')); });
      if (!filesystemEntry) dropTarget(line, entry.kind === 'group' ? entry.id : entry.parentId || null, entry.kind === 'group' ? null : entry.id);
      const open = button('', () => entry.kind === 'group' ? (mode === 'icons' ? openGroup(entry.id) : editForm(entry)) : entry.kind === 'folder' && mode === 'icons' ? openFolder(entry) : api.openShortcut(entry.path), entry.path || 'Open group'); open.className = 'links-open';
      const icon = iconFor(entry);
      const label = document.createElement('span'); label.className = 'links-label'; const name = document.createElement('strong'); name.textContent = entry.alias || entry.name; const target = document.createElement('small'); target.textContent = entry.path || 'Group · drop links here'; label.append(name, target); open.append(icon, label); line.append(open);
      if (entry.kind === 'folder' && mode === 'details') line.append(button(expanded.has(entry.path) ? '▾' : '▸', () => browse(entry), 'Browse folder'));
      if (!filesystemEntry) {
        const actions = document.createElement('span'); actions.className = 'links-entry-actions';
        const pin=button(entry.pinned?'◆':'◇',()=>togglePin(entry),entry.pinned?'Unpin from toolbar':'Pin to toolbar');pin.className='links-pin';pin.setAttribute('aria-pressed',String(Boolean(entry.pinned)));pin.setAttribute('aria-label',`${entry.pinned?'Unpin':'Pin'} ${entry.alias || entry.name} ${entry.pinned?'from':'to'} toolbar`);actions.append(pin);
        actions.append(button('✎', () => editForm(entry), 'Rename or edit target'), button('×', () => commit(ShortcutModel.remove(items, entry.id)), entry.kind === 'group' ? 'Remove group; keep its contents in the parent group' : 'Remove link')); line.append(actions);
        line.addEventListener('contextmenu', event => { event.preventDefault(); editForm(entry); });
      }
      wrapper.append(line);
      if (entry.kind === 'group' && mode === 'details') {
        const children = document.createElement('div'); children.className = 'links-children'; dropTarget(children, entry.id);
        for (const child of items.filter(item => item.parentId === entry.id)) children.append(row(child, branch));
        if (!children.childElementCount) { const empty = document.createElement('small'); empty.textContent = 'Drop links into this group'; children.append(empty); }
        wrapper.append(children);
      }
      if (entry.kind === 'folder' && mode === 'details' && expanded.has(entry.path)) {
        wrapper.append(folderTree(entry.path));
      }
      return wrapper;
    }
    function render() {
      renderPins();
      const selected = mode === 'icons' ? currentGroup || '' : destination.value; destination.replaceChildren(new Option('Top level', ''));
      for (const item of items.filter(item => item.kind === 'group')) destination.add(new Option(item.alias || item.name, item.id)); destination.value = selected;
      navigation.replaceChildren(); navigation.hidden = mode !== 'icons';
      if (mode === 'icons') {
        if (currentGroup || folderNavigation.length) navigation.append(button('← Back', goBack));
        navigation.append(button('All links', () => openGroup(null)));
        const ancestry = [], seen = new Set(); let group = items.find(item => item.id === currentGroup);
        while (group && !seen.has(group.id)) { ancestry.unshift(group); seen.add(group.id); group = items.find(item => item.id === group.parentId); }
        for (const ancestor of ancestry) navigation.append(button(ancestor.alias || ancestor.name, () => openGroup(ancestor.id)));
        for (const [index, folder] of folderNavigation.entries()) navigation.append(button(folder.name, () => { folderNavigation = folderNavigation.slice(0, index + 1); render(); }, folder.path));
        if (folderNavigation.length) navigation.append(button('Open in Explorer ↗', () => api.openShortcut(folderNavigation.at(-1).path)));
      }
      content.className = `links-content links-${mode}`; view.textContent = mode === 'icons' ? 'Details' : 'Icons'; content.replaceChildren();
      if (mode !== 'icons' || !folderNavigation.length) { rootDrop.textContent = currentGroup && mode === 'icons' ? 'Drop apps, files or links into this group' : 'Drop apps, files, folders or website links here'; content.append(rootDrop); }
      let visible;
      if (mode === 'icons' && folderNavigation.length) visible = (cache.get(folderNavigation.at(-1).path) || []).map(child => ({ ...child, id: child.path, kind: child.isDirectory ? 'folder' : 'file' }));
      else visible = items.filter(item => mode === 'icons' && currentGroup ? item.parentId === currentGroup : !item.parentId || !items.some(parent => parent.id === item.parentId && parent.kind === 'group'));
      for (const entry of visible) content.append(row(entry, new Set(), mode === 'icons' && folderNavigation.length > 0));
      if (!visible.length) { const empty = document.createElement('p'); empty.className = 'links-empty'; empty.textContent = folderNavigation.length ? 'This folder is empty.' : currentGroup ? 'This group is empty. Add or drop links here.' : 'Drop apps, files, folders or website links here. Groups keep related links together.'; content.append(empty); }
    }
    dropTarget(content, () => mode === 'icons' ? currentGroup : null);
    root.addEventListener('keydown', event => { if (event.key === 'Escape' && mode === 'icons' && (currentGroup || folderNavigation.length) && !event.target.matches('input,select,textarea')) { event.preventDefault(); goBack(); } });
    root.append(toolbar, pinStatus, form, navigation, content); render(); refreshIcons().catch(report);
  }
  return { mount };
})();
