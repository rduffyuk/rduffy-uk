(() => {
  const figure = document.querySelector('[data-policy-flow]');
  const dialog = document.querySelector('[data-flow-dialog]');
  if (!figure || !dialog) return;
  figure.querySelector('[data-flow-expand]').addEventListener('click', () => {
    const target = dialog.querySelector('[data-flow-expanded-content]');
    const clone = figure.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelector('.flow-tools').remove();
    const ids = [...clone.querySelectorAll('[id]')].map(el => el.id);
    let markup = clone.outerHTML;
    ids.forEach(id => { markup = markup.split(id).join(id + '-expanded'); });
    target.innerHTML = markup;
    dialog.showModal();
  });
  dialog.querySelector('[data-flow-close]').addEventListener('click', () => dialog.close());
})();
