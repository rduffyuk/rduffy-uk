import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { JourneyData, PositionedNode } from './types';
import { milestoneId, storyHref } from './journeyNavigation';

const GraphCanvas = lazy(() => import('./GraphCanvas'));
type Mode = '3d' | '2d';

function defaultMode(): Mode {
  const query = new URLSearchParams(location.search).get('view');
  if (query === '2d' || query === '3d') return query;
  try { const saved = localStorage.getItem('journey-view-mode'); if (saved === '2d' || saved === '3d') return saved; } catch {}
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return '2d';
  if ((navigator.hardwareConcurrency ?? 8) <= 2 || ((navigator as Navigator & {deviceMemory?: number}).deviceMemory ?? 8) <= 2) return '2d';
  try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return '2d'; gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { return '2d'; }
  return '3d';
}

export default function JourneyPreview({ data }: { data: JourneyData }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [active, setActive] = useState(0);
  const [showDecisions, setShowDecisions] = useState(false);
  const shownIndices = useMemo(() => data.milestones.flatMap((m,i) => showDecisions || m.kind !== 'decision' ? [i] : []), [data, showDecisions]);
  const graphData = useMemo(() => ({ milestones: shownIndices.map(i => data.milestones[i]) }), [data, shownIndices]);
  const graphIndex = Math.max(0, shownIndices.indexOf(active));
  const [dark, setDark] = useState(false);
  const [paused, setPaused] = useState(false);
  const [camera, setCamera] = useState(0);
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);
  const [copied, setCopied] = useState(false);
  const [help, setHelp] = useState(false);
  const [ready, setReady] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const timelineUserScroll = useRef(false);
  const pendingJump = useRef<number | null>(0);

  useEffect(() => {
    setMode(defaultMode());
    setPaused(matchMedia('(prefers-reduced-motion: reduce)').matches);
    const readURL = () => {
      const at = new URLSearchParams(location.search).get('at');
      const index = data.milestones.findIndex(m => milestoneId(m) === at);
      const next = index < 0 ? 0 : index;
      setShowDecisions(new URLSearchParams(location.search).get('decisions') === '1' || data.milestones[next].kind === 'decision');
      activeRef.current = next; pendingJump.current = next; setActive(next);
      const view = new URLSearchParams(location.search).get('view');
      if (view === '2d' || view === '3d') setMode(view);
    };
    readURL();
    const updateTheme = () => {
      const theme = document.documentElement.dataset.theme;
      setDark(theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches));
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', updateTheme);
    window.addEventListener('popstate', readURL); setReady(true);
    return () => { observer.disconnect(); mq.removeEventListener('change', updateTheme); window.removeEventListener('popstate', readURL); };
  }, [data]);

  useEffect(() => {
    if (!ready || !mode) return;
    const url = new URL(location.href);
    url.searchParams.set('at', milestoneId(data.milestones[active]));
    url.searchParams.set('view', mode);
    if (showDecisions) url.searchParams.set('decisions', '1'); else url.searchParams.delete('decisions');
    history.replaceState(null, '', url);
  }, [active, mode, ready, data, showDecisions]);

  const jump = (index: number) => {
    const i = Math.max(0, Math.min(index, data.milestones.length - 1));
    timelineUserScroll.current = false;
    activeRef.current = i; pendingJump.current = i; setActive(i); setSelectedNode(null);
    const root = timeline.current;
    const card = root?.querySelector<HTMLElement>(`[data-index="${i}"]`);
    if (root && card) { root.scrollTop += card.getBoundingClientRect().top - root.getBoundingClientRect().top - 18; pendingJump.current = null; }
  };

  useEffect(() => {
    if (!ready || !timeline.current) return;
    const root = timeline.current;
    let frame = 0;
    let alignFrame = 0;
    const align = () => {
      const index = pendingJump.current ?? activeRef.current;
      const card = root.querySelector<HTMLElement>(`[data-index="${index}"]`);
      if (card) root.scrollTop += card.getBoundingClientRect().top - root.getBoundingClientRect().top - 18;
      pendingJump.current = null;
    };
    alignFrame = requestAnimationFrame(align);
    // Select exactly one card at the reading line, rather than the last of
    // several entries that happened to pass an IntersectionObserver threshold.
    const onScroll = () => {
      if (pendingJump.current !== null || !timelineUserScroll.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = root.getBoundingClientRect().top + 86;
        let next = shownIndices[0];
        for (const card of root.querySelectorAll<HTMLElement>('[data-index]')) {
          if (card.getBoundingClientRect().top <= line) next = Number(card.dataset.index);
        }
        if (next !== activeRef.current) { activeRef.current = next; setActive(next); setSelectedNode(null); }
      });
    };
    const onResize = () => {
      timelineUserScroll.current = false;
      pendingJump.current = activeRef.current;
      cancelAnimationFrame(frame); cancelAnimationFrame(alignFrame);
      alignFrame = requestAnimationFrame(align);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(root);
    const onScrollIntent = () => { timelineUserScroll.current = true; };
    const intentEvents = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;
    intentEvents.forEach(event=>root.addEventListener(event,onScrollIntent,{passive:true}));
    root.addEventListener('scroll', onScroll, {passive:true}); window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(alignFrame); resizeObserver.disconnect(); intentEvents.forEach(event=>root.removeEventListener(event,onScrollIntent)); root.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); };
  }, [ready, data, shownIndices]);

  const current = data.milestones[active];
  const visible = [...new Map(graphData.milestones.slice(0,graphIndex+1).flatMap(m=>m.nodes).map(n=>[n.id,n])).values()].map(n=>({...n, retired: !!n.retiredBy && current.date >= n.retiredBy}));
  const toggleDecisions = () => {
    if (showDecisions && current.kind === 'decision') {
      const previous = data.milestones.map((m,i)=>({m,i})).filter(({m,i})=>i<=active && m.kind!=='decision').at(-1)?.i ?? 0;
      activeRef.current = previous; pendingJump.current = previous; setActive(previous);
    } else pendingJump.current = active;
    setSelectedNode(null); setShowDecisions(!showDecisions);
  };
  const retirementVisible = selectedNode?.retiredBy && current.date >= selectedNode.retiredBy;
  const kindLabel = (kind?: string) => kind === 'checkpoint' ? 'Architecture checkpoint' : kind === 'decision' ? 'Decision record' : 'The story';
  const selectedMilestone = selectedNode && data.milestones.find(m=>m.nodes.some(n=>n.id === selectedNode.id));
  const chooseMode = (next: Mode) => { setMode(next); try {localStorage.setItem('journey-view-mode',next);} catch {} };
  const groups = [{id:'core',label:'Core',color:'#a855f7'},{id:'database',label:'Data',color:'#22c55e'},{id:'infra',label:'Infrastructure',color:'#f97316'},{id:'monitoring',label:'Observability',color:'#ec4899'},{id:'workflow',label:'Workflow',color:'#3b82f6'},{id:'decision',label:'Decisions',color:'#a36207'}];

  return <section className="j-preview" aria-label="Rootweaver journey">
    <header className="j-heading">
      <div><h1>The journey</h1><p>How the platform grew, one chapter at a time.</p></div>
      <div className="j-modes" role="group" aria-label="Journey view">
        <button aria-pressed={mode==='3d'} onClick={()=>chooseMode('3d')}>3D universe</button>
        <button aria-pressed={mode==='2d'} onClick={()=>chooseMode('2d')}>2D overview</button>
      </div>
    </header>
    <div className="j-context-bar">
      <div><span className="j-context-dot"/><span>Journal backfilled through <button className="j-cutoff-link" onClick={()=>jump(data.milestones.findIndex(m=>m.journalEpisode==='season-4-episode-09-the-night-the-mac-died'))}><strong>14 June 2026</strong></button></span></div>
      <a href="/rootweaver/">Architecture checked 14 Oct →</a>
    </div>
    <div className="j-workspace">
      <div className="j-map-column">
        <div className="j-map-tools">
          <span className="j-map-count">{visible.length} {showDecisions ? 'components & decisions' : 'components'}</span>
          <div>{mode==='3d' && <><button onClick={()=>setPaused(!paused)} aria-pressed={paused}>{paused?'Resume motion':'Pause motion'}</button><button onClick={()=>setCamera(v=>v+1)}>Reset view</button></>}
          <button aria-expanded={help} onClick={()=>setHelp(!help)}>Map guide</button></div>
        </div>
        <div className="j-map-surface">
          {mode === '3d' ? <Suspense fallback={<div className="j-loading">Loading your universe…</div>}>
            <GraphCanvas key={camera} data={graphData} currentIndex={graphIndex} onNodeClick={setSelectedNode} dark={dark} paused={paused}/>
          </Suspense> : mode==='2d' ? <div className="j-overview" aria-label="Components introduced so far">
            <div className="j-overview-intro"><h2>Recorded by this point</h2><p>Select a component to see where it entered the story.</p></div>
            {groups.map(group=>{
              const nodes=visible.filter(n=>n.group===group.id);
              if (!nodes.length) return null;
              return <section key={group.id} className="j-group"><h3>{group.label}<span>{nodes.length}</span></h3><div>{nodes.map(n=><button key={n.id} className="j-node" data-retired={n.retired||undefined} data-selected={selectedNode?.id===n.id||undefined} onClick={()=>setSelectedNode({...n,position:[0,0,0]})}><span className="j-node-dot" style={{background:n.color}}/>{n.label}{n.retired && <small>Retired by {n.retiredBy}</small>}</button>)}</div></section>;
            })}
          </div> : <div className="j-loading">Opening the journey…</div>}
          {help && <aside className="j-guide"><button className="j-close" aria-label="Close map guide" onClick={()=>setHelp(false)}>×</button><h2>Reading the universe</h2><p>Scroll the story to reveal the components introduced over time.</p><p>Orbits group components by role, from core services through to decisions. Select a node for its story.</p><p>The map records history, not live health. A node dims only once the timeline reaches a dated retirement observation. An undimmed node has no verified retirement here; it does not prove the component is running.</p><p>{mode==='3d'?'Drag to rotate · scroll over the map to zoom.':'The same milestones and reading links are available in both views.'}</p></aside>}
          {selectedNode && selectedMilestone && <aside className="j-node-detail" aria-label="Component details"><button className="j-close" aria-label="Close component details" onClick={()=>setSelectedNode(null)}>×</button><span className="j-meta">{selectedMilestone.dateLabel ?? selectedMilestone.date} · {retirementVisible ? `Retired by ${selectedNode.retiredBy}` : selectedMilestone.kind === 'checkpoint' ? 'Recorded at checkpoint' : 'First recorded here'}</span><h2>{selectedNode.label}</h2><p>{selectedMilestone.description}</p>{retirementVisible && <p>{selectedNode.note}</p>}<button className="j-text-link" onClick={()=>jump(data.milestones.indexOf(selectedMilestone))}>Go to this milestone →</button><div className="j-detail-links">{selectedMilestone.blogEpisode && <a href={storyHref(selectedMilestone.blogEpisode,selectedMilestone,mode??'3d',showDecisions)}>Read episode →</a>}{selectedMilestone.link && <a href={storyHref(selectedMilestone.link.href,selectedMilestone,mode??'3d',showDecisions)}>{selectedMilestone.link.label} →</a>}</div></aside>}
        </div>
        <div className="j-now" aria-live="polite"><span className="j-meta">{current.dateLabel ?? current.date} · {current.journalLabel ?? kindLabel(current.kind)} · {graphIndex+1} of {shownIndices.length}</span><h2 data-active-title>{current.title}</h2><p>{current.nodes.length?`${current.kind === 'checkpoint' ? 'Recorded at this check' : 'First recorded here'}: ${current.nodes.map(n=>n.label).join(', ')}`:'A new chapter in the platform.'}</p></div>
        <div className="j-map-footer"><span>Historical map · dimmed = retired by this point</span><button onClick={async()=>{try{await navigator.clipboard.writeText(location.href);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setCopied(false);}}}>{copied?'Link copied':'Copy milestone link'}</button></div>
      </div>
      <aside className="j-story-column" aria-label="Journey timeline">
        <div className="j-story-filter"><span>Follow the story</span><label><input type="checkbox" checked={showDecisions} onChange={toggleDecisions}/> Include decision notes <span>({data.milestones.filter(m=>m.kind==='decision').length})</span></label></div>
        <div className="j-timeline-controls"><label htmlFor="milestone-select">Jump to a milestone</label><select id="milestone-select" value={active} onChange={e=>jump(Number(e.target.value))}>{shownIndices.map(i=><option key={milestoneId(data.milestones[i])} value={i}>{data.milestones[i].dateLabel ?? data.milestones[i].date} · {data.milestones[i].title}</option>)}</select><div><span>Scroll to follow the story</span><button aria-label="Previous milestone" disabled={graphIndex===0} onClick={()=>jump(shownIndices[graphIndex-1])}>↑</button><button aria-label="Next milestone" disabled={graphIndex===shownIndices.length-1} onClick={()=>jump(shownIndices[graphIndex+1])}>↓</button></div></div>
        <div className="j-timeline" ref={timeline} tabIndex={0} aria-label="Scrollable milestones">
          {shownIndices.map((i)=>{const m=data.milestones[i]; return <article key={milestoneId(m)} data-index={i} data-active={active===i} className="j-story" aria-current={active===i?'step':undefined}>
            <div className="j-story-meta"><time>{m.dateLabel ?? m.date}</time><span>{m.journalLabel ?? (m.recordKind === "historical-note" ? "Historical design note" : m.recordKind === "legacy-record" ? "Legacy source record" : kindLabel(m.kind))}</span></div>
            <h2><button onClick={()=>jump(i)}>{m.title}</button></h2><p>{m.description}</p>
            {m.editorialNote && <p className="j-evidence">{m.editorialNote}</p>}
            {m.evidenceLabel && <p className="j-evidence">{m.evidenceLabel}</p>}
            {m.kind === 'checkpoint' && <p className="j-history-gap">The main journal has reached 14 June. This later architecture checkpoint is separate from that historical backfill; some published episodes also follow overlapping arcs beyond June 14.</p>}
            {m.kind === 'decision' && <p className="j-evidence">{m.decisionStatus && <><strong>Recorded status: {m.decisionStatus}.</strong>{' '}</>}{m.recordKind === "historical-note" ? "Journal context · not a canonical ADR or acceptance date." : m.recordKind === "legacy-record" ? "Legacy source · original numbering and registry differences retained." : "Dated decision · does not establish when it was deployed."}</p>}
            <div className="j-tags">{(m.tags??m.nodes).map(n=><span key={n.id}>{n.label}</span>)}</div>
            <div className="j-story-links">{m.blogEpisode && <a href={storyHref(m.blogEpisode,m,mode??'3d',showDecisions)}>Read episode <span aria-hidden="true">↗</span></a>}{m.link && <a href={storyHref(m.link.href,m,mode??'3d',showDecisions)}>{m.link.label} <span aria-hidden="true">↗</span></a>}</div>
          {m.relatedLinks && <details className="j-related"><summary>Related decisions</summary>{m.relatedLinks.map(l=><a key={l.href} href={storyHref(l.href,m,mode??'3d',showDecisions)}>{l.label} →</a>)}</details>}
          </article>})}
          <div className="j-end-space" aria-hidden="true"/>
        </div>
      </aside>
    </div>
  </section>;
}
