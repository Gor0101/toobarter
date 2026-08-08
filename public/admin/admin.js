/* ============================================================
   TooBarter — отдельная админ-панель (своя точка входа /admin/,
   логин общий с основным сайтом через /api/auth/login).
   ============================================================ */

const root = document.getElementById('root');
let token = localStorage.getItem('token') || null;
let me = null;
let range = 30; // диапазон графиков в днях: 7 / 30 / 90

function setToken(t) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CUR_SIGN = { USD: '$', EUR: '€', AMD: '֏', RUB: '₽' };
function money(n, cur) {
  if (n === null || n === undefined) return '—';
  const s = Number(n).toLocaleString('ru-RU');
  const sign = CUR_SIGN[cur] || cur || '';
  return cur === 'USD' || cur === 'EUR' ? sign + s : s + ' ' + sign;
}
function dateFmt(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function shortDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function toast(msg, bad) {
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
}

const ERR_TEXT = {
  bad_credentials: 'Неверная почта или пароль',
  banned: 'Этот аккаунт заблокирован',
  forbidden: 'У этого аккаунта нет прав администратора',
  network: 'Нет связи с сервером',
  not_pending: 'Заявка уже обработана',
  cannot_ban_self: 'Нельзя заблокировать самого себя',
};
function errText(code) { return ERR_TEXT[code] || 'Ошибка сервера. Попробуй ещё раз.'; }

async function api(method, path, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('network');
  }
  let data = null;
  try { data = await res.json(); } catch { /* пусто */ }
  if (!res.ok) {
    const code = (data && data.error) || 'server_error';
    if (res.status === 401) setToken(null);
    throw new Error(code);
  }
  return data;
}

/* ---------------- вход ---------------- */

function renderLogin(notice) {
  root.innerHTML = `
    <div class="admin-login-wrap">
      <div class="admin-login panel">
        <h1>Админ-панель</h1>
        <p class="lead">Вход тот же, что и на сайте — только письмо из ADMIN_EMAILS откроет доступ.</p>
        ${notice ? `<div class="fit-note no" style="margin-bottom:12px">${esc(notice)}</div>` : ''}
        <div class="stack">
          <div class="field"><label>Почта</label><input id="a-email" type="email" autocomplete="username"></div>
          <div class="field"><label>Пароль</label><input id="a-pass" type="password" autocomplete="current-password"></div>
          <button class="btn btn-primary btn-block" id="a-submit">Войти</button>
          <a class="btn btn-block" href="/">На сайт</a>
        </div>
      </div>
    </div>`;

  const submit = document.getElementById('a-submit');
  const doLogin = async () => {
    submit.disabled = true;
    try {
      const r = await api('POST', '/auth/login', {
        email: document.getElementById('a-email').value,
        password: document.getElementById('a-pass').value,
      });
      setToken(r.token);
      me = r.user;
      if (!me.is_admin) {
        setToken(null);
        return renderLogin('У этого аккаунта нет прав администратора.');
      }
      renderShell();
    } catch (e) {
      toast(errText(e.message), true);
      submit.disabled = false;
    }
  };
  submit.addEventListener('click', doLogin);
  root.querySelector('#a-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

/* ---------------- каркас ---------------- */

const TABS = [
  ['overview', 'Обзор'],
  ['payments', 'Оплаты'],
  ['listings', 'Объявления'],
  ['users', 'Пользователи'],
];

function currentTab() {
  const h = location.hash.replace('#', '');
  return TABS.some(([k]) => k === h) ? h : 'overview';
}

function renderShell() {
  root.innerHTML = `
    <div class="admin-shell">
      <div class="admin-top">
        <a class="brand" href="/">
          <span class="brand-mark">⇄</span>
          <span><b>TooBarter</b><span>Админ-панель</span></span>
        </a>
        <div class="row" style="gap:10px">
          <span class="small muted">${esc(me.name)} · ${esc(me.email)}</span>
          <button class="btn btn-sm" id="a-logout">Выйти</button>
        </div>
      </div>
      <div class="admin-main">
        <div class="tabs" id="a-tabs">
          ${TABS.map(([k, label]) => `<a class="tab${currentTab() === k ? ' on' : ''}" href="#${k}">${esc(label)}</a>`).join('')}
        </div>
        <div id="a-body"></div>
      </div>
    </div>`;

  document.getElementById('a-logout').addEventListener('click', () => {
    setToken(null);
    me = null;
    renderLogin();
  });

  renderTab();
}

function renderTab() {
  document.querySelectorAll('#a-tabs .tab').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + currentTab()));
  const body = document.getElementById('a-body');
  if (!body) return;
  body.innerHTML = `<div class="skeleton" style="height:40vh"></div>`;
  const fns = { overview: renderOverview, payments: renderPayments, listings: renderListings, users: renderUsers };
  fns[currentTab()](body).catch((e) => {
    body.innerHTML = `<div class="empty"><div class="ico">⚠️</div><h3>Ошибка</h3><p>${esc(errText(e.message))}</p></div>`;
  });
}
window.addEventListener('hashchange', renderTab);

/* ---------------- вкладка: обзор ---------------- */

function statTile(label, value, delta, points, color) {
  const dir = delta === null || delta === undefined ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·';
  const deltaTxt = delta === null || delta === undefined ? '' : `${arrow} ${Math.abs(Math.round(delta))}%`;
  const id = 'spark-' + Math.random().toString(36).slice(2, 9);
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) drawSparkline(el, points, color);
  });
  return `
    <div class="panel stat-tile">
      <span class="lbl">${esc(label)}</span>
      <div class="val-row">
        <span class="val">${esc(value)}</span>
        ${deltaTxt ? `<span class="delta ${dir}">${esc(deltaTxt)}</span>` : ''}
      </div>
      <div class="spark" id="${id}"></div>
    </div>`;
}

function pctDelta(cur, prev) {
  if (!prev) return cur ? 100 : null;
  return ((cur - prev) / prev) * 100;
}

async function renderOverview(body) {
  const [summary, ts] = await Promise.all([
    api('GET', '/admin/summary'),
    api('GET', '/admin/stats/timeseries?days=' + range),
  ]);

  const users = fillDays(ts.series.users, range, 'c');
  const listings = fillDays(ts.series.listings, range, 'c');
  const payCount = fillDays(ts.series.payments, range, 'c');
  const revenue = fillDays(ts.series.payments, range, 'revenue');

  body.innerHTML = `
    <div class="stat-grid">
      ${statTile('Активных объявлений', summary.listingsActive, null, [], 'var(--brand)')}
      ${statTile('Сейчас в топе', summary.topActive, null, [], 'var(--brand)')}
      ${statTile('Оплат на проверке', summary.pendingPayments, null, [], 'var(--brand)')}
      ${statTile('Новых пользователей', ts.totals.current.users, pctDelta(ts.totals.current.users, ts.totals.previous.users), users, 'var(--brand)')}
      ${statTile('Новых объявлений', ts.totals.current.listings, pctDelta(ts.totals.current.listings, ts.totals.previous.listings), listings, 'var(--brand)')}
      ${statTile('Выручка · ' + range + ' дн.', money(ts.totals.current.revenue, ts.currency), pctDelta(ts.totals.current.revenue, ts.totals.previous.revenue), revenue, 'var(--plus)')}
    </div>

    <div class="range-btns" id="a-range">
      ${[7, 30, 90].map((d) => `<button data-d="${d}" class="${d === range ? 'on' : ''}">${d} дн.</button>`).join('')}
    </div>

    <div class="chart-grid">
      <div class="panel chart-card">
        <div class="chart-head"><b>Регистрации</b><span>всего ${ts.totals.current.users}</span></div>
        <div class="chart-box" id="c-users"></div>
      </div>
      <div class="panel chart-card">
        <div class="chart-head"><b>Новые объявления</b><span>всего ${ts.totals.current.listings}</span></div>
        <div class="chart-box" id="c-listings"></div>
      </div>
      <div class="panel chart-card">
        <div class="chart-head"><b>Выручка (подтверждено)</b><span>${esc(money(ts.totals.current.revenue, ts.currency))}</span></div>
        <div class="chart-box" id="c-revenue"></div>
      </div>
    </div>`;

  drawChart(document.getElementById('c-users'), users, { color: 'var(--brand)' });
  drawChart(document.getElementById('c-listings'), listings, { color: 'var(--brand)' });
  drawChart(document.getElementById('c-revenue'), revenue, { color: 'var(--plus)', valueFmt: (v) => money(v, ts.currency) });

  document.querySelectorAll('#a-range button').forEach((b) => b.addEventListener('click', () => {
    range = Number(b.dataset.d);
    renderTab();
  }));
}

/* ---------------- вкладка: оплаты ---------------- */

const METHOD_LABEL = { idram: 'Idram', telcell: 'Telcell Wallet', card: 'Банковская карта', cash: 'Наличные', other: 'Другое' };

async function renderPayments(body) {
  const { items } = await api('GET', '/admin/payments?status=pending');
  if (!items.length) {
    body.innerHTML = `<div class="empty"><div class="ico">✅</div><h3>Нет заявок на проверке</h3></div>`;
    return;
  }
  body.innerHTML = `<div class="stack">${items.map((p) => `
    <div class="panel">
      <div class="spread">
        <div>
          <b>${esc(p.listing_title)}</b>
          <div class="small muted">${esc(p.user_name)} · ${esc(p.user_email)} · ${esc(dateFmt(p.created_at))}</div>
        </div>
        <span class="chip chip-brand">${esc(money(p.amount, p.currency))} · ${p.days} дн.</span>
      </div>
      <div class="small" style="margin-top:8px">Способ: ${esc(METHOD_LABEL[p.method] || p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}</div>
      <div class="row" style="margin-top:12px">
        <a class="btn btn-sm" href="/#/l/${p.listing_id}" target="_blank">Открыть объявление</a>
        <button class="btn btn-sm btn-primary" data-confirm="${p.id}">✓ Подтвердить</button>
        <button class="btn btn-sm btn-danger" data-reject="${p.id}">✕ Отклонить</button>
      </div>
    </div>`).join('')}</div>`;

  body.querySelectorAll('[data-confirm]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api('POST', `/admin/payments/${b.dataset.confirm}/confirm`); toast('Подтверждено'); renderTab(); }
    catch (e) { toast(errText(e.message), true); b.disabled = false; }
  }));
  body.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Отклонить эту заявку?')) return;
    b.disabled = true;
    try { await api('POST', `/admin/payments/${b.dataset.reject}/reject`); toast('Отклонено'); renderTab(); }
    catch (e) { toast(errText(e.message), true); b.disabled = false; }
  }));
}

/* ---------------- вкладка: объявления ---------------- */

async function renderListings(body) {
  const { items } = await api('GET', '/admin/listings');
  if (!items.length) {
    body.innerHTML = `<div class="empty"><div class="ico">📭</div><h3>Пока нет объявлений</h3></div>`;
    return;
  }
  const statusChip = (s) => {
    const map = { active: ['chip-ok', 'Активно'], hidden: ['chip', 'Скрыто'], done: ['chip-brand', 'Обменяно'] };
    const [cls, label] = map[s] || ['chip', s];
    return `<span class="chip ${cls}">${esc(label)}</span>`;
  };
  body.innerHTML = `<div class="stack">${items.map((l) => `
    <div class="panel">
      <div class="row" style="align-items:flex-start">
        <a href="/#/l/${l.id}" target="_blank" class="mini grow">
          ${l.photos[0] ? `<img src="${esc(l.photos[0])}" alt="">` : `<div class="ph">${l.kind === 'car' ? '🚗' : '🏠'}</div>`}
          <div class="txt">
            <b>${esc(l.title)}</b>
            <span>${esc(l.owner_name)} · ${esc(l.owner_email)}</span>
          </div>
        </a>
        <div class="row" style="gap:6px">
          ${statusChip(l.status)}
          ${l.is_top ? `<span class="chip chip-brand">🚀 ТОП</span>` : ''}
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        ${l.status !== 'active' ? `<button class="btn btn-sm" data-st="active" data-id="${l.id}">Активировать</button>` : ''}
        ${l.status !== 'hidden' ? `<button class="btn btn-sm" data-st="hidden" data-id="${l.id}">Скрыть</button>` : ''}
        ${l.is_top ? `<button class="btn btn-sm" data-untop="${l.id}">Снять из топа</button>` : ''}
        <button class="btn btn-sm btn-danger" data-del="${l.id}">Удалить</button>
      </div>
    </div>`).join('')}</div>`;

  body.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
    await api('POST', `/admin/listings/${b.dataset.id}/status`, { status: b.dataset.st });
    renderTab();
  }));
  body.querySelectorAll('[data-untop]').forEach((b) => b.addEventListener('click', async () => {
    await api('POST', `/admin/listings/${b.dataset.untop}/untop`);
    renderTab();
  }));
  body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Удалить объявление безвозвратно?')) return;
    await api('DELETE', `/admin/listings/${b.dataset.del}`);
    toast('Удалено');
    renderTab();
  }));
}

/* ---------------- вкладка: пользователи ---------------- */

async function renderUsers(body) {
  const { items } = await api('GET', '/admin/users');
  body.innerHTML = `<div class="stack">${items.map((u) => `
    <div class="panel">
      <div class="spread">
        <div>
          <b>${esc(u.name)}</b>
          ${u.is_admin ? `<span class="chip chip-brand">Админ</span>` : ''}
          ${u.banned ? `<span class="chip chip-no">Заблокирован</span>` : ''}
          <div class="small muted">${esc(u.email)} · ${esc(u.phone || '—')} · ${u.listings_count} объявл. · ${esc(dateFmt(u.created_at))}</div>
        </div>
        ${u.id !== me.id ? `<button class="btn btn-sm ${u.banned ? '' : 'btn-danger'}" data-ban="${u.id}" data-v="${u.banned ? 0 : 1}">
          ${u.banned ? 'Разблокировать' : 'Заблокировать'}</button>` : ''}
      </div>
    </div>`).join('')}</div>`;

  body.querySelectorAll('[data-ban]').forEach((b) => b.addEventListener('click', async () => {
    try { await api('POST', `/admin/users/${b.dataset.ban}/ban`, { banned: b.dataset.v === '1' }); renderTab(); }
    catch (e) { toast(errText(e.message), true); }
  }));
}

/* ============================================================
   Графики: без внешних библиотек, только SVG.
   ============================================================ */

function fillDays(series, days, valueKey) {
  const map = new Map(series.map((s) => [s.d, s]));
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    out.push({ date: key, value: row ? Number(row[valueKey]) || 0 : 0 });
  }
  return out;
}

function niceCeil(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const norm = v / base;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * base;
}

function fmtCompact(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

function drawSparkline(el, points, color) {
  if (!points.length) { el.innerHTML = ''; return; }
  const w = 100, h = 28;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * w);
  const y = (v) => h - (v / max) * (h - 4) - 2;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="chart-svg">
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function drawChart(el, points, opts) {
  if (!el) return;
  const w = Math.max(240, el.clientWidth || 320);
  const h = opts.height || 168;
  const padL = 34, padR = 10, padT = 10, padB = 22;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const maxV = niceCeil(Math.max(1, ...points.map((p) => p.value)));
  const color = opts.color || 'var(--brand)';
  const fmt = opts.valueFmt || ((v) => fmtCompact(v));

  const x = (i) => padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / maxV) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const lastIdx = points.length - 1;

  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" class="chart-svg" style="touch-action:none">
      <line x1="${padL}" y1="${y(maxV).toFixed(1)}" x2="${w - padR}" y2="${y(maxV).toFixed(1)}" class="grid-line"/>
      <line x1="${padL}" y1="${y(0).toFixed(1)}" x2="${w - padR}" y2="${y(0).toFixed(1)}" class="grid-line"/>
      <text x="${padL - 6}" y="${(y(maxV) + 3).toFixed(1)}" class="axis-label" text-anchor="end">${esc(fmtCompact(maxV))}</text>
      <text x="${padL - 6}" y="${(y(0)).toFixed(1)}" class="axis-label" text-anchor="end">0</text>
      <path d="${area}" fill="${color}" opacity="0.1" stroke="none"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(lastIdx).toFixed(1)}" cy="${y(points[lastIdx] ? points[lastIdx].value : 0).toFixed(1)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
      <text x="${padL}" y="${h - 4}" class="axis-label">${points[0] ? esc(shortDate(points[0].date)) : ''}</text>
      <text x="${w - padR}" y="${h - 4}" class="axis-label" text-anchor="end">${points[lastIdx] ? esc(shortDate(points[lastIdx].date)) : ''}</text>
      <line class="crosshair" x1="0" y1="${padT}" x2="0" y2="${h - padB}" style="display:none"/>
    </svg>
    <div class="chart-tooltip" style="display:none"></div>`;

  const svg = el.querySelector('svg');
  const crosshair = el.querySelector('.crosshair');
  const tooltip = el.querySelector('.chart-tooltip');

  const onMove = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * w;
    let idx = Math.round(((relX - padL) / innerW) * lastIdx);
    idx = Math.max(0, Math.min(lastIdx, idx));
    const p = points[idx];
    if (!p) return;
    const px = x(idx);
    crosshair.style.display = '';
    crosshair.setAttribute('x1', px);
    crosshair.setAttribute('x2', px);
    tooltip.style.display = '';
    tooltip.style.left = ((px / w) * 100) + '%';
    tooltip.innerHTML = '';
    const val = document.createElement('div'); val.className = 'tt-val'; val.textContent = fmt(p.value);
    const lbl = document.createElement('div'); lbl.className = 'tt-lbl'; lbl.textContent = shortDate(p.date);
    tooltip.append(val, lbl);
  };
  svg.addEventListener('pointermove', (e) => onMove(e.clientX));
  svg.addEventListener('pointerleave', () => { crosshair.style.display = 'none'; tooltip.style.display = 'none'; });
}

/* ---------------- запуск ---------------- */

(async function boot() {
  if (!token) return renderLogin();
  try {
    const r = await api('GET', '/me');
    me = r.user;
    if (!me.is_admin) return renderLogin('У этого аккаунта нет прав администратора.');
    renderShell();
  } catch {
    setToken(null);
    renderLogin();
  }
})();
