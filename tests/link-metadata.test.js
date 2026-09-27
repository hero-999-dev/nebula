import { describe,it,expect,vi } from 'vitest';
import { fetchPageTitle } from '../electron/link-metadata.js';
const response=(html,type='text/html')=>({ok:true,headers:{get:()=>type},body:{getReader:()=>{let sent=false;return {read:async()=>sent?{done:true}:(sent=true,{done:false,value:new TextEncoder().encode(html)}),cancel:vi.fn().mockResolvedValue()};}}});
describe('bounded page title requests',()=>{
  it('reads the title without forwarding browser credentials',async()=>{
    const fetchImpl=vi.fn().mockResolvedValue(response('<head><title>A &amp; B</title></head>'));
    expect(await fetchPageTitle('https://example.com/',{fetchImpl})).toEqual({ok:true,title:'A &amp; B'});
    expect(fetchImpl.mock.calls[0][1].credentials).toBe('omit');
  });
  it.each(['file:///x','javascript:alert(1)','https://user:pass@example.com'])('rejects %s',async url=>{const fetchImpl=vi.fn();expect(await fetchPageTitle(url,{fetchImpl})).toEqual({ok:false});expect(fetchImpl).not.toHaveBeenCalled();});
  it('keeps the address fallback for non-HTML and failed fetches',async()=>{
    expect(await fetchPageTitle('https://example.com',{fetchImpl:async()=>response('data','image/png')})).toEqual({ok:false});
    expect(await fetchPageTitle('https://example.com',{fetchImpl:async()=>{throw Error('offline');}})).toEqual({ok:false});
  });
});
