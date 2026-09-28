import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runV090Checks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-v090-'));
  const notes = path.join(profile, 'storage/notes');
  fs.mkdirSync(notes, {recursive:true});
  const shape = (kind, extra = '') => `<div class="shape ${kind} ${extra}" data-kind="${kind}" style="left:60px;top:40px;width:160px;height:100px;--shape-fill:#E8CDBD"><div class="shape-text" contenteditable="false">Words inside the shape must remain within its outline while typing more words.</div><span class="shape-h"></span><span class="shape-rot"></span></div>`;
  const seed = (id, content, readOnly = false) => fs.writeFileSync(path.join(notes,id+'.json'), JSON.stringify({id,title:id,content,readOnly,createdAt:1,updatedAt:1}));
  seed('locked', `<div class="shape-layer shape-layer--behind" contenteditable="false">${shape('rect','behind')}</div>` + '<p>Words over the shape</p>'.repeat(50), true);
  for(const kind of ['triangle','diamond','square']) seed(kind, `<div class="shape-layer" contenteditable="false">${shape(kind)}</div>` + '<p><br></p>'.repeat(60));
  seed('deletion', '<p>Above</p><hr class="blk-hr"><p>Selected words</p><figure class="note-image behind" contenteditable="false" style="left:20px;top:300px;width:100px;height:60px"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="><figcaption class="image-caption" contenteditable="true">Caption text</figcaption></figure>');
  const originals = (JSON.parse(process.env.NEBULA_V090_NOTES || '[]')).map(file => ({file,bytes:fs.readFileSync(file)}));
  originals.forEach(({bytes},i) => {const n=JSON.parse(bytes);seed('report-'+i,n.content);});
  const server=http.createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{Location:'https://accounts.google.com/signin'});res.end();}else{res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Local preview title</title><p>Loaded</p>');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let app;
  try {
    app = await electron.launch({args:[path.join(root,'dist-electron/main.js')],env:{...process.env,NEBULA_USER_DATA:profile}});
    const win = await app.firstWindow();
    win.setDefaultTimeout(10000);
    await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows()[0].setSize(1400,1000);dialog.showMessageBox=async()=>({response:0});});
    const errors=[]; win.on('pageerror',e=>errors.push(e.message));
    await win.waitForFunction(()=>document.querySelector('.note-row'),null,{polling:50});
    await win.evaluate(()=>document.querySelector('#whats-new-close')?.click());
    const open = async title => {
      await win.evaluate(t=>[...document.querySelectorAll('.note-row')].find(e=>e.querySelector('.nr-title')?.textContent===t)?.click(),title);
      await win.waitForFunction(t=>document.querySelector('#title').value===t,title,{polling:50});
    };
    const selectText = async (selector,start=0,end=null) => win.evaluate(({selector,start,end})=>{
      const el=document.querySelector(selector);el.focus({preventScroll:true});
      const n=el.firstChild,r=document.createRange();r.setStart(n,start);r.setEnd(n,end??start);
      getSelection().removeAllRanges();getSelection().addRange(r);
    },{selector,start,end});
    await open('locked');
    const before=await win.locator('#editor .shape').getAttribute('style');
    const point=await win.evaluate(()=>{const r=document.querySelector('#editor .shape').getBoundingClientRect();return {x:r.left+40,y:r.top+20};});
    // Target the prose over the buried shape, exactly the path the lock used to miss.
    await win.evaluate(p=>document.querySelector('#editor p').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:p.x,clientY:p.y})),point);
    await win.mouse.move(point.x+75,point.y+40);await win.mouse.up();
    check('locked behind-text shape cannot be moved through prose hit testing',before===await win.locator('#editor .shape').getAttribute('style'));
    check('locked behind-text shape has no selection toolbar',await win.locator('#shape-bar').getAttribute('hidden')!==null);
    for(const kind of ['triangle','diamond']) {
      await open(kind);
      const contained=await win.evaluate(kind=>{
        const s=document.querySelector('#editor .shape'),t=s.querySelector('.shape-text');
        const r=s.getBoundingClientRect(),b=t.getBoundingClientRect();
        const corners=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]];
        return {ok:corners.every(([x,y])=>{x=(x-r.left)/r.width;y=(y-r.top)/r.height;return kind==='diamond'?Math.abs(x-.5)*2+Math.abs(y-.5)*2<=1.03:y>=Math.abs(x-.5)*2-.01&&y<=1.01;}),width:r.width,height:r.height,textHeight:b.height};
      },kind);
      check(kind+' text corners remain inside its silhouette on old-note load',contained.ok,JSON.stringify(contained));
    }
    await open('triangle');
    await win.evaluate(()=>{
      document.querySelector('[data-arrow-add="straight"]').click();
      const a=document.querySelector('#editor .note-arrow'),shape=document.querySelector('#editor .shape');
      shape.dataset.anchor ||= 'triangle-test-anchor';a.dataset.to=shape.dataset.anchor;a.dataset.x1='450';a.dataset.y1='160';
      document.getElementById('editor').dispatchEvent(new Event('input',{bubbles:true}));
    });
    await open('diamond');await open('triangle');
    const triangleEdge=()=>win.evaluate(()=>{
      const a=document.querySelector('#editor .note-arrow'),shape=document.querySelector('#editor .shape'),layer=a.closest('.shape-layer').getBoundingClientRect(),r=shape.getBoundingClientRect();
      const x=(Number(a.dataset.x2)+layer.left-r.left)/r.width,y=(Number(a.dataset.y2)+layer.top-r.top)/r.height;
      return {attached:a.dataset.to===shape.dataset.anchor,onEdge:Math.min(Math.abs(y-Math.abs(x-.5)*2),Math.abs(y-1))<.02,height:r.height,scroll:document.getElementById('editor').scrollTop,x,y};
    });
    const edgeBefore=await triangleEdge();
    check('a loaded arrow meets the triangle outline',edgeBefore.attached&&edgeBefore.onEdge,JSON.stringify(edgeBefore));
    await win.evaluate(()=>{
      const shape=document.querySelector('#editor .shape');shape.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
      const text=shape.querySelector('.shape-text');const range=document.createRange();range.selectNodeContents(text);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);
    });
    const scrollBefore=await win.evaluate(()=>document.getElementById('editor').scrollTop);
    await win.keyboard.insertText(' Extra words that require more room inside the triangle, with its arrow still attached.');
    const edgeAfter=await triangleEdge();
    check('typing grows the triangle and its arrow follows the outline',edgeAfter.height>edgeBefore.height&&edgeAfter.attached&&edgeAfter.onEdge,JSON.stringify(edgeAfter));
    check('shape growth preserves editor scroll position',Math.abs(edgeAfter.scroll-scrollBefore)<2,JSON.stringify({scrollBefore,after:edgeAfter.scroll}));
    await win.screenshot({path:path.join(root,'test-results/v090-triangle.png')});
    await open('deletion');
    await selectText('#editor p:nth-of-type(2)',0,14);
    await win.keyboard.press('Backspace');
    check('Backspace deletes selected text after a divider immediately',await win.evaluate(()=>!document.querySelector('#editor').textContent.includes('Selected words')&&!document.querySelector('#editor hr.armed')));
    await selectText('#editor .image-caption',12);
    await win.keyboard.press('Backspace');
    check('Backspace edits a floating image caption',await win.locator('#editor .image-caption').textContent()==='Caption tex');
    await win.keyboard.press('Control+z');
    check('caption deletion is undoable',await win.locator('#editor .image-caption').textContent()==='Caption text');
    await open('square');
    await win.evaluate(()=>{
      const s=document.querySelector('#editor .shape');s.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
      const t=s.querySelector('.shape-text');const r=document.createRange();r.selectNodeContents(t);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);
    });
    await win.keyboard.type(' ZZZ',{delay:15});
    await win.keyboard.press('Control+z');
    check('one undo removes shape typing, without consuming a selection-only step',await win.evaluate(()=>!document.querySelector('#editor .shape-text').textContent.includes('ZZZ')));
    await win.keyboard.type(' QQQ',{delay:15});
    check('typing after undo stays inside the shape',await win.evaluate(()=>document.querySelector('#editor .shape-text').textContent.includes('QQQ')));
    // The header and the row menu share one searchable label picker.
    await win.evaluate(()=>document.querySelector('.note-label-add').click());
    await win.locator('#label-search').fill('work');await win.keyboard.press('Enter');
    await win.evaluate(()=>document.querySelector('[data-label-close]').click());
    check('a new label appears beside the title',await win.locator('#note-labels').textContent().then(t=>t.includes('#work')));
    await open('deletion');await open('square');
    check('labels survive a note switch',await win.locator('#note-labels').textContent().then(t=>t.includes('#work')));
    await win.evaluate(()=>{const row=[...document.querySelectorAll('.note-row')].find(r=>r.querySelector('.nr-title')?.textContent==='deletion');row.parentElement.querySelector('.nr-more').click();document.querySelector('[data-note-act="labels"]').click();});
    await win.locator('#label-search').fill('wor');
    const optionCount=await win.locator('.label-options input').count();
    await win.evaluate(()=>document.querySelector('.label-options input').click());
    await win.evaluate(()=>document.querySelector('[data-label-close]').click());
    await open('deletion');
    check('the row menu searches labels and tags that row without changing the active note',optionCount===1&&await win.locator('#note-labels').textContent().then(t=>t.includes('#work')));

    // Every image corner is reachable and keeps the opposite corner still.
    for(const corner of ['se','nw','ne','sw']) {
      await win.evaluate(()=>{const img=document.querySelector('#editor .note-image');img.style.left='160px';img.style.top='200px';img.style.width='200px';img.style.height='100px';img.dataset.ratio='2';img.classList.remove('behind');document.getElementById('editor').scrollTop=0;img.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:500,clientY:500}));});
      await win.mouse.up();
      const geometry=()=>win.evaluate(()=>{const r=document.querySelector('#editor .note-image').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
      const before=await geometry();
      const at=await win.evaluate(c=>{const r=document.querySelector('.image-h[data-corner="'+c+'"]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};},corner);
      await win.mouse.move(at.x,at.y);await win.mouse.down();await win.mouse.move(at.x+(corner.includes('w')?-30:30),at.y+(corner.includes('n')?-15:15),{steps:5});await win.mouse.up();
      const after=await geometry();const x=corner.includes('w')?'right':'left',y=corner.includes('n')?'bottom':'top';
      check('image '+corner+' resize holds the opposite corner',after.width>before.width+20&&Math.abs(after[x]-before[x])<2&&Math.abs(after[y]-before[y])<2,JSON.stringify({before,after}));
    }
    await win.evaluate(url=>{
      const card=document.createElement('div');card.id='metadata-probe';card.className='link-block link-bookmark';card.dataset.kind='bookmark';card.dataset.url=url;card.setAttribute('contenteditable','false');
      // Titled with its own address, as every new bookmark is until the page title arrives.
      card.innerHTML='<a class="link-card"><strong class="link-card__title"></strong></a>';card.querySelector('strong').textContent=url;
      const ed=document.getElementById('editor');ed.append(card);ed.dispatchEvent(new Event('input',{bubbles:true}));
    },origin);
    await win.waitForFunction(()=>document.querySelector('#metadata-probe .link-card__title')?.textContent==='Local preview title',null,{polling:50});
    check('bookmark title travels through the real metadata IPC and HTTP response',true);
    await win.evaluate(()=>document.querySelector('#metadata-probe').remove());

    // A real HTTP redirect to Google's sign-in stays in the tab (0.9.2): the tab
    // takes a Firefox identity for it and no system browser is opened.
    await app.evaluate(({shell})=>{globalThis.browserHandoffs=[];shell.openExternal=async url=>{globalThis.browserHandoffs.push(url);};});
    await win.evaluate(url=>{const w=document.createElement('webview');w.id='auth-probe';w.setAttribute('partition','persist:ai-gemini');w.style.cssText='position:fixed;left:0;top:0;width:200px;height:100px';w.src=url+'/redirect';document.body.append(w);},origin);
    const firefox=await win.waitForFunction(()=>{try{return /Firefox\//.test(document.querySelector('#auth-probe').getUserAgent());}catch{return false;}},null,{polling:100,timeout:10000}).then(()=>true).catch(()=>false);
    const handoffs=await app.evaluate(()=>globalThis.browserHandoffs);
    check('a Google sign-in in an AI tab stays in the app, as Firefox, with no browser opened',firefox&&handoffs.length===0,JSON.stringify({firefox,handoffs}));
    await win.evaluate(()=>document.querySelector('#auth-probe').remove());

    for(let i=0;i<originals.length;i++) {
      await open('report-'+i);
      check('real report '+i+' opens with its text intact',await win.evaluate(()=>document.querySelector('#editor').textContent.length>100));
    }
    check('report regression checks raise no renderer errors',errors.length===0,errors.join('\n'));
  } finally {
    await app?.close();
    await new Promise(resolve=>server.close(resolve));
    for(const {file,bytes} of originals) check('original report file remains byte-identical',fs.readFileSync(file).equals(bytes));
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const failed=[];let count=0;
  await runV090Checks((name,ok,detail='')=>{count++;console.log(`${ok?'PASS':'FAIL'} ${name} ${detail}`);if(!ok)failed.push(name);});
  console.log(`${count-failed.length}/${count} checks passed`);if(failed.length)process.exitCode=1;
}
