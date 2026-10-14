import {useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,Background,Controls,Handle,Position,MarkerType,type NodeProps} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ComponentIcon from './ComponentIcon';
import {architecture,layers,relationships,type ArchitectureItem} from './architecture';

const colors={data:'var(--color-accent)',delivery:'var(--atlas-delivery)',support:'var(--color-text-muted)'};
function Layer({data}:NodeProps){return <div className="pa-layer"><strong>{String(data.name)}</strong><span>{String(data.description)}</span></div>}
function Symbol({data}:NodeProps){
 const item=data.item as ArchitectureItem;
 return <div className={`pa-component ${data.dim?'is-dim':''}`}>
  {Object.entries({top:Position.Top,bottom:Position.Bottom,left:Position.Left,right:Position.Right}).map(([id,position])=><span key={id}><Handle type="source" id={`s-${id}`} position={position}/><Handle type="target" id={`t-${id}`} position={position}/></span>)}
  <button className={data.active?'is-active':''} aria-label={`Inspect ${item.label}`} aria-pressed={!!data.active} onClick={()=>(data.pick as (item:ArchitectureItem)=>void)(item)}><span className="pa-symbol"><ComponentIcon name={item.icon}/></span><strong>{item.label}</strong><small>{item.sub}</small></button>
 </div>
}
const nodeTypes={layer:Layer,symbol:Symbol};
function MapCanvas({selected,pick,paused,reduced,dark,expanded=false}:{selected?:string;pick:(item:ArchitectureItem)=>void;paused:boolean;reduced:boolean;dark:boolean;expanded?:boolean}){
 const connected=useMemo(()=>new Set(relationships.filter(r=>r.from===selected||r.to===selected).flatMap(r=>[r.from,r.to])),[selected]);
 const nodes=useMemo(()=>[
  ...layers.map((layer,i)=>({id:`layer-${i}`,type:'layer',position:{x:0,y:i*166},data:layer,style:{width:1150,height:154,zIndex:-1},selectable:false,draggable:false})),
  ...architecture.map(item=>({id:item.id,type:'symbol',position:{x:190+item.column*190,y:30+item.layer*166},data:{item,pick,active:item.id===selected,dim:!!selected&&!connected.has(item.id)},style:{width:158,height:115}})),
 ],[selected,pick,connected]);
 const edges=useMemo(()=>relationships.map((r,i)=>{
  const source=architecture.find(n=>n.id===r.from)!,target=architecture.find(n=>n.id===r.to)!;
  const sameLayer=source.layer===target.layer,down=source.layer<target.layer,right=source.column<target.column;
  const sourceSide=sameLayer?(right?'right':'left'):(down?'bottom':'top');
  const targetSide=sameLayer?(right?'left':'right'):(down?'top':'bottom');
  const active=!selected||r.from===selected||r.to===selected;
  return {id:`relationship-${i}`,source:r.from,target:r.to,sourceHandle:`s-${sourceSide}`,targetHandle:`t-${targetSide}`,type:'smoothstep',animated:active&&!paused&&!reduced&&r.kind!=='support',zIndex:active?1:0,style:{stroke:colors[r.kind],strokeWidth:selected&&active?2.2:1.3,opacity:active?(selected?.95:.55):.08,strokeDasharray:r.kind==='support'?'2 7':undefined},markerEnd:{type:MarkerType.ArrowClosed,color:colors[r.kind],width:14,height:14},ariaLabel:`${source.label} to ${target.label}: ${r.label}`};
 }),[selected,paused,reduced]);
 return <div className={`pa-canvas ${expanded?'pa-canvas-expanded':''}`}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:.035}} minZoom={.16} maxZoom={2} nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} deleteKeyCode={null} zoomOnScroll={false} preventScrolling={false} colorMode={dark?'dark':'light'} proOptions={{hideAttribution:true}}><Background gap={24} size={.7} color="var(--color-rule)"/><Controls showInteractive={false}/></ReactFlow></div>
}
export default function OverallArchitecture(){
 const [selected,setSelected]=useState<ArchitectureItem>(),[search,setSearch]=useState(''),[paused,setPaused]=useState(false),[reduced,setReduced]=useState(false),[dark,setDark]=useState(false),[expanded,setExpanded]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),theme=matchMedia('(prefers-color-scheme: dark)');
  const updateMotion=()=>setReduced(motion.matches),updateTheme=()=>setDark(document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&theme.matches));
  updateMotion();updateTheme();motion.addEventListener('change',updateMotion);theme.addEventListener('change',updateTheme);
  const observer=new MutationObserver(updateTheme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  return()=>{motion.removeEventListener('change',updateMotion);theme.removeEventListener('change',updateTheme);observer.disconnect()};
 },[]);
 const matches=architecture.filter(n=>`${n.label} ${n.sub}`.toLowerCase().includes(search.toLowerCase()));
 const connections=relationships.filter(r=>r.from===selected?.id||r.to===selected?.id);
 const mapProps={selected:selected?.id,pick:setSelected,paused,reduced,dark};
 return <section className="pa-overall">
  <div className="pa-heading"><div><h2>One platform. Connected layers.</h2><p>Follow the system from the places I work to the services that remember, retrieve, deliver and observe it.</p></div><span className="pa-level">System-level view<br/>Architecture / 14 October 2026</span></div>
  <div className="pa-workspace"><div className="pa-map">
   <div className="pa-toolbar"><span>{selected?`Connections for ${selected.label}`:'Select an icon to trace its connections'}</span><div>{selected&&<button onClick={()=>setSelected(undefined)}>Show all connections</button>}<button disabled={reduced} aria-pressed={paused||reduced} onClick={()=>setPaused(!paused)}>{reduced?'Motion reduced':paused?'Play flow':'Pause flow'}</button><button onClick={()=>{setExpanded(true);dialog.current?.showModal()}}>Expand ↗</button></div></div>
   <MapCanvas {...mapProps}/>
   <div className="pa-legend"><span><i style={{background:colors.data}}/>Data & requests</span><span><i style={{background:colors.delivery}}/>Delivery & control</span><span><i className="pa-support"/>Hosting & signals</span></div>
   <p className="pa-map-caption">Arrows show direction. Select a component to read the relationship. Pan or zoom to explore; use Fit View to return to the whole map.</p>
  </div><aside className="pa-inspector">
   <label className="pf-search">Find across the platform<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="e.g. Kafka or research"/></label>
   {search&&<div className="pa-results">{matches.map(n=><button key={n.id} onClick={()=>{setSelected(n);setSearch('')}}><ComponentIcon name={n.icon}/><span>{n.label}<small>{n.sub}</small></span></button>)}{!matches.length&&<p role="status">No components match.</p>}</div>}
   <div className="pa-detail" aria-live="polite">{selected?<><ComponentIcon name={selected.icon}/><span className="pf-eyebrow">{layers[selected.layer].name}</span><h3>{selected.label}</h3><span className="pf-sub">{selected.sub}</span><p>{selected.detail}</p></>:<><ComponentIcon name="tools"/><h3>Start with a connection.</h3><p>Select any icon to keep its direct relationships in focus. The whole platform stays in place, so you can see where that component belongs.</p><p>Use the focused views above to follow an individual path in more detail.</p></>}</div>
   {selected&&<div className="pa-connections"><h4>Connected pieces</h4>{connections.map((r,i)=>{const outgoing=r.from===selected.id,other=architecture.find(n=>n.id===(outgoing?r.to:r.from))!;return <button key={`${r.from}-${r.to}-${i}`} onClick={()=>setSelected(other)}><span style={{color:colors[r.kind]}}>{outgoing?'To':'From'} {other.label}</span><small>{r.label}</small></button>})}</div>}
  </aside></div>
  <p className="pf-note pa-boundary">This map groups the major platform systems. PostgreSQL icons represent logical data roles; model routes have different consumers; hosting lines are representative. It is a dated architecture view, not live traffic or a complete service inventory.</p>
  <dialog ref={dialog} className="pf-dialog pa-dialog" onClose={()=>setExpanded(false)}><div className="pf-dialog-head"><strong>Overall architecture{selected?` / ${selected.label}`:''}</strong><button autoFocus onClick={()=>dialog.current?.close()}>Close ×</button></div>{expanded&&<MapCanvas {...mapProps} expanded/>}<p className="pf-dialog-detail" aria-live="polite">{selected?selected.detail:'Select an icon to highlight its direct connections. Pan and zoom to explore the layers.'}</p></dialog>
 </section>
}
