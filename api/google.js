import {appSession} from '../server/app-auth.js';
import {ORIGIN,CALLBACK,CLIENT_ID,GOOGLE_SCOPES,GOOGLE_COOKIE,GOOGLE_STATE_COOKIE,newOAuthState,googleSession,googleCookie,googleApi,gmailMessage,gmailHeader,allowedMessage,parseEmailHours} from '../server/google.js';
import {cookieValue} from '../server/session.js';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const app=appSession(req),action=req.query?.action;
 if(!app)return res.status(401).json({error:'Connecte-toi à l’application avec Google.'});
 if(action==='start'&&req.method==='POST'){
  if(req.headers.origin!==ORIGIN)return res.status(403).json({error:'Origine non autorisée.'});
  if(!(process.env.GOOGLE_OAUTH_CLIENT_SECRET||(process.env.GOOGLE_OAUTH_CLIENT_SECRET_ENCRYPTED&&process.env.GOOGLE_OAUTH_WRAP_KEY))||!process.env.APP_SESSION_SECRET||!process.env.ALLOWED_GOOGLE_EMAIL)return res.status(503).json({error:'Connexion Google non configurée.'});
  const transaction=newOAuthState(app.uid);res.setHeader('Set-Cookie',transaction.cookie);
  const query=new URLSearchParams({client_id:CLIENT_ID,redirect_uri:CALLBACK,response_type:'code',scope:GOOGLE_SCOPES.join(' '),access_type:'offline',include_granted_scopes:'true',prompt:'consent select_account',state:transaction.state,nonce:transaction.nonce,code_challenge:transaction.challenge,code_challenge_method:'S256'});
  return res.status(200).json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+query});
 }
 if(action==='logout'&&req.method==='POST'){
  if(req.headers.origin!==ORIGIN)return res.status(403).json({error:'Origine non autorisée.'});
  res.setHeader('Set-Cookie',[cookieValue(GOOGLE_COOKIE,'',0),cookieValue(GOOGLE_STATE_COOKIE,'',0),cookieValue('pilotage_nylas','',0),cookieValue('pilotage_nylas_state','',0)]);return res.status(200).json({ok:true});
 }
 const current=googleSession(req);if(!current)return res.status(401).json({error:'Connecte ton compte Google pour continuer.'});
 if(action==='session'&&req.method==='GET')return res.status(200).json({email:current.email});
 if(action==='messages'&&req.method==='GET'){
  const hours=parseEmailHours(req.query?.hours);if(hours===null)return res.status(400).json({error:'Période invalide.'});
  try{const after=Math.floor((Date.now()-hours*3600000)/1000),list=await googleApi(req,res,'gmail/v1/users/me/messages?maxResults=50&q='+encodeURIComponent('from:(@emmaus-scherwiller.fr) after:'+after));const raw=await Promise.all((list.messages||[]).slice(0,50).map(item=>gmailMessage(req,res,item.id,'metadata')));const messages=raw.filter(m=>allowedMessage(m,hours)).map(m=>({id:m.id,subject:gmailHeader(m,'subject'),from:{emailAddress:{name:gmailHeader(m,'from')}},receivedDateTime:new Date(Number(m.internalDate)).toISOString(),bodyPreview:String(m.snippet||''),isRead:!(m.labelIds||[]).includes('UNREAD')}));return res.status(200).json({messages,more:Boolean(list.nextPageToken)})}catch(e){return res.status(e.status===400?400:e.status===401||e.status===403?401:502).json({error:e.status===401||e.status===403?'La connexion Google a expiré. Reconnecte ton compte.':'Impossible de charger Gmail. Réessaie dans un instant.'})}
 }
 if(action==='events'&&req.method==='GET'){
  try{const start=new Date(Date.now()-86400000).toISOString(),end=new Date(Date.now()+30*86400000).toISOString(),data=await googleApi(req,res,'calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin='+encodeURIComponent(start)+'&timeMax='+encodeURIComponent(end));const events=(data.items||[]).filter(e=>e.status!=='cancelled').map(e=>({id:e.id,subject:e.summary||'Sans titre',start:{dateTime:e.start?.dateTime||e.start?.date,timeZone:e.start?.timeZone||'Europe/Paris'},end:{dateTime:e.end?.dateTime||e.end?.date,timeZone:e.end?.timeZone||'Europe/Paris'},location:{displayName:e.location||''},isAllDay:Boolean(e.start?.date)}));return res.status(200).json({events,more:Boolean(data.nextPageToken)})}catch(e){return res.status(e.status===401||e.status===403?401:502).json({error:e.status===401||e.status===403?'La connexion Google a expiré. Reconnecte ton compte.':'Impossible de charger Google Agenda. Réessaie dans un instant.'})}
 }
 return res.status(405).json({error:'Action indisponible.'});
}
