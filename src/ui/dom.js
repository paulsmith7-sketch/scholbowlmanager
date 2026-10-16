// Tiny DOM helpers. Views are plain functions that return elements.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (tag === 'form' && key === 'onsubmit') handleSubmit(el, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'selected' || key === 'disabled') el[key] = !!value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

// Forms are submitted by script rather than natively. Sandboxed previews
// (such as a file opened inside another app) block native form submission
// entirely, which would make every button that submits a form do nothing.
function handleSubmit(form, onsubmit) {
  const run = (e) => {
    e.preventDefault();
    if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;
    onsubmit(e);
  };
  form.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button && form.contains(button) && (button.getAttribute('type') || 'submit') === 'submit') run(e);
  });
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file'].includes(e.target.type)) run(e);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint && h('span', { class: 'hint' }, hint));
}

export function select(options, value, attrs = {}) {
  return h(
    'select',
    attrs,
    options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)),
  );
}

export function fmt(n, digits = 1) {
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

export function pct(n) {
  return n.toFixed(3).replace(/^0/, '');
}

// Opens a modal dialog built by `build(close)`. Resolves when closed.
export function openDialog(build) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog' });
    const close = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.append(build(close));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('input, select, button')?.focus();
  });
}

// In-page confirmation (never window.confirm, which blocks the page).
export function confirmDialog(message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return openDialog((close) =>
    h(
      'form',
      { method: 'dialog', class: 'stack', onsubmit: (e) => (e.preventDefault(), close(true)) },
      h('p', {}, message),
      h(
        'div',
        { class: 'row end' },
        h('button', { type: 'button', class: 'btn', onclick: () => close(false) }, 'Cancel'),
        h('button', { type: 'submit', class: danger ? 'btn danger' : 'btn primary' }, confirmLabel),
      ),
    ),
  );
}

let toastTimer;
export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), kind === 'error' ? 6000 : 2500);
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
