import { describe,it,expect,beforeEach } from 'vitest';
import { normalizeLabels,initLabels } from '../src/js/labels.js';
import { NoteStore } from '../src/js/notes.js';
import { toNebulaNote } from '../src/js/export.js';
import { noteFromFile } from '../src/js/import.js';
beforeEach(()=>{localStorage.clear();document.body.innerHTML='';});
describe('note labels',()=>{
  it('normalizes names and rejects invalid values and duplicates',()=>{
    expect(normalizeLabels([' #Work ','work',null,{},'  two   words ','#'])).toEqual(['Work','two words']);
    expect(normalizeLabels('work')).toEqual([]);
    expect(normalizeLabels(Array.from({length:30},(_,i)=>'label'+i))).toHaveLength(20);
  });
  it('persists labels and searches them without reordering the note',()=>{
    const store=new NoteStore({allowSeed:false});const n=store.createNote('First');const time=n.updatedAt;
    store.setLabels(n.id,['work']);expect(n.updatedAt).toBe(time);
    expect(new NoteStore({allowSeed:false}).get(n.id).labels).toEqual(['work']);
    expect(store.filter('#work').map(n=>n.id)).toEqual([n.id]);
    store.setLabels(n.id,[]);expect(store.filter('#work')).toHaveLength(0);
  });
  it('round-trips labels in native export with safe imported content',()=>{
    const json=toNebulaNote({title:'Tagged',content:'<p>Keep</p><script>bad()</script>',labels:['Work','work']});
    const n=noteFromFile('note.nebula.json',json);expect(n.labels).toEqual(['Work']);expect(n.content).toBe('<p>Keep</p>');
  });
  it('the picker edits the chosen note even when another note is open',()=>{
    document.body.innerHTML='<div id="note-labels"></div><button id="anchor"></button>';
    const store=new NoteStore({allowSeed:false});const target=store.createNote('Target');const active=store.createNote('Active');
    const labels=initLabels(store);labels.open(target.id,document.getElementById('anchor'));
    const input=document.querySelector('#label-search');input.value='work';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    expect(store.get(target.id).labels).toEqual(['work']);expect(store.get(active.id).labels).toBeUndefined();
    expect(document.querySelector('#note-labels').textContent).not.toContain('work');
    input.value='missing';input.dispatchEvent(new Event('input'));expect(document.querySelectorAll('.label-options input')).toHaveLength(0);
  });
});
