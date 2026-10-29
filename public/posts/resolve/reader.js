(()=>{
const motion = document.getElementById('diagram-motion');
const diagram = document.getElementById('investigation-diagram');
const full = document.getElementById('diagram-full');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let running = false;
let resetTimer;
function setMotion(play) {
  clearTimeout(resetTimer);
  running = play && !reduce.matches;
  diagram.src = running ? '/posts/resolve/investigation-loop.svg' : '/posts/resolve/investigation-loop.static.svg';
  full.href = diagram.src;
  motion.disabled = reduce.matches;
  motion.setAttribute('aria-pressed',String(running));
  motion.textContent = reduce.matches ? 'Reduced motion enabled' : running ? 'Pause diagram' : 'Play diagram';
  // The retained SVG's animation ends after three 1.6-second cycles.
  if (running) resetTimer = setTimeout(()=>setMotion(false),5000);
}
motion.addEventListener('click',()=>setMotion(!running));
reduce.addEventListener('change',()=>setMotion(false));
setMotion(false);

const search = document.getElementById('glossary-search');
const entries = [...document.querySelectorAll('.glossary dl > div')];
entries.forEach(entry => {
  entry.id = 'term-' + entry.querySelector('dt').textContent.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
});
function filterGlossary() {
  const query = search.value.toLowerCase().trim();
  entries.forEach(entry => { entry.hidden = !entry.textContent.toLowerCase().includes(query); });
  document.getElementById('glossary-count').textContent = `${entries.filter(entry => !entry.hidden).length} of ${entries.length} terms shown`;
}
search.addEventListener('input', filterGlossary);
document.getElementById('glossary-clear').addEventListener('click', () => { search.value = ''; filterGlossary(); search.focus(); });
function showFragment() {
  const entry = entries.find(entry => '#' + entry.id === location.hash);
  if (entry) { search.value=''; filterGlossary(); entry.closest('details').open = true; entry.scrollIntoView(); }
}
addEventListener('hashchange', showFragment);
filterGlossary(); showFragment();

})();
