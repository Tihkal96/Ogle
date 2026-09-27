'use strict';
const keys=['shortcutVisibility','shortcutPanel','shortcutBar','shortcutChatTarget'];
class DockShortcuts {
  constructor(registry,actions){this.registry=registry;this.actions=actions;this.current={};}
  configure(settings){
    const next=Object.fromEntries(keys.map(key=>[key,settings[key] || '']));
    if(keys.every(key=>next[key]===this.current[key]))return;
    const active=Object.values(next).filter(Boolean);
    if(new Set(active.map(value=>value.toLowerCase())).size!==active.length)throw new Error('Choose different shortcuts for each action.');
    const previous=this.current;
    this.clear();
    try {for(const key of keys)if(next[key]&&!this.registry.register(next[key],this.actions[key]))throw new Error(`Shortcut ${next[key]} is already in use. Choose another.`);this.current=next;}
    catch(error){for(const value of active)this.registry.unregister(value);for(const key of keys)if(previous[key])this.registry.register(previous[key],this.actions[key]);this.current=previous;throw error;}
  }
  clear(){for(const value of Object.values(this.current))if(value)this.registry.unregister(value);}
  dispose(){this.clear();this.current={};}
}
module.exports={DockShortcuts};
