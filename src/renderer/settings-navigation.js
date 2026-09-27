'use strict';
window.OgleSettingsNavigation = (() => {
  function mount(root) {
    const sections=[...root.querySelectorAll('.settings-section')];
    const nav=document.createElement('div');nav.className='settings-navigation';nav.setAttribute('role','search');nav.setAttribute('aria-label','Find settings');
    const search=document.createElement('input');search.type='search';search.placeholder='Find a setting…';search.setAttribute('aria-label','Search settings');
    const jump=document.createElement('select');jump.setAttribute('aria-label','Jump to settings section');
    const clear=document.createElement('button');clear.type='button';clear.textContent='×';clear.title='Clear settings search';clear.setAttribute('aria-label',clear.title);clear.hidden=true;
    const status=document.createElement('p');status.className='settings-search-status';status.setAttribute('role','status');status.hidden=true;
    nav.append(search,jump,clear);root.querySelector('h1').after(nav,status);
    function filter() {
      const words=search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const visible=sections.filter(section=>{
        const text=[section.textContent,...[...section.querySelectorAll('input')].map(input=>[input.placeholder,input.getAttribute('aria-label')].join(' '))].join(' ').toLocaleLowerCase();
        section.hidden=!words.every(word=>text.includes(word));return !section.hidden;
      });
      jump.replaceChildren(new Option('Jump to section…',''));
      for(const section of visible)jump.add(new Option(section.querySelector('h2').textContent,String(sections.indexOf(section))));
      jump.disabled=!visible.length;clear.hidden=!search.value;status.hidden=!words.length;
      status.textContent=visible.length?`${visible.length} matching ${visible.length===1?'section':'sections'}`:'No settings found. Try another word or clear the search.';
    }
    search.addEventListener('input',filter);
    nav.addEventListener('keydown',event=>{if(event.key==='Escape'&&search.value){event.preventDefault();event.stopPropagation();search.value='';filter();search.focus();}});
    clear.onclick=()=>{search.value='';filter();search.focus();};
    jump.onchange=()=>{if(jump.value==='')return;const section=sections[Number(jump.value)];section.scrollIntoView({block:'start'});const heading=section.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});};
    filter();
  }
  return {mount};
})();
