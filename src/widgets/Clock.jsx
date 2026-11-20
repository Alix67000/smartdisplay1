import React,{useEffect,useState} from 'react';
import {Clock3,ArrowUpRight} from 'lucide-react';

const timeText=date=>new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date);
const dateText=date=>new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);

export default function Clock({compact=false,onOpen}){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const update=()=>setNow(new Date());const timer=setInterval(update,compact?30000:1000);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update)}},[compact]);
 const hour=now.getHours()%12,minute=now.getMinutes(),second=now.getSeconds();
 if(compact)return <button type="button" className="card detail-tile clock-tile" data-widget-id="clock" data-widget-route="horloge" onClick={onOpen} aria-label="Ouvrir l’horloge"><span className="detail-tile-icon"><Clock3 size={19}/></span><span><small>HEURE LOCALE</small><strong>{timeText(now).slice(0,5)}</strong><em>{dateText(now)}</em></span><ArrowUpRight size={16} aria-hidden="true"/></button>;
 return <section className="card clock-page" aria-labelledby="clock-title"><div className="clock-face" aria-hidden="true"><i className="clock-hand hour" style={{transform:`rotate(${hour*30+minute/2}deg)`}}/><i className="clock-hand minute" style={{transform:`rotate(${minute*6+second/10}deg)`}}/><i className="clock-hand second" style={{transform:`rotate(${second*6}deg)`}}/><b/></div><div className="clock-copy"><div className="section-kicker">HEURE DE L’APPAREIL</div><h2 id="clock-title">Horloge</h2><div className="clock-digital">{timeText(now)}</div><p>{dateText(now)}</p><small>{Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_',' ')}</small></div></section>
}
