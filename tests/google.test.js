import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/google.js';
import {appCookie} from '../server/app-auth.js';
import {CLIENT_ID,CALLBACK,GOOGLE_SCOPES,googleCookie,googleSession,parseEmailHours} from '../server/google.js';

process.env.APP_SESSION_SECRET='google-test-session-secret-long-enough';
process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-client-secret';
process.env.ALLOWED_GOOGLE_EMAIL='owner@example.com';
const app=()=>appCookie('uid-test','owner@example.com',Math.floor(Date.now()/1000)+3600).split(';')[0];
const google=()=>googleCookie({sub:'google-sub',email:'owner@example.com',refresh_token:'refresh',access_token:'access',expires_at:Date.now()+3600000,scope:GOOGLE_SCOPES.join(' ')}).split(';')[0];
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},json(x){this.body=x;return this},end(){return this}}}

test('démarrage Google direct avec PKCE et scopes minimaux',async()=>{
 const r=response();await handler({method:'POST',query:{action:'start'},headers:{cookie:app(),origin:'https://smartdisplay1.vercel.app'}},r);assert.equal(r.statusCode,200);const url=new URL(r.body.url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('client_id'),CLIENT_ID);assert.equal(url.searchParams.get('redirect_uri'),CALLBACK);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline');assert.deepEqual(url.searchParams.get('scope').split(' '),GOOGLE_SCOPES);assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
 const denied=response();await handler({method:'POST',query:{action:'start'},headers:{cookie:app(),origin:'https://evil.test'}},denied);assert.equal(denied.statusCode,403);
});

test('cookie Google chiffré et périodes bornées',()=>{
 const value=google();assert.equal(googleSession({headers:{cookie:value}}).email,'owner@example.com');assert.equal(googleSession({headers:{cookie:value+'x'}}),null);assert.equal(parseEmailHours('72'),72);assert.equal(parseEmailHours('73'),null);
});

test('lecture Gmail et Agenda normalisée sans données hors domaine',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{const value=String(url);if(value.includes('/gmail/v1/users/me/messages?'))return {ok:true,json:async()=>({messages:[{id:'good'},{id:'bad'}]})};if(value.includes('/messages/good'))return {ok:true,json:async()=>({id:'good',internalDate:String(Date.now()),snippet:'Aperçu',labelIds:['INBOX'],payload:{headers:[{name:'From',value:'Service <service@emmaus-scherwiller.fr>'},{name:'Subject',value:'Sujet'}]}})};if(value.includes('/messages/bad'))return {ok:true,json:async()=>({id:'bad',internalDate:String(Date.now()),snippet:'Non autorisé',payload:{headers:[{name:'From',value:'bad@emmaus-scherwiller.fr.evil.test'},{name:'Subject',value:'Non'}]}})};if(value.includes('/calendar/v3/'))return {ok:true,json:async()=>({items:[{id:'event',summary:'Réunion',start:{dateTime:'2026-11-20T09:00:00+01:00'},end:{dateTime:'2026-11-20T10:00:00+01:00'}}]})};throw Error('unexpected '+value)};
 try{let r=response();await handler({method:'GET',query:{action:'messages',hours:'72'},headers:{cookie:app()+'; '+google()}},r);assert.equal(r.statusCode,200);assert.equal(r.body.messages.length,1);assert.equal(r.body.messages[0].id,'good');r=response();await handler({method:'GET',query:{action:'events'},headers:{cookie:app()+'; '+google()}},r);assert.equal(r.statusCode,200);assert.equal(r.body.events[0].subject,'Réunion')}finally{globalThis.fetch=original}
});
