import { describe, it, expect } from 'vitest';
import { resizeImageBox, ensureImageHandles } from '../src/js/image-resize.js';
describe('resizing images from all corners', () => {
  const box={left:100,top:100,width:200,height:100,ratio:2};
  it.each(['se','nw','ne','sw'])('%s holds the opposite corner and the aspect ratio', corner => {
    const west=corner.includes('w'),north=corner.includes('n');
    const next=resizeImageBox(box,west?-40:40,north?-20:20,corner);
    expect(next.width/next.height).toBe(2);
    expect(next.width).toBe(240);
    expect(west?next.left+next.width:next.left).toBe(west?300:100);
    expect(north?next.top+next.height:next.top).toBe(north?200:100);
  });
  it('clamps a north-west resize at the canvas edge',()=>{
    const next=resizeImageBox(box,-500,-500,'nw');
    expect(next.left).toBeGreaterThanOrEqual(0);expect(next.top).toBeGreaterThanOrEqual(0);
    expect(next.left+next.width).toBe(300);expect(next.top+next.height).toBe(200);
  });
  it('keeps in-text pictures in flow',()=>{
    expect(resizeImageBox(box,-40,-20,'nw',true)).toEqual({left:100,top:100,width:240,height:120});
  });
  it('upgrades the one old grip without duplicating on refresh',()=>{
    const img=document.createElement('figure');img.innerHTML='<img><span class="image-h"></span><figcaption>Keep me</figcaption>';
    ensureImageHandles(img);const html=img.innerHTML;ensureImageHandles(img);
    expect(img.innerHTML).toBe(html);expect(img.querySelectorAll('.image-h')).toHaveLength(4);
    expect(img.querySelector('figcaption').textContent).toBe('Keep me');
  });
});
