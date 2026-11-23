import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validDay,monthGrid,dayKey,localDay,eventDay,calendarItems,agendaDays} from '../src/widgets/calendar.js';
test('grille mensuelle lundi à dimanche, années bissextiles et changement d’année',()=>{
 assert.equal(monthGrid(2024,1).length,35);assert.equal(monthGrid(2024,1)[3],'2024-02-01');assert.equal(monthGrid(2024,1).filter(Boolean).length,29);
 assert.equal(monthGrid(2025,1).filter(Boolean).length,28);assert.equal(monthGrid(2026,10)[6],'2026-11-01');assert.equal(monthGrid(2026,10).length,42);
 assert.equal(monthGrid(2027,0)[4],'2027-01-01');assert.equal(dayKey(2026,11,31),'2026-12-31');
});
test('validation des dates locales et calendrier Outlook',()=>{
 for(const s of ['2026-02-29','2026-04-31','2026-1-01','2026-13-10','invalide',''])assert.equal(validDay(s),false);
 assert.equal(validDay('2024-02-29'),true);assert.equal(eventDay('2026-11-07T09:30:00.0000000'),'2026-11-07');assert.equal(eventDay('pas-une-date'),null);
 const z='2026-11-07T23:30:00Z';assert.equal(eventDay(z),localDay(new Date(z)));assert.equal(eventDay(z,true),'2026-11-07');
});
test('échéances et tâches datées existantes sans toucher aux sources',()=>{
 const deadlines=[{id:'d1',date:'2026-11-07',title:'Échéance fictive',time:null},{id:'bad',date:'2026-02-30',title:'Impossible'}];
 const tasks=[{id:'t1',due:'2026-11-07',title:'Tâche fictive',done:false},{id:'t2',due:'2026-11-07',title:'Tâche terminée',done:true},{id:'t3',due:'',title:'Sans date',done:false}];
 const events=[{id:'e1',subject:'Rendez-vous fictif',start:{dateTime:'2026-11-07T09:30:00'},isAllDay:false}];
 const original=JSON.stringify({deadlines,tasks,events}),items=calendarItems(deadlines,tasks,events);assert.equal(items.length,3);assert.equal(items.find(i=>i.kind==='event').time,'09:30');assert.equal(items.find(i=>i.kind==='deadline').time,null);assert.equal(JSON.stringify({deadlines,tasks,events}),original);
});

test('agenda à venir : heure locale Outlook, instant Google et journées entières', () => {
 const now = new Date(2026, 10, 23, 10);
 const event = (id, start, end, isAllDay = false) => ({
  id, subject: id, start: {dateTime: start}, end: {dateTime: end}, isAllDay,
 });
 const googleStart = new Date(2026, 10, 24, 0, 30);
 const events = [
  event('Passé', '2026-11-23T07:00:00', '2026-11-23T09:00:00'),
  event('Outlook', '2026-11-23T13:00:00.0000000', '2026-11-23T14:00:00.0000000'),
  event('Google', googleStart.toISOString(), new Date(+googleStart + 3600000).toISOString()),
  event('Fini à minuit', '2026-11-22', '2026-11-23', true),
  event('En cours sur deux jours', '2026-11-22', '2026-11-24', true),
  event('Garde de nuit', '2026-11-22T23:00:00', '2026-11-23T11:00:00'),
  event('Invalide', 'date illisible'),
 ];
 const deadlines = [
  {id: 'old', date: '2026-11-20', title: 'Échéance dépassée'},
  {id: 'next', date: '2026-11-23', time: '12:30', title: 'Échéance à venir'},
 ];
 const groups = agendaDays(events, deadlines, now);
 assert.deepEqual(groups.map(({day, entries}) => [day, entries.map(item => item.title)]), [
  ['2026-11-20', ['Échéance dépassée']],
  ['2026-11-23', ['En cours sur deux jours', 'Garde de nuit', 'Échéance à venir', 'Outlook']],
  ['2026-11-24', ['Google']],
 ]);
 assert.equal(groups[1].entries[3].start.getHours(), 13);
 assert.equal(groups[2].entries[0].start.getTime(), googleStart.getTime());
});
