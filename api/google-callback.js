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
 let tokens;
 try {
  tokens = await exchangeCode(req.query.code, state.verifier);
 } catch (error) {
  if (error?.message === 'oauth_not_configured' || error?.reason === 'invalid_client') return finish('configuration');
  if (error?.reason === 'invalid_grant') return finish('autorisation_expiree');
  return finish('echange');
 }
 try {
  const identity = await verifyGoogleIdentity(tokens.id_token, state.nonce);
  const granted = new Set(String(tokens.scope || '').split(/\s+/));
  if (!GOOGLE_SCOPES.every(scope => granted.has(scope))) return finish('permissions');
  const previous = googleSession(req);
  const refresh = tokens.refresh_token || previous?.refresh_token;
  if (!refresh) return finish('refresh');
  const session = googleCookie({
   sub: identity.sub, email: identity.email, refresh_token: refresh,
   access_token: tokens.access_token,
   expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000,
   scope: tokens.scope,
  });
  res.setHeader('Set-Cookie', [cookieValue(GOOGLE_STATE_COOKIE, '', 0), session]);
  return finish('ok');
 } catch (error) {
  if (error?.message === 'identity_not_allowed') return finish('identite');
  return finish('verification');
 }
}
