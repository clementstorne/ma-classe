import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { photoOf } from '../store.js';
import { initials } from '../util.js';

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
