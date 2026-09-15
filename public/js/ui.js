/* Мелкие помощники представления */

window.esc = function (s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

const CUR_SIGN = { USD: '$', EUR: '€', AMD: '֏', RUB: '₽' };

window.money = function (amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount).toLocaleString(window.I18N.lang === 'en' ? 'en-US' : 'ru-RU');
  const sign = CUR_SIGN[currency] || currency || '';
  return currency === 'USD' || currency === 'EUR' ? sign + n : n + ' ' + sign;
};

window.numFmt = function (n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString(window.I18N.lang === 'en' ? 'en-US' : 'ru-RU');
};

window.dateFmt = function (iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const locale = { hy: 'hy-AM', ru: 'ru-RU', en: 'en-US' }[window.I18N.lang] || 'ru-RU';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
};

window.timeFmt = function (iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const locale = { hy: 'hy-AM', ru: 'ru-RU', en: 'en-US' }[window.I18N.lang] || 'ru-RU';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

window.cityName = function (key) { return window.lookup(window.CITIES, key) || ''; };

window.plural = function (n, one, few, many) {
  n = Math.abs(Number(n)) || 0;
  if (window.I18N.lang === 'en' || window.I18N.lang === 'hy') return n === 1 ? one : many;
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

window.pluralWord = function (n, stem) {
  return window.plural(n, window.t(stem + 'One'), window.t(stem + 'Few'), window.t(stem + 'Many'));
};

window.setTitle = function (part) {
  document.title = part ? part + ' — TooBarter' : window.t('metaTitle');
};

/* Название категории объекта */
window.kindName = function (l) {
  if (l.kind === 'car') return window.t('car');
  return window.t(l.realty_type || 'realty');
};

/* Строка характеристик под заголовком карточки */
window.specLine = function (l) {
  const parts = [];
  if (l.kind === 'car') {
    if (l.year) parts.push(l.year);
    if (l.mileage) parts.push(window.numFmt(l.mileage) + ' ' + window.t('km'));
    if (l.engine) parts.push(l.engine + 'L');
    if (l.transmission) parts.push(window.lookup(window.OPTIONS.transmission, l.transmission));
  } else {
    if (l.rooms) parts.push(l.rooms + ' ' + window.t('rooms').toLowerCase());
    if (l.area) parts.push(window.numFmt(l.area) + ' ' + window.t('sqm'));
    if (l.land_area) parts.push(window.numFmt(l.land_area) + ' ' + window.t('sotka'));
    if (l.floor) parts.push(l.floor + (l.floors ? '/' + l.floors : '') + ' ' + window.t('floor').toLowerCase());
  }
  if (l.city) parts.push(window.cityName(l.city));
  return parts.filter(Boolean).join(' · ');
};

/* Плашка доплаты: + мне, − с меня */
window.payChip = function (dir, amount, currency, short) {
  if (!dir || dir === 'none' || !amount) return '';
  const cls = dir === 'in' ? 'chip-plus' : 'chip-minus';
  const sign = dir === 'in' ? '+' : '−';
  const label = short ? '' : ' ' + (dir === 'in' ? window.t('payIn') : window.t('payOut'));
  return `<span class="chip ${cls}" title="${esc(dir === 'in' ? window.t('payIn') : window.t('payOut'))}">${sign}${esc(window.money(amount, currency))}${short ? '' : esc(label)}</span>`;
};

/* Что человек хочет получить взамен (запасной вариант, если пожеланий не задано) */
window.wantedLine = function (l) {
  const kinds = (l.wanted_kinds || []).map((k) => window.t(k));
  if (l.wanted_text) kinds.push(l.wanted_text);
  return kinds.length ? kinds.join(', ') : window.t('all');
};

/* ---------- рейтинг (звёзды) ---------- */
window.starsHtml = function (avg, count, size) {
  if (!count) return `<span class="small muted">${esc(window.t('noReviewsYet'))}</span>`;
  const full = Math.round(avg);
  const stars = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= full ? 'on' : ''}">★</span>`).join('');
  return `<span class="stars${size === 'lg' ? ' lg' : ''}" aria-hidden="true">${stars}</span>
    <span class="small muted">${esc(String(avg))} · ${count} ${esc(window.pluralWord(count, 'reviews'))}</span>`;
};

/* Интерактивный выбор оценки 1–5 для формы отзыва */
window.starPickerHtml = function (id, value) {
  const v = value || 0;
  return `<div class="star-picker" id="${id}" role="radiogroup" aria-label="${esc(window.t('yourRating'))}">
    ${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-v="${i}" class="${i <= v ? 'on' : ''}"
      role="radio" aria-checked="${i === v ? 'true' : 'false'}"
      aria-label="${esc(window.t('starLabel', { n: i }))}">★</button>`).join('')}
  </div>`;
};

/* ---------- тосты ---------- */
window.toast = function (msg, bad) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2800);
};

/* ---------- модальное окно ---------- */
window.openModal = function (title, bodyHtml, footHtml) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" data-close="1">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="btn btn-ghost btn-sm" data-close="1" aria-label="${esc(window.t('close'))}">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
      </div>
    </div>`;
  const overlay = root.firstElementChild;
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') === e.target || e.target.dataset.close) {
      if (e.target.dataset.close) window.closeModal();
    }
  });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', (e) => {
    if (e.currentTarget === e.target || e.currentTarget.tagName === 'BUTTON') window.closeModal();
  }));
  document.addEventListener('keydown', escClose);
  return root.querySelector('.modal');
};
function escClose(e) { if (e.key === 'Escape') window.closeModal(); }
window.closeModal = function () {
  document.getElementById('modal-root').innerHTML = '';
  document.removeEventListener('keydown', escClose);
};

/* ---------- сборка <option> ---------- */
window.optionsHtml = function (list, selected, placeholder) {
  let html = placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '';
  for (const row of list) {
    const val = Array.isArray(row) ? row[0] : row;
    const text = Array.isArray(row) ? window.label(row) : row;
    html += `<option value="${esc(val)}"${String(selected) === String(val) ? ' selected' : ''}>${esc(text)}</option>`;
  }
  return html;
};

window.yearsList = function () {
  const now = new Date().getFullYear() + 1;
  const arr = [];
  for (let y = now; y >= 1960; y--) arr.push(String(y));
  return arr;
};

/* ============================================================
   Пожелания к обмену: подписи, критерии, результат проверки
   ============================================================ */

window.wishKindLabel = function (w) {
  return !w.kind || w.kind === 'any' ? window.t('anyKind') : window.t(w.kind);
};

/* Человеческое значение поля: справочники переводим, числа форматируем */
window.valLabel = function (field, v) {
  if (v === null || v === undefined || v === '') return '—';
  switch (field) {
    case 'kind': return window.t(v) || v;
    case 'city': return window.cityName(v) || v;
    case 'transmission': return window.lookup(window.OPTIONS.transmission, v);
    case 'fuel': return window.lookup(window.OPTIONS.fuel, v);
    case 'body': return window.lookup(window.OPTIONS.body, v);
    case 'mileage_max': case 'price': return window.numFmt(String(v).replace(/[^\d.-]/g, '')) || v;
    default: return String(v);
  }
};

/* Список условий одного пожелания — короткими «техническими» строками */
window.wishCriteria = function (w) {
  const out = [];
  const t = window.t;
  const model = [w.make, w.model].filter(Boolean).join(' ');
  if (model) out.push(model);
  if (w.year_min && w.year_max) out.push(`${w.year_min}–${w.year_max}`);
  else if (w.year_min) out.push(`${w.year_min}+`);
  else if (w.year_max) out.push(`≤ ${w.year_max}`);
  if (w.mileage_max) out.push(`≤ ${window.numFmt(w.mileage_max)} ${t('km')}`);
  if (w.transmission) out.push(window.lookup(window.OPTIONS.transmission, w.transmission));
  if (w.fuel) out.push(window.lookup(window.OPTIONS.fuel, w.fuel));
  if (w.body) out.push(window.lookup(window.OPTIONS.body, w.body));
  if (w.city) out.push('📍 ' + window.cityName(w.city));
  if (w.area_min) out.push(`≥ ${window.numFmt(w.area_min)} ${t('sqm')}`);
  if (w.land_min) out.push(`≥ ${window.numFmt(w.land_min)} ${t('sotka')}`);
  if (w.rooms_min) out.push(`≥ ${w.rooms_min} ${t('rooms').toLowerCase()}`);
  if (w.price_min && w.price_max) out.push(`${window.money(w.price_min, w.price_currency)} – ${window.money(w.price_max, w.price_currency)}`);
  else if (w.price_min) out.push(`≥ ${window.money(w.price_min, w.price_currency)}`);
  else if (w.price_max) out.push(`≤ ${window.money(w.price_max, w.price_currency)}`);
  return out;
};

/* Плашка условия по доплате внутри пожелания */
window.wishPayChip = function (w) {
  if (!w || (w.pay_direction !== 'in' && w.pay_direction !== 'out')) return '';
  const isIn = w.pay_direction === 'in';
  const sign = isIn ? '+' : '−';
  const cmp = isIn ? '≥' : '≤';
  const label = isIn ? window.t('payWishIn') : window.t('payWishOut');
  return `<span class="chip ${isIn ? 'chip-plus' : 'chip-minus'}" title="${esc(label)}">${sign} ${cmp} ${esc(window.money(w.pay_min, w.pay_currency))}</span>`;
};

/* Карточка пожелания для страницы объявления */
window.wishCardHtml = function (w, i, extra) {
  const crit = window.wishCriteria(w);
  return `
  <div class="wish">
    <div class="wish-head">
      <span class="wish-num mono">${String(i + 1).padStart(2, '0')}</span>
      <b>${esc(window.wishKindLabel(w))}</b>
      ${window.wishPayChip(w)}
      ${extra || ''}
    </div>
    ${crit.length ? `<div class="wish-crit">${crit.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
    ${w.note ? `<div class="wish-note">${esc(w.note)}</div>` : ''}
  </div>`;
};

/* Короткая строка пожеланий для карточки в ленте */
window.wishLine = function (l) {
  const ws = l.wishes || [];
  if (!ws.length) return window.wantedLine(l);
  const first = [window.wishKindLabel(ws[0]), ...window.wishCriteria(ws[0])].join(' · ');
  return ws.length > 1 ? `${first} +${ws.length - 1}` : first;
};

/* Одна строка результата проверки */
window.checkRow = function (c) {
  const KEY = {
    kind: 'kind', make: 'make', model: 'model', year_min: 'year', year_max: 'year',
    mileage_max: 'mileage', transmission: 'transmission', fuel: 'fuel', body: 'body',
    city: 'city', area_min: 'area', land_min: 'landArea', rooms_min: 'rooms',
    price: 'price', pay: 'payDirection',
  };
  const name = window.t(KEY[c.field] || c.field);
  let need, got;
  if (c.field === 'pay') {
    const fmt = (o) => (o.direction === 'none' ? window.t('payNone')
      : (o.direction === 'in' ? '+' : '−') + ' ' + window.money(o.amount, o.currency));
    need = (c.need.direction === 'in' ? '+ ≥ ' : '− ≤ ') + window.money(c.need.amount, c.need.currency);
    got = fmt(c.got);
  } else {
    need = window.valLabel(c.field, c.need);
    got = window.valLabel(c.field, c.got);
  }
  return `<div class="check ${c.ok ? 'ok' : 'no'}">
    <span class="check-ico">${c.ok ? '✓' : '✕'}</span>
    <span class="check-name">${esc(name)}</span>
    <span class="check-need mono">${esc(need)}</span>
    <span class="check-got mono">${esc(got)}</span>
  </div>`;
};
