/**
 * A small centered modal that asks for a single line of text. Returns a
 * Promise resolving to the entered string, or null if cancelled. Enter
 * confirms, Escape / backdrop click / Cancel dismisses.
 */
export function promptText({ title = 'Enter value', label = '', value = '', okText = 'OK', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');

    const h = el('h3', 'modal-title');
    h.textContent = title;
    card.appendChild(h);

    if (label) {
      const l = el('div', 'modal-label');
      l.textContent = label;
      card.appendChild(l);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = value;
    input.placeholder = placeholder;
    card.appendChild(input);

    const btns = el('div', 'modal-btns');
    const cancel = el('button', 'modal-b');
    cancel.textContent = 'Cancel';
    const ok = el('button', 'modal-b primary');
    ok.textContent = okText;
    btns.append(cancel, ok);
    card.appendChild(btns);

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const close = (result) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter') { e.preventDefault(); close(input.value); }
    };

    cancel.addEventListener('click', () => close(null));
    ok.addEventListener('click', () => close(input.value));
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(null); });
    document.addEventListener('keydown', onKey, true);

    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}
