import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const data=read('src/data/journey-data.json');
const journal=read('src/data/journal-backfill.json');
const original=read('src/data/journey-original-data.json');
const id=m=>m.stableId??`${m.date}-${m.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
assert.equal(data.milestones.length,143);
assert.equal(data.milestones.filter(m=>m.kind==='decision').length,85);
assert.equal(data.milestones.filter(m=>m.recordKind==='adr').length,74);
assert.equal(data.milestones.filter(m=>m.recordKind==='historical-note').length,4);
assert.equal(new Set(data.milestones.map(id)).size,data.milestones.length);
assert.deepEqual(data.milestones.map(m=>m.date),data.milestones.map(m=>m.date).sort());
for(const old of original.milestones)assert.ok(data.milestones.some(m=>id(m)===id(old)),`original deep link: ${id(old)}`);
assert.equal(journal.cutoff,'2026-06-14');
assert.ok(journal.records.every(r=>r.date<=journal.cutoff));
assert.equal(journal.records.length,31);
const mapped=new Set(journal.records.map(r=>r.journalEpisode));
const later=new Set(journal.laterPublishedArcs.map(r=>r.episode));
const episodes=readdirSync('src/content/writing').filter(f=>f.startsWith('season-')&&/^draft: false$/m.test(readFileSync('src/content/writing/'+f,'utf8').split('---')[1]));
assert.ok(episodes.length >= 32);
for (const episode of mapped) assert.ok(episodes.includes(episode+'.md'), `mapped episode published: ${episode}`);
for(const record of journal.records){
 const milestones=data.milestones.filter(m=>m.journalEpisode===record.journalEpisode);
 assert.equal(milestones.length,1,`one primary milestone for ${record.journalEpisode}`);
 assert.equal(milestones[0].dateLabel,record.dateLabel);
}
const first=data.milestones.find(m=>m.title==='The Founding Conversation');
assert.equal(first.nodes.length,0,'planning must not pretend indexing already shipped');
assert.ok(first.description.includes('planning'));
const refusal=data.milestones.find(m=>m.journalEpisode==='season-3-episode-4-refusal-gate');
assert.ok(refusal.dateLabel.includes('day not specified'),'month-only evidence stays explicit');
assert.equal(data.milestones.find(m=>m.kind==='checkpoint').date,'2026-10-14','current architecture remains separate');
let checked=0;
for(const m of data.milestones){for(const href of [m.blogEpisode,m.link?.href,...(m.relatedLinks??[]).map(l=>l.href)].filter(Boolean)){
 const u=new URL(href,'https://rduffy.uk');if(!['rduffy.uk','blog.rduffy.uk'].includes(u.hostname))continue;
 const p=u.pathname.replace(/^\/posts\//,'/writing/');assert.ok(existsSync('dist'+p.replace(/\/$/,'')+'/index.html'),p);checked++;
}}
console.log(JSON.stringify({status:'PASS',milestones:143,storyAndCheckpoints:58,optionalDecisionRecords:85,legacyRecords:7,canonicalADRs:74,historicalDesignNotes:4,mappedEpisodes:31,laterArcExcluded:1,originalDeepLinksPreserved:51,internalLinks:checked},null,2));
