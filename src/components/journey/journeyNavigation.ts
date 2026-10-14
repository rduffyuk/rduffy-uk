import type { Milestone } from './types';

// Date plus title remains stable when a new milestone is inserted before it.
export function milestoneId(m: Pick<Milestone, 'date' | 'title' | 'stableId'>) {
  return m.stableId ?? `${m.date}-${m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function storyHref(href: string, milestone: Pick<Milestone, 'date' | 'title' | 'stableId'>, mode: string, showDecisions = false) {
  const url = new URL(href, 'https://rduffy.uk');
  if (url.hostname === 'blog.rduffy.uk') url.pathname = url.pathname.replace(/^\/posts\//, '/writing/');
  if (!['rduffy.uk', 'blog.rduffy.uk'].includes(url.hostname)) return href;
  url.searchParams.set('journey', milestoneId(milestone));
  url.searchParams.set('view', mode);
  if (showDecisions) url.searchParams.set('decisions', '1');
  return `${url.pathname}${url.search}${url.hash}`;
}
