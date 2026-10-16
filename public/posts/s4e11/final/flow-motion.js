// Both inline and expanded views share motion state; reduced motion takes priority.
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const buttons = [...document.querySelectorAll('[data-flow-motion]')];
  let paused = false;
  function update() {
    const stopped = paused || preference.matches;
    document.documentElement.classList.toggle('flow-paused', stopped);
    buttons.forEach(button => {
      button.disabled = preference.matches;
      button.setAttribute('aria-pressed', String(stopped));
      button.textContent = preference.matches ? 'Motion reduced' : paused ? 'Play flow' : 'Pause flow';
    });
  }
  buttons.forEach(button => button.addEventListener('click', () => { paused = !paused; update(); }));
  preference.addEventListener('change', update);
  update();
})();
