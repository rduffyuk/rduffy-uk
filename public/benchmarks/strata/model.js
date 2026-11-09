(function(root, factory) { const api=factory(); if(typeof module==='object' && module.exports) module.exports=api; else root.StrataModel=api; })(typeof globalThis==='object'?globalThis:this, function() {
  const routes=[[2,6,17,24,38,60,70,88,115,250],[2,6,17,31,42,63,70,88,130,333],[2,6,17,21,49,55,70,88,150,480],[2,6,17,10,39,62,70,88,101,275]];
  const contexts=[2048,32768,131072,262144];
  function experts(i){return routes[((i%4)+4)%4].slice()}
  function snapshot(tokens){return {gpu:[9.33,.38625,4.7612890625,1.5146484375],ram:[8,3.09,51.46706787109375],contextFraction:tokens/262144}}
  function width(gib){return Math.round(gib/64*1000)/10}
  function physicalExtent(gib){return gib / 64 * 100}
  function segmentFraction(gib,capacity){return gib / capacity * 100}
  function gpuOnly(weights){return [weights,2,16-weights-2]}
  function controller(reduced){let view=0,token=0,context=2048,playing=false,poolName='gpu'; return {setView(i){view=Math.max(0,Math.min(2,Number(i)||0));if(view!==0)playing=false},setToken(i){token=((Number(i)||0)%4+4)%4},setContext(n){if(contexts.includes(Number(n))) context=Number(n)},setPool(n){if(['gpu','ram','ssd'].includes(n))poolName=n},setPlaying(p){playing=!!p&&!reduced&&view===0},state(){return {view,token,context,pool:poolName,playing,reducedMotion:reduced,selected:experts(token),snapshot:snapshot(context)}}}}
  function pool(name){return {
    gpu:{extent:15.9921875,segments:[[9.33,'expert'],[.38625,'kv'],[4.7612890625,'other'],[1.5146484375,'free']]},
    ram:{extent:62.55706787109375,observed:34.00482177734375,outside:28.55224609375,outsideFree:false,segments:[[34.00482177734375,'charged'],[28.55224609375,'outside']]},
    ssd:{extent:63.35423609614372,segments:[[63.35423609614372,'file']]}
  }[name]}
  function cells(p){let result=[],cursor=0;for(let i=0;i<Math.ceil(p.extent);i++){let extent=Math.min(1,p.extent-i),end=i+extent,parts=[];cursor=0;for(const [size,kind] of p.segments){let start=cursor;cursor+=size;let amount=Math.max(0,Math.min(end,cursor)-Math.max(i,start));if(amount>0)parts.push({kind,amount})}result.push({extent,parts})}return result}
  function theme(parent,dark){return parent==='light'||parent==='dark'?parent:dark?'dark':'light'}
  return {experts,snapshot,width,physicalExtent,segmentFraction,gpuOnly,controller,pool,cells,theme};
});
