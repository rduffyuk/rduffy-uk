// Enhance only explicitly authored glossaries; static definitions and the native
// disclosure remain available without JavaScript. No remote search or requests.
document.querySelectorAll<HTMLDetailsElement>('details[data-glossary]').forEach((panel) => {
  const terms = [...panel.querySelectorAll<HTMLElement>('.glossary-term')];
  const tools = panel.querySelector<HTMLElement>('.glossary-tools');
  const input = panel.querySelector<HTMLInputElement>('input[type="search"]');
  const clear = panel.querySelector<HTMLButtonElement>('[data-glossary-clear]');
  const status = panel.querySelector<HTMLElement>('.glossary-status');
  if (!tools || !input || !clear || !status) return;

  function filter() {
    const query = input!.value.trim().toLocaleLowerCase();
    let count = 0;
    terms.forEach((term) => {
      const matches = (term.textContent ?? '').toLocaleLowerCase().includes(query);
      term.hidden = !matches;
      if (matches) count++;
    });
    status!.textContent = count === 0
      ? 'No matching terms. Try another name or word.'
      : `${count} of ${terms.length} terms shown`;
  }

  function reveal(id: string) {
    const target = document.getElementById(id);
    // Keep the original #glossary introduction/sidebar links working too.
    if (id !== 'glossary' && (!target || !panel.contains(target))) return;
    input!.value = '';
    filter();
    panel.open = true;
    const destination = id === 'glossary' ? panel : target!;
    requestAnimationFrame(() => {
      destination.scrollIntoView({ block: 'start' });
      if (destination !== panel) destination.focus({ preventScroll: true });
    });
  }

  function revealHash() {
    try { reveal(decodeURIComponent(window.location.hash.slice(1))); }
    catch { /* An unrelated malformed fragment must not break the article. */ }
  }

  input.addEventListener('input', filter);
  clear.addEventListener('click', () => {
    input.value = '';
    filter();
    input.focus();
  });
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#glossary"]').forEach((link) => {
    link.addEventListener('click', () => {
      try { reveal(decodeURIComponent(link.hash.slice(1))); }
      catch { /* Preserve normal navigation for invalid fragments. */ }
    });
  });
  window.addEventListener('hashchange', revealHash);
  tools.hidden = false;
  filter();
  revealHash();
});
