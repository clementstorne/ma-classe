import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { photoOf } from '../store.js';
import { initials, CLASS_COLORS } from '../util.js';

export function Avatar({ s, size = 40 }) {
  const p = s && photoOf(s.id);
  const st = { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' };
  if (p) return html`<img class="avatar" style=${st} src=${p} alt="" />`;
  return html`<span class="avatar" style=${st}>${s ? initials(s) : '?'}</span>`;
}

export function Modal({ title, onClose, children, foot, wide }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose && onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return html`<div class="overlay" onMouseDown=${e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
    <div class=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${title}</h2><button class="btn ghost small" onClick=${onClose} aria-label="Fermer">✕</button></div>
      <div class="modal-body">${children}</div>
      ${foot ? html`<div class="modal-foot">${foot}</div>` : null}
    </div></div>`;
}

export function Field({ label, children }) {
  return html`<label class="field"><span>${label}</span>${children}</label>`;
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

export function Empty({ title, children }) {
  return html`<div class="empty"><h2>${title}</h2>${children}</div>`;
}

/** Sélecteur de période d'un établissement. value = id de période, 'all' ou 'x' */
export function PeriodSelect({ etab, value, onChange }) {
  return html`<select class="inp" style="width:auto" value=${value} onChange=${e => onChange(e.target.value)}>
    ${(etab.periods || []).map(p => html`<option value=${p.id}>${p.name}</option>`)}
    <option value="all">Toute l'année</option></select>`;
}

/** Normalise « #3558e6 », « 3558E6 » ou « #35e » en « #3558e6 » ; null si invalide. */
export function normHex(s) {
  let v = String(s || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map(c => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : null;
}

/** Sélecteur de couleur : pastilles de la palette + saisie d'un code HEX. */
export function ColorPicker({ value, onChange }) {
  const [draft, setDraft] = useState(null);       // texte en cours de saisie (null = suit la valeur)
  const shown = draft !== null ? draft : value;
  const ok = normHex(shown) !== null;
  return html`<div class="col" style="gap:10px">
    <div class="swatches" role="radiogroup" aria-label="Couleur">
      ${CLASS_COLORS.map(c => html`<button type="button" role="radio" aria-checked=${value === c} class=${'swatch' + (value === c ? ' on' : '')} style=${{ background: c }} aria-label=${c} onClick=${() => { setDraft(null); onChange(c); }}></button>`)}
    </div>
    <div class="row">
      <span class="swatch on" style=${{ background: value, cursor: 'default' }} aria-hidden="true"></span>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>Code HEX</span>
        <input class=${'inp' + (ok ? '' : ' bad')} style="width:130px;font-family:ui-monospace,Menlo,monospace" placeholder="#3558e6" maxlength="7" autocapitalize="off" autocomplete="off" spellcheck="false"
          value=${shown} onInput=${e => { const v = e.target.value; setDraft(v); const h = normHex(v); if (h) onChange(h); }} onBlur=${() => setDraft(null)} /></label>
      ${ok ? null : html`<span class="small" style="color:var(--ko)">Code invalide (ex. #3558e6)</span>`}
    </div></div>`;
}
