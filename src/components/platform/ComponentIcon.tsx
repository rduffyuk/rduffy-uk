import type {ReactNode} from 'react';

// Purpose-based symbols: components may represent several services, not one vendor.
const symbols = {
 research: <><path d="M19 5h10m-8 0v13L9 37a4 4 0 0 0 4 6h22a4 4 0 0 0 4-6L27 18V5M15 28h18"/><circle cx="22" cy="34" r="2"/><path d="M30 38h1"/></>,
 models: <><rect x="12" y="12" width="24" height="24" rx="6"/><path d="M18 5v7m12-7v7M18 36v7m12-7v7M5 18h7m-7 12h7m24-12h7m-7 12h7m-19-9 4-4 5 4-5 6z"/></>,
 cluster: <><rect x="5" y="5" width="15" height="14" rx="2"/><rect x="28" y="5" width="15" height="14" rx="2"/><rect x="5" y="29" width="15" height="14" rx="2"/><rect x="28" y="29" width="15" height="14" rx="2"/><path d="M20 12h8M20 36h8M12 19v10m24-10v10"/></>,
 terminal: <><rect x="6" y="9" width="36" height="28" rx="4"/><path d="m13 18 6 5-6 5m12 0h9M6 15h36"/></>,
 tools: <><circle cx="24" cy="24" r="7"/><circle cx="9" cy="10" r="4"/><circle cx="39" cy="10" r="4"/><circle cx="9" cy="38" r="4"/><circle cx="39" cy="38" r="4"/><path d="m12 13 7 6m10 0 7-6M12 35l7-6m10 0 7 6"/></>,
 database: <><ellipse cx="24" cy="11" rx="15" ry="6"/><path d="M9 11v26c0 8 30 8 30 0V11M9 23c0 8 30 8 30 0"/></>,
 search: <><circle cx="21" cy="21" r="13"/><path d="m31 31 10 10M14 17h14m-14 7h9"/></>,
 graph: <><circle cx="11" cy="11" r="5"/><circle cx="36" cy="12" r="5"/><circle cx="24" cy="36" r="5"/><path d="m15 11 16 1M13 16l9 15m12-14-8 14"/></>,
 source: <><path d="M28 29v11H9V7h15l4 5v7M22 7v8h6m-13 8h6m-6 6h5"/><path d="m29 27 4-4a6 6 0 0 1 8 8l-5 5a6 6 0 0 1-8 0m6-6-4 4a6 6 0 0 1-8-8l4-4"/></>,
 documents: <><path d="M15 6h18l7 7v23H15zM32 6v9h8M8 14v29h25M21 23h13m-13 7h9"/></>,
 events: <><path d="M6 13h36M6 24h36M6 35h36"/><circle cx="16" cy="13" r="4"/><circle cx="32" cy="24" r="4"/><circle cx="21" cy="35" r="4"/></>,
 workers: <><rect x="12" y="12" width="24" height="24" rx="4"/><path d="m20 19-5 5 5 5m8-10 5 5-5 5M18 5v7m12-7v7M18 36v7m12-7v7M5 18h7m-7 12h7m24-12h7m-7 12h7"/></>,
 indexes: <><ellipse cx="17" cy="12" rx="11" ry="5"/><path d="M6 12v23c0 6 22 6 22 0V12M6 23c0 6 22 6 22 0M34 12h8m-8 10h8m-8 10h8m-8 10h8"/></>,
 original: <><path d="M28 40H10V7h19l7 7v10M28 7v8h8M16 22h12m-12 7h7m11 0-5 5 5 5m-4-5h7a6 6 0 0 0 6-6"/></>,
 checkpoint: <><path d="M9 8h30v32H9zM15 15h18m-18 7h10m-10 7h6"/><circle cx="34" cy="34" r="9"/><path d="m30 34 3 3 5-6"/></>,
 capture: <><path d="m24 5 15 6v11c0 10-15 21-15 21S9 32 9 22V11z"/><path d="m17 24 5 5 10-12"/></>,
 scope: <><path d="M7 9h26v10M7 17h18M7 25h12"/><path d="m32 22 10 4v7c0 6-10 12-10 12S22 39 22 33v-7z"/><path d="m28 33 3 3 5-6"/></>,
 redact: <><path d="M9 7h22l6 6v9M30 7v8h7M9 7v33h15M15 21h13m-13 7h9m-9 6h5m11-1 10-10 5 5-10 10-7 2z"/></>,
 recall: <><path d="M12 14A16 16 0 1 1 8 29M12 6v9H3"/><path d="M24 14v11l7 4"/></>,
 change: <><circle cx="12" cy="9" r="4"/><circle cx="12" cy="39" r="4"/><path d="M12 13v22m0-11c0-11 23 0 23-12"/><circle cx="35" cy="8" r="4"/><path d="m27 33 5 5 10-12"/></>,
 build: <><path d="M19 5h10l1 6 5 3 6-2 5 9-5 4v6l-5 8-6-2-5 6-9-3v-6l-5-3-6 1-3-9 5-4v-6l6-5z"/><path d="m16 24 6 6 11-12"/></>,
 package: <><path d="m7 14 17-9 17 9v20l-17 9-17-9zM7 14l17 10 17-10M24 24v19M16 9l17 10v10"/></>,
 config: <><path d="M10 9h28M10 24h28M10 39h28"/><circle cx="18" cy="9" r="4"/><circle cx="31" cy="24" r="4"/><circle cx="20" cy="39" r="4"/></>,
 reconcile: <><path d="M8 20a17 17 0 0 1 29-9l5 5m0-10v10H32M40 28a17 17 0 0 1-29 9l-5-5m0 10V32h10"/><path d="m18 24 4 4 8-9"/></>,
 observe: <><rect x="5" y="8" width="38" height="28" rx="3"/><path d="M18 43h12m-6-7v7M10 24h7l4-8 6 15 4-7h7"/></>,
} satisfies Record<string,ReactNode>;

export type ComponentIconName = keyof typeof symbols;
export default function ComponentIcon({name,className=''}:{name:ComponentIconName;className?:string}){
 return <svg className={`pf-component-icon ${className}`} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{symbols[name]}</svg>;
}
