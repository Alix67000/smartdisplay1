import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export const ORIGIN='https://smartdisplay1.vercel.app';
export const APP_COOKIE='pilotage_app';
export const GOOGLE_COOKIE='pilotage_google';
export const GOOGLE_STATE_COOKIE='pilotage_google_state';

function secret(){const value=process.env.APP_SESSION_SECRET;if(!value||value.length<32)throw Error('session_not_configured');return value}
function signature(text){return createHmac('sha256',secret()).update('pilotage-session-v2:'+text).digest('base64url')}
export function sign(data){const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return payload+'.'+signature(payload)}
export function verify(value){try{const [payload,mac,...extra]=String(value||'').split('.');if(extra.length||!payload||!mac)return null;const a=Buffer.from(mac),b=Buffer.from(signature(payload));if(a.length!==b.length||!timingSafeEqual(a,b))return null;const parsed=JSON.parse(Buffer.from(payload,'base64url').toString());return Number.isFinite(parsed.exp)&&parsed.exp>Date.now()?parsed:null}catch{return null}}
export function cookie(req,name){const part=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return part?part.slice(name.length+1):''}
export function cookieValue(name,value,maxAge){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
export function randomValue(bytes=32){return randomBytes(bytes).toString('base64url')}
