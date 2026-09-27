import { describe,it,expect } from 'vitest';
import { shapeAnchorPoint } from '../src/js/shape-anchor.js';
describe('arrows meet the actual shape',()=>{
  const box={left:0,top:0,width:100,height:100};
  it('meets the triangle slope instead of its bounding box',()=>{expect(shapeAnchorPoint(box,{x:-100,y:50},'triangle')).toEqual({x:25,y:50});});
  it('meets a diamond edge along the ray',()=>{const p=shapeAnchorPoint(box,{x:100,y:0},'diamond');expect(p.x).toBe(75);expect(p.y).toBe(25);});
  it('meets an ellipse rather than the rectangle corner',()=>{const p=shapeAnchorPoint(box,{x:100,y:0},'ellipse');expect(((p.x-50)/50)**2+((p.y-50)/50)**2).toBeCloseTo(1);});
  it('rotates the triangle attachment with the shape',()=>{const p=shapeAnchorPoint(box,{x:50,y:-100},'triangle',90);expect(p.x).toBeCloseTo(50);expect(p.y).toBeCloseTo(25);});
  it('keeps rectangle attachments on their sides',()=>{expect(shapeAnchorPoint(box,{x:-100,y:55})).toEqual({x:0,y:50});});
});
