import {appSession} from '../server/app-auth.js';
import {ORIGIN,GOOGLE_STATE_COOKIE,GOOGLE_SCOPES,oauthState,exchangeCode,verifyGoogleIdentity,googleSession,googleCookie} from '../server/google.js';
import {cookieValue} from '../server/session.js';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const finish=name=>res.redirect(302,ORIGIN+'/?google='+name);
 if(req.method!=='GET')return res.status(405).end();
 const app=appSession(req),state=oauthState(req);res.setHeader('Set-Cookie',cookieValue(GOOGLE_STATE_COOKIE,'',0));
 if(!app||!state||state.uid!==app.uid||typeof req.query?.state!=='string'||req.query.state!==state.state)return finish('session');
 if(req.query?.error)return finish(req.query.error==='access_denied'?'refus':'fournisseur');
 if(typeof req.query?.code!=='string'||!req.query.code||req.query.code.length>4096)return finish('code');
 try{const tokens=await exchangeCode(req.query.code,state.verifier),identity=await verifyGoogleIdentity(tokens.id_token,state.nonce),granted=new Set(String(tokens.scope||'').split(/\s+/));if(!GOOGLE_SCOPES.every(scope=>granted.has(scope)))return finish('permissions');const previous=googleSession(req),refresh=tokens.refresh_token||previous?.refresh_token;if(!refresh)return finish('refresh');res.setHeader('Set-Cookie',[cookieValue(GOOGLE_STATE_COOKIE,'',0),googleCookie({sub:identity.sub,email:identity.email,refresh_token:refresh,access_token:tokens.access_token,expires_at:Date.now()+Number(tokens.expires_in||3600)*1000,scope:tokens.scope})]);return finish('ok')}catch{return finish('echange')}
}
