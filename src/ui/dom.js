/** Minimal DOM construction helpers shared by the floating UI components. */

export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

export function button(text, onClick, className = '') {
  const b = el('button', className, text);
  b.addEventListener('click', onClick);
  return b;
}

export function input(type, attrs = {}) {
  const i = el('input');
  i.type = type;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'checked') i.checked = !!v;
    else i.setAttribute(k, v);
  }
  return i;
}

export function row(labelText, control) {
  const r = el('div', 'row');
  if (labelText) r.appendChild(el('label', null, labelText));
  if (control) r.appendChild(control);
  return r;
}

export function select(options, value) {
  const s = el('select');
  for (const o of options) {
    const opt = el('option', null, o.label);
    opt.value = o.value;
    s.appendChild(opt);
  }
  if (value != null) s.value = value;
  return s;
}

/** Preset color palette used by the swatch pickers. */
export const PALETTE = [
  '#4ea1ff', '#4ec9a1', '#ffb454', '#ff6b6b',
  '#b48bff', '#f06595', '#8b98a9', '#ffffff'
];

/** A row of color swatches. onPick(hex|null). `null` swatch means default. */
export function swatchRow(current, onPick) {
  const wrap = el('div', 'swatches');
  const def = el('div', 'swatch');
  def.style.background = 'repeating-linear-gradient(45deg,#333,#333 3px,#555 3px,#555 6px)';
  def.title = 'Default';
  if (!current) def.classList.add('active');
  def.addEventListener('click', () => onPick(null));
  wrap.appendChild(def);
  for (const hex of PALETTE) {
    const sw = el('div', 'swatch');
    sw.style.background = hex;
    sw.title = hex;
    if (current && current.toLowerCase() === hex.toLowerCase()) sw.classList.add('active');
    sw.addEventListener('click', () => onPick(hex));
    wrap.appendChild(sw);
  }
  return wrap;
}
