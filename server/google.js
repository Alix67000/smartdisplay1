import {createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {ORIGIN,GOOGLE_COOKIE,GOOGLE_STATE_COOKIE,cookie,cookieValue,randomValue,sign,verify} from './session.js';

export {ORIGIN,GOOGLE_COOKIE,GOOGLE_STATE_COOKIE};
export const CLIENT_ID='667060599503-us1ck9jsdd2ou81ev2b57sh454pasma8.apps.googleusercontent.com';
export const CALLBACK=ORIGIN+'/api/google-callback';
export const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.readonly';
export const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events.owned.readonly';
export const GOOGLE_SCOPES=['openid','email',GMAIL_SCOPE,CALENDAR_SCOPE];
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const duration=30*24*3600;

function oauthSecret(){
 const direct=process.env.GOOGLE_OAUTH_CLIENT_SECRET;if(direct)return direct;
 try{const key=Buffer.from(process.env.GOOGLE_OAUTH_WRAP_KEY||'','base64url'),raw=Buffer.from(process.env.GOOGLE_OAUTH_CLIENT_SECRET_ENCRYPTED||'','base64url');if(key.length!==32||raw.length<29)throw Error();const decipher=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8')}catch{throw Error('oauth_not_configured')}
}
function encryptionKey(){const value=process.env.APP_SESSION_SECRET;if(!value||value.length<32)throw Error('session_not_configured');return createHash('sha256').update('pilotage-google-v1:'+value).digest()}
function encrypt(data){const iv=Buffer.from(randomValue(12),'base64url'),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const body=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url')}
function decrypt(value){try{const raw=Buffer.from(String(value||''),'base64url');if(raw.length<29)return null;const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8'))}catch{return null}}
export function googleCookie(data){return cookieValue(GOOGLE_COOKIE,encrypt(data),duration)}
export function googleSession(req){const data=decrypt(cookie(req,GOOGLE_COOKIE)),allowed=String(process.env.ALLOWED_GOOGLE_EMAIL||'').trim().toLowerCase();return data&&data.email===allowed&&typeof data.refresh_token==='string'&&data.refresh_token?data:null}
export function newOAuthState(uid){const state=randomValue(),verifier=randomValue(),nonce=randomValue();const challenge=createHash('sha256').update(verifier).digest('base64url');return {state,verifier,nonce,challenge,cookie:cookieValue(GOOGLE_STATE_COOKIE,sign({kind:'google-state',uid,state,verifier,nonce,exp:Date.now()+10*60*1000}),600)}}
export function oauthState(req){const data=verify(cookie(req,GOOGLE_STATE_COOKIE));return data?.kind==='google-state'?data:null}
export async function exchangeCode(code,verifier){return googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:oauthSecret(),code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:CALLBACK})})}
export async function verifyGoogleIdentity(idToken,nonce){const {payload}=await jwtVerify(idToken,keys,{audience:CLIENT_ID,issuer:['https://accounts.google.com','accounts.google.com'],algorithms:['RS256']});const allowed=String(process.env.ALLOWED_GOOGLE_EMAIL||'').trim().toLowerCase();if(payload.nonce!==nonce||payload.email_verified!==true||String(payload.email||'').toLowerCase()!==allowed||typeof payload.sub!=='string')throw Error('identity_not_allowed');return {sub:payload.sub,email:allowed}}
async function refresh(data){const result=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:oauthSecret(),refresh_token:data.refresh_token,grant_type:'refresh_token'})});return {...data,access_token:result.access_token,expires_at:Date.now()+Number(result.expires_in||3600)*1000,scope:result.scope||data.scope}}
export async function access(req,res){let data=googleSession(req);if(!data)throw Object.assign(Error('google_session'),{status:401});if(!data.access_token||data.expires_at<Date.now()+60000){data=await refresh(data);res.setHeader('Set-Cookie',googleCookie(data))}return {token:data.access_token,data}}
export async function googleJson(url,options={}){const response=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok){const error=Error('google_'+response.status);error.status=response.status;try{error.reason=(await response.json()).error}catch{}throw error}return response.json()}
export async function googleApi(req,res,path){const {token}=await access(req,res);return googleJson('https://www.googleapis.com/'+path,{headers:{Authorization:'Bearer '+token}})}
export const EMAIL_PERIODS=[2,24,48,72];
export function parseEmailHours(value){if(value===undefined)return 72;const text=String(value);return /^(2|24|48|72)$/.test(text)?Number(text):null}
export function gmailHeader(message,name){return String((message?.payload?.headers||[]).find(x=>String(x.name).toLowerCase()===name)?.value||'')}
export function gmailAddress(message){const value=gmailHeader(message,'from'),match=value.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/)||value.match(/^([^<>\s]+@[^<>\s]+)$/);return match?match[1].toLowerCase():''}
export function allowedMessage(message,hours=72){const address=gmailAddress(message),time=Number(message.internalDate);return address.endsWith('@emmaus-scherwiller.fr')&&address.slice(address.lastIndexOf('@')+1)==='emmaus-scherwiller.fr'&&Number.isFinite(time)&&time>=Date.now()-hours*3600000&&time<=Date.now()+300000}
export async function gmailMessage(req,res,id,format='full'){if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw Object.assign(Error('invalid_id'),{status:400});return googleApi(req,res,'gmail/v1/users/me/messages/'+encodeURIComponent(id)+'?format='+format+'&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date')}
