import {useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,Background,Controls,Handle,Position,MarkerType,type NodeProps} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {Flow,Item} from './flows';
import ComponentIcon from './ComponentIcon';
function ComponentNode({data}:NodeProps){
 const item=data.item as Item;
 const iconMode=!!data.iconMode;
 return <><Handle type="target" position={(data.targetPosition as Position)||Position.Left}/><button className={`pf-node ${iconMode?'pf-icon-node':''} ${data.active?'is-active':''} ${data.dim?'is-dim':''}`} onClick={()=> (data.pick as Function)(item)} aria-label={`Inspect ${data.label}`} aria-pressed={!!data.active}>
  {iconMode?<><span className="pf-icon-symbol"><ComponentIcon name={item.icon}/></span><span className="pf-icon-label"><strong>{item.label}</strong><small>{item.sub}</small></span></>:<><span className="pf-node-mark"/><strong>{item.label}</strong><small>{item.sub}</small></>}
 </button><Handle type="source" position={(data.sourcePosition as Position)||Position.Right}/></>
}
const nodeTypes={component:ComponentNode};
export default function FlowDiagram({flow,selected,onSelect,highlight=false,compact=false,expanded=false,iconMode=false}:{flow:Flow;selected?:string;onSelect?:(item:Item)=>void;highlight?:boolean;compact?:boolean;expanded?:boolean;iconMode?:boolean}){
 const [open,setOpen]=useState(false);const [paused,setPaused]=useState(false),[reduced,setReduced]=useState(false),[dark,setDark]=useState(false),[narrow,setNarrow]=useState(false);const holder=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const mq=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(mq.matches);change();mq.addEventListener('change',change);const mode=matchMedia('(prefers-color-scheme: dark)');const theme=()=>setDark(document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&mode.matches));theme();const mo=new MutationObserver(theme);mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});mode.addEventListener('change',theme);const ro=new ResizeObserver(entries=>setNarrow(entries[0].contentRect.width<650));if(holder.current)ro.observe(holder.current);return()=>{mq.removeEventListener('change',change);mode.removeEventListener('change',theme);mo.disconnect();ro.disconnect()}},[]);
 const nodes=useMemo(()=>flow.nodes.map((n,i)=>{
 const sequential=flow.id!=='context';
 const mobilePositions=[[0,0],[1,0],[1,1],[0,1],[0,2],[1,2]];
 const coords=narrow?(sequential?mobilePositions[i]:[i%2,Math.floor(i/2)]):[n.col,n.row];
 let sourcePosition=Position.Right,targetPosition=Position.Left;
 if(sequential&&!narrow){if(i===2)sourcePosition=Position.Bottom;if(i===3){targetPosition=Position.Top;sourcePosition=Position.Left}if(i>=4){targetPosition=Position.Right;sourcePosition=Position.Left}}
 if(sequential&&narrow){if(i===1){sourcePosition=Position.Bottom}if(i===2){targetPosition=Position.Top;sourcePosition=Position.Left}if(i===3){targetPosition=Position.Right;sourcePosition=Position.Bottom}if(i===4){targetPosition=Position.Top;sourcePosition=Position.Right}}
 return {id:n.id,type:'component',position:{x:coords[0]*(iconMode?215:245),y:coords[1]*(iconMode?190:145)},data:{...n,item:n,iconMode,pick:onSelect||(()=>{}),active:selected===n.id,dim:highlight&&selected!==n.id,sourcePosition,targetPosition}};
 }),[flow,selected,onSelect,highlight,narrow,iconMode]);
 const edges=useMemo(()=>flow.links.map(([source,target],i)=>({id:`${flow.id}-${i}`,source,target,type:'smoothstep',animated:!paused&&!reduced,style:{stroke:highlight&&selected!==source?'var(--color-rule)':'var(--color-accent)',strokeWidth:highlight&&selected===source?2.5:1.6,opacity:highlight&&selected!==source?.45:.8},markerEnd:{type:MarkerType.ArrowClosed,color:'var(--color-accent)',width:16,height:16}})),[flow,paused,reduced,highlight,selected]);
 return <div ref={holder} className={`pf-diagram ${iconMode?'pf-icon-diagram':''} ${compact?'pf-compact':''} ${expanded?'pf-expanded':''}`}>
  <div className="pf-diagram-tools"><span>{flow.kicker}</span><div><button onClick={()=>setPaused(!paused)} disabled={reduced} aria-pressed={paused||reduced}>{reduced?'Motion reduced':paused?'Play flow':'Pause flow'}</button>{!expanded&&<button onClick={()=>{setOpen(true);dialog.current?.showModal()}}>Expand ↗</button>}</div></div>
  <div className="pf-canvas"><ReactFlow key={`${flow.id}-${narrow}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:iconMode?.22:.18}} colorMode={dark?'dark':'light'} proOptions={{hideAttribution:true}} nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} deleteKeyCode={null} zoomOnScroll={false} preventScrolling={false} minZoom={.3} maxZoom={1.6} onNodeClick={(_,n)=>onSelect?.(n.data.item as Item)}><Background color="var(--color-rule)" gap={20} size={1}/><Controls showInteractive={false}/></ReactFlow></div>
  <div className="pf-diagram-caption"><span>Dotted lines show direction, not live activity.</span><span>Select a component to read more.</span></div>
  {!expanded&&<dialog ref={dialog} className="pf-dialog" onClose={()=>setOpen(false)}><div className="pf-dialog-head"><strong>{flow.title}</strong><button onClick={()=>dialog.current?.close()} autoFocus>Close ×</button></div>{open&&<FlowDiagram flow={flow} selected={selected} onSelect={onSelect} expanded iconMode={iconMode}/>}{selected&&<p className="pf-dialog-detail">{flow.nodes.find(n=>n.id===selected)?.detail}</p>}</dialog>}
 </div>
}
