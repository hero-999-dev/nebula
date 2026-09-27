import { describe,it,expect,vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { installBrowserAuth,isGoogleSignIn } from '../electron/ai-browser-auth.js';
const guest=()=>{const wc=new EventEmitter();wc.setWindowOpenHandler=fn=>{wc.popup=fn;};return wc;};
const settle=async()=>{await new Promise(r=>setTimeout(r,0));};
describe('Google sign-in in the system browser',()=>{
  it('matches only the real HTTPS Google account host',()=>{
    expect(isGoogleSignIn('https://accounts.google.com/o/oauth2/auth')).toBe(true);
    for(const url of ['http://accounts.google.com','https://accounts.google.com.evil.test','https://evil.test/accounts.google.com','javascript:alert(1)'])expect(isGoogleSignIn(url)).toBe(false);
  });
  it.each(['will-navigate','will-redirect'])('hands %s to the service browser session once',async event=>{
    const wc=guest(),open=vi.fn().mockResolvedValue(),notify=vi.fn(),preventDefault=vi.fn();
    installBrowserAuth(wc,{serviceUrl:'https://gemini.google.com/',openExternal:open,notify});
    wc.emit(event,{preventDefault},'https://accounts.google.com/signin',false,true);
    wc.emit(event,{preventDefault},'https://accounts.google.com/signin',false,true);await settle();
    expect(preventDefault).toHaveBeenCalledTimes(2);expect(open).toHaveBeenCalledTimes(1);expect(open).toHaveBeenCalledWith('https://gemini.google.com/');expect(notify).toHaveBeenCalledWith({ok:true,url:'https://gemini.google.com/'});
  });
  it('handles Google popup sign-in and ignores background frames',async()=>{
    const wc=guest(),open=vi.fn().mockResolvedValue(),preventDefault=vi.fn();installBrowserAuth(wc,{serviceUrl:'https://chatgpt.com/',openExternal:open});
    wc.emit('will-redirect',{preventDefault},'https://accounts.google.com/',false,false);expect(preventDefault).not.toHaveBeenCalled();
    expect(wc.popup({url:'https://accounts.google.com/signin'})).toEqual({action:'deny'});await settle();expect(open).toHaveBeenCalledOnce();
    expect(wc.popup({url:'file:///secret'})).toEqual({action:'deny'});
  });
  it('can retry after the OS fails to open the browser',async()=>{
    const wc=guest(),open=vi.fn().mockRejectedValueOnce(Error()).mockResolvedValue(),notify=vi.fn();installBrowserAuth(wc,{serviceUrl:'https://gemini.google.com/',openExternal:open,notify});
    wc.popup({url:'https://accounts.google.com/'});await settle();expect(notify).toHaveBeenCalledWith({ok:false,url:'https://gemini.google.com/'});
    wc.popup({url:'https://accounts.google.com/'});await settle();expect(open).toHaveBeenCalledTimes(2);
  });
});
