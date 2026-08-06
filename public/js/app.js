/* ============================================================
   TooBarter — SPA на ванильном JS: роутер + страницы
   ============================================================ */

const App = {
  user: null,
  summary: { newOffers: 0, pendingOffers: 0, unreadMessages: 0 },
  timers: [],
  gen: 0, // номер текущего рендера: защищает от «догнавших» старых запросов
};

/* Страница проверяет это после каждого await: если пользователь успел
   уйти на другой экран, старый ответ не должен затирать новый. */
const stale = (gen) => App.gen !== gen;

window.App = App;
const view = () => document.getElementById('view');

/* ---------------- маршрутизация ---------------- */

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  return { parts, query: new URLSearchParams(queryPart || '') };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
window.go = go;

function clearTimers() {
  App.timers.forEach(clearInterval);
  App.timers = [];
}

async function render() {
  App.gen++;
  clearTimers();
  closeModal();
  const { parts, query } = parseHash();
  const page = parts[0] || 'feed';
  renderHeader();
  window.scrollTo({ top: 0 });

  const guarded = ['new', 'edit', 'my', 'offers', 'chats', 'fav', 'profile', 'alerts'];
  if (guarded.includes(page) && !App.user) {
    if (API.token) { await loadMe(); }
    if (!App.user) { toast(t('loginRequired'), true); return go('#/login'); }
  }

  try {
    switch (page) {
      case 'feed': return await pageFeed(query);
      case 'l': return await pageListing(parts[1]);
      case 'new': return pageForm(null);
      case 'edit': return await pageForm(parts[1]);
      case 'my': return await pageMy();
      case 'offers': return await pageOffers(query.get('box') || 'in');
      case 'chats': return await pageChats(parts[1]);
      case 'alerts': return await pageAlerts(parts[1]);
      case 'fav': return await pageFav();
      case 'profile': return pageProfile();
      case 'login': return pageAuth('login');
      case 'register': return pageAuth('register');
      default:
        view().innerHTML = `<div class="empty"><div class="ico">🤷</div><h3>${t('notFound')}</h3>
          <a class="btn btn-primary" href="#/">${t('navBrowse')}</a></div>`;
    }
  } catch (e) {
    console.error(e);
    view().innerHTML = `<div class="empty"><div class="ico">⚠️</div><h3>${t('error')}</h3>
      <p>${esc(e.text || e.message)}</p>
      <button class="btn" onclick="render()">${t('tryAgain')}</button></div>`;
  }
}
window.render = render;

/* ---------------- шапка и нижняя навигация ---------------- */

/* Иконки нижней панели: контурные SVG вместо эмодзи —
   выглядят одинаково на всех телефонах и красятся currentColor. */
const TAB_ICONS = {
  feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  offers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13m-3.5-3.5L17 8l-3.5 3.5"/><path d="M20 16H7m3.5-3.5L7 16l3.5 3.5"/></svg>',
  post: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
};

function renderHeader() {
  const { parts } = parseHash();
  const page = parts[0] || 'feed';
  const u = App.user;
  const badge = (n) => (n > 0 ? `<span class="dot">${n > 99 ? '99+' : n}</span>` : '');

  const links = u
    ? [
        ['#/', 'feed', t('navBrowse'), 0],
        ['#/my', 'my', t('navMy'), 0],
        ['#/offers', 'offers', t('navOffers'), App.summary.newOffers],
        ['#/alerts', 'alerts', t('navAlerts'), App.summary.newMatches],
        ['#/chats', 'chats', t('navChats'), App.summary.unreadMessages],
        ['#/fav', 'fav', t('navFav'), 0],
      ]
    : [['#/', 'feed', t('navBrowse'), 0]];

  document.getElementById('top').innerHTML = `
    <div class="top-inner">
      <a class="brand" href="#/">
        <span class="brand-mark">⇄</span>
        <span>
          <span class="brand-name">TooBarter</span>
          <span class="brand-sub">${esc(t('brandTagline'))}</span>
        </span>
      </a>
      <nav class="top-nav">
        ${links.map(([href, key, label, n]) =>
          `<a class="top-link${page === key ? ' on' : ''}" href="${href}">${esc(label)}${badge(n)}</a>`).join('')}
        <div class="langs" role="group">
          ${window.LANGS.map((l) => `<button data-lang="${l.code}" class="${I18N.lang === l.code ? 'on' : ''}">${l.label}</button>`).join('')}
        </div>
        ${u
          ? `<a class="top-link${page === 'profile' ? ' on' : ''}" href="#/profile" title="${esc(u.name)}">👤</a>
             <a class="btn btn-dark btn-sm" href="#/new">+ ${esc(t('navPost'))}</a>`
          : `<a class="btn btn-sm" href="#/login">${esc(t('navLogin'))}</a>
             <a class="btn btn-dark btn-sm" href="#/register">${esc(t('navRegister'))}</a>`}
      </nav>
    </div>`;

  document.querySelectorAll('.langs button').forEach((b) =>
    b.addEventListener('click', () => {
      I18N.set(b.dataset.lang);
      if (App.user) API.patch('/me', { lang: b.dataset.lang }).catch(() => {});
      render();
    }));

  // нижние вкладки для телефона; средняя — акцентная кнопка «Разместить»
  const tabs = u
    ? [
        ['#/', 'feed', 'feed', t('tabFeed'), 0],
        ['#/offers', 'offers', 'offers', t('tabOffers'), App.summary.newOffers],
        ['#/new', 'new', 'post', t('tabPost'), 0],
        ['#/chats', 'chats', 'chats', t('tabChats'), App.summary.unreadMessages],
        ['#/profile', 'profile', 'profile', t('tabProfile'), 0],
      ]
    : [
        ['#/', 'feed', 'feed', t('tabFeed'), 0],
        ['#/new', 'new', 'post', t('tabPost'), 0],
        ['#/login', 'login', 'profile', t('tabLogin'), 0],
      ];
  document.getElementById('tabbar').innerHTML = tabs
    .map(([href, key, ico, label, n]) =>
      `<a href="${href}" class="${page === key ? 'on' : ''}${ico === 'post' ? ' fab' : ''}">
         <span class="ico">${TAB_ICONS[ico]}</span><span class="lbl">${esc(label)}</span>${badge(n)}</a>`)
    .join('');
}

/* ---------------- карточка объявления ---------------- */

function cardHtml(l) {
  const photo = l.photos && l.photos[0];
  return `
  <a class="card" href="#/l/${l.id}">
    <div class="card-photo">
      ${photo ? `<img src="${esc(photo)}" alt="${esc(l.title)}" loading="lazy">` : `<div class="ph">${l.kind === 'car' ? '🚗' : '🏠'}</div>`}
      <span class="card-kind">${esc(kindName(l))}</span>
      ${l._fit ? `<span class="card-fit">✓ ${esc(t('fitsMine'))}</span>` : ''}
      ${l.photos && l.photos.length > 1 ? `<span class="card-count">1/${l.photos.length}</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${esc(l.title)}</div>
      <div class="card-specs">${esc(specLine(l))}</div>
      <div class="row" style="gap:6px">
        <span class="card-price">${esc(money(l.price, l.currency))}</span>
        ${payChip(l.pay_direction, l.pay_amount, l.pay_currency, true)}
      </div>
      <div class="swap">
        <span class="swap-arrow">⇄</span>
        <span class="swap-want">${esc(wishLine(l))}</span>
      </div>
    </div>
  </a>`;
}

function gridHtml(items) {
  return `<div class="grid">${items.map(cardHtml).join('')}</div>`;
}

function emptyHtml(ico, title, hint, btn) {
  return `<div class="empty"><div class="ico">${ico}</div><h3>${esc(title)}</h3>
    <p>${esc(hint || '')}</p>${btn || ''}</div>`;
}

/* ---------------- страница: лента ---------------- */

async function pageFeed(query) {
  const gen = App.gen;
  const q = Object.fromEntries(query.entries());
  const kind = q.kind || '';
  const showHero = !location.hash.includes('?') && !q.q;

  view().innerHTML = `
    ${showHero ? heroHtml() : ''}
    ${App.user && App.summary.newMatches
      ? `<a class="match-strip" href="#/alerts">
           <span class="bell">🔔</span>
           <span class="grow"><b>${esc(t('newForYou'))}</b> · ${App.summary.newMatches}</span>
           <span class="small">${esc(t('openIt'))} →</span>
         </a>`
      : ''}
    <div class="searchbar">
      <input id="q" type="search" placeholder="${esc(t('searchPh'))}" value="${esc(q.q || '')}">
      <button class="btn btn-dark" id="do-search">${esc(t('search'))}</button>
      <button class="btn btn-save-search" id="save-search" title="${esc(t('saveSearch'))}">🔔<span class="lbl">${esc(t('saveSearch'))}</span></button>
    </div>
    <div class="tabs" id="kind-tabs">
      <span class="tab${!kind ? ' on' : ''}" data-kind="">${esc(t('all'))}</span>
      <span class="tab${kind === 'car' ? ' on' : ''}" data-kind="car">🚗 ${esc(t('car'))}</span>
      <span class="tab${kind === 'realty' ? ' on' : ''}" data-kind="realty">🏠 ${esc(t('realty'))}</span>
    </div>
    <div class="panel" style="margin-bottom:16px">
      <div class="filters" id="filters">
        ${kind === 'car' ? `
          <div class="field"><label>${esc(t('make'))}</label>
            <select name="make">${optionsHtml(Object.keys(window.CAR_MAKES), q.make, t('all'))}</select></div>
          <div class="field"><label>${esc(t('year'))} ≥</label>
            <select name="year_min">${optionsHtml(yearsList(), q.year_min, '—')}</select></div>
        ` : ''}
        ${kind === 'realty' ? `
          <div class="field"><label>${esc(t('realtyType'))}</label>
            <select name="realty_type">${optionsHtml(
              ['land', 'house', 'apartment', 'commercial'].map((k) => [k, t(k), t(k), t(k)]), q.realty_type, t('all'))}</select></div>
        ` : ''}
        <div class="field"><label>${esc(t('city'))}</label>
          <select name="city">${optionsHtml(window.CITIES, q.city, t('all'))}</select></div>
        <div class="field"><label>${esc(t('payDirection'))}</label>
          <select name="pay_direction">
            <option value="">${esc(t('all'))}</option>
            <option value="none"${q.pay_direction === 'none' ? ' selected' : ''}>${esc(t('payNone'))}</option>
            <option value="in"${q.pay_direction === 'in' ? ' selected' : ''}>${esc(t('payIn'))}</option>
            <option value="out"${q.pay_direction === 'out' ? ' selected' : ''}>${esc(t('payOut'))}</option>
          </select></div>
        <div class="field"><label>${esc(t('price'))} $</label>
          <div class="row" style="flex-wrap:nowrap">
            <input name="price_min" type="number" min="0" placeholder="0" value="${esc(q.price_min || '')}">
            <input name="price_max" type="number" min="0" placeholder="∞" value="${esc(q.price_max || '')}">
          </div></div>
        ${App.user ? `<div class="field"><label>⇄ ${esc(t('matchesFilter'))}</label>
          <select name="matches" id="matches-sel">
            <option value="">${esc(t('all'))}</option>
            ${q.matches ? `<option value="${esc(q.matches)}" selected>#${esc(q.matches)}</option>` : ''}
          </select></div>` : ''}
        <div class="field"><label>${esc(t('sort'))}</label>
          <select name="sort">
            <option value="new"${q.sort === 'new' ? ' selected' : ''}>${esc(t('sortNew'))}</option>
            <option value="price_asc"${q.sort === 'price_asc' ? ' selected' : ''}>${esc(t('sortPriceAsc'))}</option>
            <option value="price_desc"${q.sort === 'price_desc' ? ' selected' : ''}>${esc(t('sortPriceDesc'))}</option>
            <option value="popular"${q.sort === 'popular' ? ' selected' : ''}>${esc(t('sortPopular'))}</option>
            <option value="old"${q.sort === 'old' ? ' selected' : ''}>${esc(t('sortOld'))}</option>
          </select></div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary btn-sm" id="apply">${esc(t('apply'))}</button>
        <button class="btn btn-ghost btn-sm" id="reset">${esc(t('reset'))}</button>
      </div>
    </div>
    <div id="results"><div class="grid">${'<div class="skeleton"></div>'.repeat(8)}</div></div>`;

  const buildHash = (extra) => {
    const p = new URLSearchParams();
    const src = { ...q, ...extra };
    for (const [k, v] of Object.entries(src)) if (v !== '' && v !== undefined && v !== null) p.set(k, v);
    return '#/?' + p.toString();
  };

  document.getElementById('kind-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-kind]');
    if (!tab) return;
    go(buildHash({ kind: tab.dataset.kind, make: '', realty_type: '', page: '' }));
  });
  const doSearch = () => go(buildHash({ q: document.getElementById('q').value.trim(), page: '' }));
  document.getElementById('do-search').addEventListener('click', doSearch);
  document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  document.getElementById('apply').addEventListener('click', () => {
    const extra = { page: '' };
    document.querySelectorAll('#filters [name]').forEach((el) => (extra[el.name] = el.value));
    go(buildHash(extra));
  });
  document.getElementById('reset').addEventListener('click', () => go('#/'));

  // текущие фильтры превращаются в сохранённый поиск
  document.getElementById('save-search').addEventListener('click', () => {
    const f = {};
    document.querySelectorAll('#filters [name]').forEach((el) => { if (el.value) f[el.name] = el.value; });
    const prefill = {
      kind: q.kind === 'realty' ? (f.realty_type || 'any') : (q.kind || 'any'),
      make: f.make || '',
      city: f.city || '',
      year_min: f.year_min || '',
      price_min: f.price_min || '',
      price_max: f.price_max || '',
    };
    openAlertModal(prefill);
  });

  /* Подставляем в фильтр свои активные объекты */
  if (App.user) {
    API.get('/my/listings').then(({ items }) => {
      if (stale(gen)) return;
      const sel = document.getElementById('matches-sel');
      if (!sel) return;
      const mine = items.filter((i) => i.status === 'active');
      sel.innerHTML = `<option value="">${esc(t('all'))}</option>` +
        mine.map((i) => `<option value="${i.id}"${String(q.matches) === String(i.id) ? ' selected' : ''}>${esc(i.title)}</option>`).join('');
    }).catch(() => {});
  }

  const params = new URLSearchParams(q);
  const data = await API.get('/listings?' + params.toString());
  if (stale(gen)) return;
  const res = document.getElementById('results');
  if (!res) return;

  if (!data.items.length) {
    res.innerHTML = emptyHtml('🔍', t('nothingFound'), t('nothingFoundHint'));
    return;
  }
  const page = Number(q.page || 1);
  if (data.matches) data.items.forEach((i) => (i._fit = true));
  res.innerHTML = `
    <div class="spread" style="margin-bottom:10px">
      <span class="small muted">${esc(t('found'))}: <b class="mono">${data.total}</b></span>
      ${data.matches ? `<span class="chip chip-ok">⇄ ${esc(t('fitsMine'))}</span>` : ''}
    </div>
    ${gridHtml(data.items)}
    ${data.pages > 1 ? `<div class="pager">
      <button class="btn btn-sm" ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">←</button>
      <span class="mono small">${page} / ${data.pages}</span>
      <button class="btn btn-sm" ${page >= data.pages ? 'disabled' : ''} data-p="${page + 1}">→</button>
    </div>` : ''}`;
  res.querySelectorAll('[data-p]').forEach((b) =>
    b.addEventListener('click', () => go(buildHash({ page: b.dataset.p }))));
}

function heroHtml() {
  return `
  <section class="hero">
    <div class="hero-glyph">⇄</div>
    <h1>${esc(t('heroTitle'))}</h1>
    <p>${esc(t('heroLead'))}</p>
    <div class="hero-actions">
      <a class="btn btn-primary btn-lg" href="#/new">${esc(t('heroCta'))}</a>
      <a class="btn btn-lg" href="#/?kind=car" style="background:rgba(255,255,255,.1);color:#fff">${esc(t('heroBrowse'))}</a>
    </div>
    <div class="hero-steps">
      <div class="hero-step"><b>01</b><span>${esc(t('how1'))}</span></div>
      <div class="hero-step"><b>02</b><span>${esc(t('how2'))}</span></div>
      <div class="hero-step"><b>03</b><span>${esc(t('how3'))}</span></div>
    </div>
  </section>`;
}

/* ---------------- страница: объявление ---------------- */

async function pageListing(id) {
  const gen = App.gen;
  view().innerHTML = `<div class="skeleton" style="height:60vh"></div>`;
  const data = await API.get('/listings/' + id);
  if (stale(gen)) return;
  const l = data.listing;
  let photoIdx = 0;

  const specs = [];
  if (l.kind === 'car') {
    specs.push([t('make'), l.make], [t('model'), l.model], [t('year'), l.year],
      [t('mileage'), l.mileage ? numFmt(l.mileage) + ' ' + t('km') : null],
      [t('body'), lookup(OPTIONS.body, l.body)],
      [t('transmission'), lookup(OPTIONS.transmission, l.transmission)],
      [t('fuel'), lookup(OPTIONS.fuel, l.fuel)],
      [t('engine'), l.engine ? l.engine + ' L' : null],
      [t('drive'), lookup(OPTIONS.drive, l.drive)],
      [t('color'), lookup(OPTIONS.color, l.color)],
      [t('steering'), l.steering ? t(l.steering) : null]);
  } else {
    specs.push([t('realtyType'), t(l.realty_type)],
      [t('area'), l.area ? numFmt(l.area) + ' ' + t('sqm') : null],
      [t('landArea'), l.land_area ? numFmt(l.land_area) + ' ' + t('sotka') : null],
      [t('rooms'), l.rooms], [t('floor'), l.floor ? l.floor + (l.floors ? ' / ' + l.floors : '') : null],
      [t('condition'), lookup(OPTIONS.condition, l.condition)],
      [t('address'), l.address]);
  }
  specs.push([t('city'), cityName(l.city)]);

  const actionBox = () => {
    if (data.isOwner) {
      return `<div class="stack">
        <span class="chip chip-brand">${esc(t('yourListing'))}</span>
        <a class="btn btn-block" href="#/edit/${l.id}">${esc(t('edit'))}</a>
        <a class="btn btn-block" href="#/offers">${esc(t('navOffers'))}</a>
      </div>`;
    }
    const o = data.myOffer;
    if (o && o.status === 'pending') return `<div class="stack"><span class="chip chip-wait">⏳ ${esc(t('offerPending'))}</span></div>`;
    if (o && o.status === 'accepted') return `<div class="stack">
      <span class="chip chip-ok">✓ ${esc(t('offerAccepted'))}</span>
      <button class="btn btn-primary btn-block" id="to-chat">${esc(t('openChat'))}</button></div>`;
    if (o && o.status === 'rejected') return `<span class="chip chip-no">${esc(t('offerRejected'))}</span>`;
    return `<button class="btn btn-primary btn-lg btn-block" id="make-offer">⇄ ${esc(t('sendOffer'))}</button>`;
  };

  view().innerHTML = `
    <a class="btn btn-ghost btn-sm" href="javascript:history.back()" style="margin-bottom:12px">← ${esc(t('back'))}</a>
    <div class="listing">
      <div class="stack">
        <div class="gallery" id="gallery"></div>
        <div class="panel">
          <h2 style="margin-bottom:6px">${esc(l.title)}</h2>
          <div class="small muted">${esc(specLine(l))} · ${esc(t('published'))} ${esc(dateFmt(l.created_at))} · ${l.views} ${esc(t('views'))}</div>
          ${l.description ? `<p style="margin:14px 0 0;white-space:pre-wrap">${esc(l.description)}</p>` : ''}
        </div>
        <div class="panel">
          <div class="spread" style="margin-bottom:12px">
            <div class="form-sec-title" style="margin:0">⇄ ${esc(t('wishesTitle'))}</div>
            ${l.wanted_text ? `<span class="small muted">${esc(l.wanted_text)}</span>` : ''}
          </div>
          ${(l.wishes || []).length
            ? `<div class="wish-list">${l.wishes.map((w, i) => wishCardHtml(w, i)).join('')}</div>`
            : `<div class="small muted">${esc(t('noWishes'))}</div>`}
        </div>
        <div class="panel">
          <div class="form-sec-title">${esc(t('specs'))}</div>
          <div class="spec-table">
            ${specs.filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => `<div class="spec-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
          </div>
        </div>
      </div>

      <aside class="stack sticky">
        <div class="panel">
          <div class="price-big">${esc(money(l.price, l.currency))}</div>
          <div style="margin-top:8px">${payChip(l.pay_direction, l.pay_amount, l.pay_currency) || `<span class="chip">${esc(t('payNone'))}</span>`}</div>
          <div class="swap-box" style="margin:14px 0">
            <div class="swap-side">
              <div class="lbl">${esc(t('ownerGives'))}</div>
              <div><b>${esc(kindName(l))}</b> · ${esc(l.title)}</div>
            </div>
            <div class="swap-div"><span class="arrow">⇄</span></div>
            <div class="swap-side">
              <div class="lbl">${esc(t('wishesTitle'))}</div>
              <div>${(l.wishes || []).length
                ? (l.wishes || []).map((w) => esc(wishKindLabel(w))).join(' · ')
                : esc(t('noWishes'))}</div>
            </div>
          </div>
          <div id="fit-box"></div>
          ${actionBox()}
        </div>
        <div class="panel">
          <div class="form-sec-title">${esc(t('owner'))}</div>
          <div class="row">
            <div class="brand-mark" style="background:var(--brand)">${esc((l.owner_name || '?')[0].toUpperCase())}</div>
            <div><b>${esc(l.owner_name)}</b><div class="small muted">${esc(t('memberSince'))} ${esc(dateFmt(l.owner_since))}</div></div>
          </div>
          <div class="small muted" style="margin-top:12px">${esc(t('phoneAfterAccept'))}</div>
          ${App.user && !data.isOwner ? `<button class="btn btn-sm btn-block" id="fav" style="margin-top:10px">
            ${data.isFavorite ? '★ ' + esc(t('inFavorites')) : '☆ ' + esc(t('favorite'))}</button>` : ''}
        </div>
      </aside>
    </div>`;

  // галерея
  const gal = document.getElementById('gallery');
  const drawGallery = () => {
    const ph = l.photos || [];
    gal.innerHTML = `
      <div class="gallery-main">
        ${ph.length ? `<img src="${esc(ph[photoIdx])}" alt="${esc(l.title)}">` : `<div class="ph">${l.kind === 'car' ? '🚗' : '🏠'}</div>`}
        ${ph.length > 1 ? `<button class="gallery-nav prev" data-d="-1" aria-label="prev">←</button>
                           <button class="gallery-nav next" data-d="1" aria-label="next">→</button>` : ''}
      </div>
      ${ph.length > 1 ? `<div class="gallery-strip">${ph.map((p, i) =>
        `<img src="${esc(p)}" data-i="${i}" class="${i === photoIdx ? 'on' : ''}" alt="">`).join('')}</div>` : ''}`;
    gal.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      photoIdx = (photoIdx + Number(b.dataset.d) + ph.length) % ph.length;
      drawGallery();
    }));
    gal.querySelectorAll('[data-i]').forEach((im) => im.addEventListener('click', () => {
      photoIdx = Number(im.dataset.i);
      drawGallery();
    }));
  };
  drawGallery();

  const offerBtn = document.getElementById('make-offer');
  if (offerBtn) offerBtn.addEventListener('click', () => openOfferModal(l));

  /* Подсказка: какие из моих объектов подходят под пожелания владельца */
  if (App.user && !data.isOwner && (l.wishes || []).length) {
    API.get('/my/listings').then(({ items }) => {
      if (stale(gen)) return;
      const box = document.getElementById('fit-box');
      if (!box) return;
      const fits = items.filter((i) => i.status === 'active' && MATCH.matchListing(l.wishes, i, { ignorePay: true }).ok);
      box.innerHTML = fits.length
        ? `<div class="fit-note ok">
             <b>✓ ${esc(t('matchYours'))}</b>
             <div class="wish-crit">${fits.map((f) => `<span>${esc(f.title)}</span>`).join('')}</div>
           </div>`
        : `<div class="fit-note no">${esc(items.length ? t('matchNone') : t('mustOwn'))}</div>`;
    }).catch(() => {});
  }

  const chatBtn = document.getElementById('to-chat');
  if (chatBtn) chatBtn.addEventListener('click', async () => {
    const { items } = await API.get('/conversations');
    const conv = items.find((c) => c.listing_id === l.id);
    go(conv ? '#/chats/' + conv.id : '#/chats');
  });

  const favBtn = document.getElementById('fav');
  if (favBtn) favBtn.addEventListener('click', async () => {
    const r = await API.post(`/listings/${l.id}/favorite`);
    favBtn.textContent = r.isFavorite ? '★ ' + t('inFavorites') : '☆ ' + t('favorite');
  });
}

/* ---------------- модалка: предложить обмен ---------------- */

async function openOfferModal(target) {
  if (!App.user) { toast(t('loginRequired'), true); return go('#/login'); }

  const { items } = await API.get('/my/listings');
  const active = items.filter((i) => i.status === 'active' && i.id !== target.id);
  const wishes = target.wishes || [];

  /* Обменять можно только на то, что уже выложено в профиле */
  if (!active.length) {
    openModal(t('offerTitle'), `<div class="fit-note no">${esc(t('mustOwn'))}</div>`,
      `<button class="btn" data-close="1">${esc(t('cancel'))}</button>
       <a class="btn btn-primary" href="#/new" id="go-new">${esc(t('postFirst'))}</a>`);
    document.getElementById('go-new').addEventListener('click', closeModal);
    return;
  }

  const fitOf = (item, deal) => MATCH.matchListing(wishes, item, deal || { ignorePay: true });
  const preferred = active.find((i) => fitOf(i).ok) || active[0];
  const state = { id: preferred.id, dir: 'none', amount: 0, cur: 'USD' };

  /* Если владелец назвал условие по доплате — подставляем его сразу */
  const pre = fitOf(preferred);
  const sug = !pre.free && pre.index >= 0 ? MATCH.suggestedPay(wishes[pre.index]) : null;
  if (sug) { state.dir = sug.direction; state.amount = sug.amount; state.cur = sug.currency; }

  const optionLabel = (i) => `${fitOf(i).ok ? '✓ ' : ''}${i.title} — ${money(i.price, i.currency)}`;

  const body = `
    <div class="field">
      <label>${esc(t('whatIOffer'))} *</label>
      <select id="offered">
        ${active.map((i) => `<option value="${i.id}"${i.id === state.id ? ' selected' : ''}>${esc(optionLabel(i))}</option>`).join('')}
      </select>
      <span class="hint">${esc(t('chooseMine'))}</span>
    </div>

    <div id="match-box"></div>

    <div class="field">
      <label>${esc(t('payDirection'))}</label>
      <div class="choice tint" id="pd-row">
        <input type="radio" name="pd" id="pd-none" value="none"><label for="pd-none">${esc(t('payNone'))}</label>
        <input type="radio" name="pd" id="pd-in" value="in"><label for="pd-in">+ ${esc(t('payIn'))}</label>
        <input type="radio" name="pd" id="pd-out" value="out"><label for="pd-out">− ${esc(t('payOut'))}</label>
      </div>
    </div>
    <div class="form-grid" id="pay-row">
      <div class="field"><label>${esc(t('payAmount'))}</label><input id="pay-amount" type="number" min="0" value="0"></div>
      <div class="field"><label>—</label><select id="pay-currency">${optionsHtml(['USD', 'AMD', 'EUR', 'RUB'], 'USD')}</select></div>
    </div>

    <div class="field">
      <label>${esc(t('offerMessage'))}</label>
      <textarea id="offer-msg" placeholder="${esc(t('offerMessagePh'))}" style="min-height:80px"></textarea>
    </div>
    <div class="small muted">${esc(t('acceptHint'))}</div>`;

  const foot = `<button class="btn" data-close="1">${esc(t('cancel'))}</button>
                <button class="btn btn-primary" id="send-offer">${esc(t('offerSend'))}</button>`;

  const modal = openModal(t('offerTitle') + ' · ' + target.title, body, foot);
  const matchBox = modal.querySelector('#match-box');
  const payRow = modal.querySelector('#pay-row');
  const sendBtn = modal.querySelector('#send-offer');
  const amountInput = modal.querySelector('#pay-amount');
  const currencySel = modal.querySelector('#pay-currency');

  const currentItem = () => active.find((i) => String(i.id) === String(state.id));
  const deal = () => ({ pay_direction: state.dir, pay_amount: Number(state.amount) || 0, pay_currency: state.cur });

  function syncPayInputs() {
    modal.querySelector('#pd-' + state.dir).checked = true;
    amountInput.value = state.amount;
    currencySel.value = state.cur;
    payRow.style.display = state.dir === 'none' ? 'none' : '';
  }

  /* Живая проверка: пересчитывается на каждое изменение */
  function drawMatch() {
    const m = MATCH.matchListing(wishes, currentItem(), deal());
    if (m.free) {
      matchBox.innerHTML = `<div class="match free">${esc(t('matchFree'))}</div>`;
      sendBtn.textContent = t('offerSend');
      return;
    }
    const w = wishes[m.index];
    const payCheck = m.result.checks.find((c) => c.field === 'pay');
    const canFix = payCheck && !payCheck.ok && MATCH.suggestedPay(w);
    matchBox.innerHTML = `
      <div class="match ${m.ok ? 'ok' : 'no'}">
        <div class="match-head">
          <b>${m.ok ? '✓ ' + esc(t('matchOk')) : '✕ ' + esc(t('matchNo'))}</b>
          <span class="small muted">${esc(t('wishN'))} ${String(m.index + 1).padStart(2, '0')} · ${esc(wishKindLabel(w))}</span>
        </div>
        <div class="checks">${m.result.checks.map(checkRow).join('')}</div>
        ${canFix ? `<button type="button" class="btn btn-sm" id="fix-pay">${esc(t('fillMinPay'))}</button>` : ''}
        ${w.note ? `<div class="wish-note">${esc(w.note)}</div>` : ''}
      </div>`;
    const fix = matchBox.querySelector('#fix-pay');
    if (fix) fix.addEventListener('click', () => {
      const p = MATCH.suggestedPay(w);
      state.dir = p.direction; state.amount = p.amount; state.cur = p.currency;
      syncPayInputs(); drawMatch();
    });
    sendBtn.textContent = m.ok ? t('offerSend') : t('sendAnyway');
  }

  modal.querySelector('#offered').addEventListener('change', (e) => { state.id = e.target.value; drawMatch(); });
  modal.querySelectorAll('[name=pd]').forEach((r) => r.addEventListener('change', () => {
    state.dir = r.value;
    if (state.dir === 'none') state.amount = 0;
    syncPayInputs(); drawMatch();
  }));
  amountInput.addEventListener('input', () => { state.amount = amountInput.value; drawMatch(); });
  currencySel.addEventListener('change', () => { state.cur = currencySel.value; drawMatch(); });

  syncPayInputs();
  drawMatch();

  sendBtn.addEventListener('click', async () => {
    sendBtn.disabled = true;
    try {
      await API.post('/offers', {
        listing_id: target.id,
        offered_listing_id: state.id,
        message: modal.querySelector('#offer-msg').value,
        ...deal(),
      });
      closeModal();
      toast(t('offerSent'));
      render();
    } catch (err) {
      sendBtn.disabled = false;
      toast(err.text, true);
    }
  });
}

/* ---------------- страница: форма объявления ---------------- */

async function pageForm(editId) {
  const gen = App.gen;
  let l = {
    kind: 'car', currency: 'USD', pay_direction: 'none', pay_currency: 'USD',
    wanted_kinds: [], steering: 'left', city: App.user && App.user.city ? App.user.city : '', photos: [],
  };
  if (editId) {
    const d = await API.get('/listings/' + editId);
    if (stale(gen)) return;
    l = d.listing;
    if (!d.isOwner) { toast(t('err_auth_required'), true); return go('#/my'); }
  }

  const newFiles = [];
  let keptPhotos = [...(l.photos || [])];

  view().innerHTML = `
    <div style="max-width:820px;margin:0 auto">
      <h1 style="margin-bottom:16px">${esc(editId ? t('edit') : t('heroCta'))}</h1>
      <form id="lform" class="stack">
        <div class="panel">
          <div class="form-sec-title">${esc(t('kind'))}</div>
          <div class="kind-pick">
            <input type="radio" name="kind" id="k-car" value="car" ${l.kind === 'car' ? 'checked' : ''} ${editId ? 'disabled' : ''}>
            <label for="k-car"><span class="ico">🚗</span><b>${esc(t('car'))}</b></label>
            <input type="radio" name="kind" id="k-realty" value="realty" ${l.kind === 'realty' ? 'checked' : ''} ${editId ? 'disabled' : ''}>
            <label for="k-realty"><span class="ico">🏠</span><b>${esc(t('realty'))}</b></label>
          </div>
        </div>

        <div class="panel" id="kind-fields"></div>

        <div class="panel">
          <div class="form-sec-title">${esc(t('description'))}</div>
          <div class="stack">
            <div class="field">
              <label>${esc(t('title'))} <span class="muted">(${esc(t('optional'))})</span></label>
              <input name="title" value="${esc(l.title || '')}" maxlength="120">
              <span class="hint">${esc(t('titleAuto'))}</span>
            </div>
            <div class="field">
              <label>${esc(t('description'))}</label>
              <textarea name="description" placeholder="${esc(t('descriptionPh'))}">${esc(l.description || '')}</textarea>
            </div>
            <div class="form-grid">
              <div class="field"><label>${esc(t('city'))}</label>
                <select name="city">${optionsHtml(window.CITIES, l.city, '—')}</select></div>
              <div class="field"><label>${esc(t('price'))}</label>
                <input name="price" type="number" min="0" value="${esc(l.price || '')}">
                <span class="hint">${esc(t('priceHint'))}</span></div>
              <div class="field"><label>—</label>
                <select name="currency">${optionsHtml(['USD', 'AMD', 'EUR', 'RUB'], l.currency || 'USD')}</select></div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="form-sec-title">${esc(t('photos'))}</div>
          <div class="dropzone" id="dz">📷 ${esc(t('addPhotos'))}<div class="small muted">${esc(t('photosHint'))}</div></div>
          <input type="file" id="files" accept="image/*" multiple hidden>
          <div class="thumbs" id="thumbs"></div>
        </div>

        <div class="panel">
          <div class="form-sec-title">⇄ ${esc(t('wishesTitle'))}</div>
          <div class="small muted" style="margin:-4px 0 14px">${esc(t('wishesHint'))}</div>
          <div id="wishes"></div>
          <div class="field" style="margin-top:14px">
            <label>${esc(t('wantedText'))}</label>
            <input name="wanted_text" placeholder="${esc(t('wantedTextPh'))}" value="${esc(l.wanted_text || '')}" maxlength="500">
          </div>
        </div>

        <div class="panel">
          <div class="form-sec-title">${esc(t('payDirection'))}</div>
          <div class="choice tint">
            <input type="radio" name="pay_direction" id="p-none" value="none" ${l.pay_direction === 'none' ? 'checked' : ''}><label for="p-none">${esc(t('payNone'))}</label>
            <input type="radio" name="pay_direction" id="p-in" value="in" ${l.pay_direction === 'in' ? 'checked' : ''}><label for="p-in">+ ${esc(t('payIn'))}</label>
            <input type="radio" name="pay_direction" id="p-out" value="out" ${l.pay_direction === 'out' ? 'checked' : ''}><label for="p-out">− ${esc(t('payOut'))}</label>
          </div>
          <div class="form-grid" id="pay-fields" style="margin-top:12px">
            <div class="field"><label>${esc(t('payAmount'))}</label>
              <input name="pay_amount" type="number" min="0" value="${esc(l.pay_amount || 0)}"></div>
            <div class="field"><label>—</label>
              <select name="pay_currency">${optionsHtml(['USD', 'AMD', 'EUR', 'RUB'], l.pay_currency || 'USD')}</select></div>
          </div>
        </div>

        <div id="form-err"></div>
        <div class="row">
          <button class="btn btn-primary btn-lg" type="submit">${esc(editId ? t('saveChanges') : t('publish'))}</button>
          <a class="btn btn-lg" href="${editId ? '#/my' : '#/'}">${esc(t('cancel'))}</a>
        </div>
      </form>
    </div>`;

  const form = document.getElementById('lform');

  /* поля, зависящие от категории */
  function drawKindFields() {
    const kind = form.querySelector('[name=kind]:checked').value;
    const box = document.getElementById('kind-fields');
    if (kind === 'car') {
      box.innerHTML = `
        <div class="form-sec-title">${esc(t('car'))}</div>
        <div class="form-grid">
          <div class="field"><label>${esc(t('make'))} *</label>
            <select name="make" required>${optionsHtml(Object.keys(window.CAR_MAKES), l.make, '—')}</select></div>
          <div class="field"><label>${esc(t('model'))} *</label>
            <input name="model" list="models" value="${esc(l.model || '')}" required>
            <datalist id="models"></datalist></div>
          <div class="field"><label>${esc(t('year'))} *</label>
            <select name="year" required>${optionsHtml(yearsList(), l.year, '—')}</select></div>
          <div class="field"><label>${esc(t('mileage'))}, ${esc(t('km'))}</label>
            <input name="mileage" type="number" min="0" value="${esc(l.mileage || '')}"></div>
          <div class="field"><label>${esc(t('body'))}</label>
            <select name="body">${optionsHtml(OPTIONS.body, l.body, '—')}</select></div>
          <div class="field"><label>${esc(t('transmission'))}</label>
            <select name="transmission">${optionsHtml(OPTIONS.transmission, l.transmission, '—')}</select></div>
          <div class="field"><label>${esc(t('fuel'))}</label>
            <select name="fuel">${optionsHtml(OPTIONS.fuel, l.fuel, '—')}</select></div>
          <div class="field"><label>${esc(t('engine'))}, L</label>
            <input name="engine" type="number" step="0.1" min="0" value="${esc(l.engine || '')}"></div>
          <div class="field"><label>${esc(t('drive'))}</label>
            <select name="drive">${optionsHtml(OPTIONS.drive, l.drive, '—')}</select></div>
          <div class="field"><label>${esc(t('color'))}</label>
            <select name="color">${optionsHtml(OPTIONS.color, l.color, '—')}</select></div>
          <div class="field"><label>${esc(t('steering'))}</label>
            <select name="steering">
              <option value="left"${l.steering !== 'right' ? ' selected' : ''}>${esc(t('left'))}</option>
              <option value="right"${l.steering === 'right' ? ' selected' : ''}>${esc(t('right'))}</option>
            </select></div>
        </div>`;
      const makeSel = box.querySelector('[name=make]');
      const dl = box.querySelector('#models');
      const fillModels = () => {
        const models = window.CAR_MAKES[makeSel.value] || [];
        dl.innerHTML = models.map((m) => `<option value="${esc(m)}">`).join('');
      };
      makeSel.addEventListener('change', fillModels);
      fillModels();
    } else {
      box.innerHTML = `
        <div class="form-sec-title">${esc(t('realty'))}</div>
        <div class="field" style="margin-bottom:12px">
          <label>${esc(t('realtyType'))} *</label>
          <div class="choice tint">
            ${['land', 'house', 'apartment', 'commercial'].map((k) => `
              <input type="radio" name="realty_type" id="rt-${k}" value="${k}" ${l.realty_type === k ? 'checked' : ''}>
              <label for="rt-${k}">${esc(t(k))}</label>`).join('')}
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>${esc(t('area'))}, ${esc(t('sqm'))}</label>
            <input name="area" type="number" step="0.1" min="0" value="${esc(l.area || '')}"></div>
          <div class="field"><label>${esc(t('landArea'))}, ${esc(t('sotka'))}</label>
            <input name="land_area" type="number" step="0.1" min="0" value="${esc(l.land_area || '')}"></div>
          <div class="field"><label>${esc(t('rooms'))}</label>
            <input name="rooms" type="number" min="0" max="50" value="${esc(l.rooms || '')}"></div>
          <div class="field"><label>${esc(t('floor'))}</label>
            <input name="floor" type="number" min="0" max="200" value="${esc(l.floor || '')}"></div>
          <div class="field"><label>${esc(t('floors'))}</label>
            <input name="floors" type="number" min="0" max="200" value="${esc(l.floors || '')}"></div>
          <div class="field"><label>${esc(t('condition'))}</label>
            <select name="condition">${optionsHtml(OPTIONS.condition, l.condition, '—')}</select></div>
          <div class="field" style="grid-column:1/-1"><label>${esc(t('address'))}</label>
            <input name="address" value="${esc(l.address || '')}" maxlength="200"></div>
        </div>`;
    }
  }
  form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', drawKindFields));
  drawKindFields();

  /* ---- динамический конструктор пожеланий ---- */
  let wishes = (l.wishes || []).map((w) => ({ ...w }));
  const wishBox = document.getElementById('wishes');
  const YEARS = yearsList();
  const CURS = ['USD', 'AMD', 'EUR', 'RUB'];
  const fld = (label, inner, wide) =>
    `<div class="field"${wide ? ' style="grid-column:1/-1"' : ''}><label>${esc(label)}</label>${inner}</div>`;

  function wishFormHtml(w, i) {
    const k = w.kind || 'any';
    const rows = [];
    if (k === 'car') {
      const models = window.CAR_MAKES[w.make] || [];
      rows.push(fld(t('make'), `<select data-f="make" data-reload="1">${optionsHtml(Object.keys(window.CAR_MAKES), w.make, t('all'))}</select>`));
      rows.push(fld(t('model'), `<input data-f="model" list="dl-${i}" value="${esc(w.model || '')}" placeholder="${esc(t('all'))}">
        <datalist id="dl-${i}">${models.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>`));
      rows.push(fld(t('yearFrom'), `<select data-f="year_min">${optionsHtml(YEARS, w.year_min, '—')}</select>`));
      rows.push(fld(t('yearTo'), `<select data-f="year_max">${optionsHtml(YEARS, w.year_max, '—')}</select>`));
      rows.push(fld(t('mileageMax') + ', ' + t('km'), `<input data-f="mileage_max" type="number" min="0" value="${esc(w.mileage_max || '')}">`));
      rows.push(fld(t('transmission'), `<select data-f="transmission">${optionsHtml(OPTIONS.transmission, w.transmission, t('all'))}</select>`));
      rows.push(fld(t('fuel'), `<select data-f="fuel">${optionsHtml(OPTIONS.fuel, w.fuel, t('all'))}</select>`));
      rows.push(fld(t('body'), `<select data-f="body">${optionsHtml(OPTIONS.body, w.body, t('all'))}</select>`));
    }
    if (k === 'house' || k === 'apartment' || k === 'commercial')
      rows.push(fld(t('areaFrom') + ', ' + t('sqm'), `<input data-f="area_min" type="number" min="0" step="0.1" value="${esc(w.area_min || '')}">`));
    if (k === 'land' || k === 'house')
      rows.push(fld(t('landFrom') + ', ' + t('sotka'), `<input data-f="land_min" type="number" min="0" step="0.1" value="${esc(w.land_min || '')}">`));
    if (k === 'house' || k === 'apartment')
      rows.push(fld(t('roomsFrom'), `<input data-f="rooms_min" type="number" min="0" max="50" value="${esc(w.rooms_min || '')}">`));
    rows.push(fld(t('city'), `<select data-f="city">${optionsHtml(window.CITIES, w.city, t('all'))}</select>`));
    rows.push(fld(t('priceFrom'), `<input data-f="price_min" type="number" min="0" value="${esc(w.price_min || '')}">`));
    rows.push(fld(t('priceTo'), `<input data-f="price_max" type="number" min="0" value="${esc(w.price_max || '')}">`));
    rows.push(fld('—', `<select data-f="price_currency">${optionsHtml(CURS, w.price_currency || 'USD')}</select>`));

    const dir = w.pay_direction || 'none';
    return `
    <div class="wish-form" data-i="${i}">
      <div class="wish-form-head">
        <span class="wish-num mono">${String(i + 1).padStart(2, '0')}</span>
        <select data-f="kind" data-reload="1" class="wish-kind">
          <option value="any"${k === 'any' ? ' selected' : ''}>${esc(t('anyKind'))}</option>
          ${['car', 'land', 'house', 'apartment', 'commercial']
            .map((x) => `<option value="${x}"${k === x ? ' selected' : ''}>${esc(t(x))}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-ghost btn-sm" data-rm="${i}" title="${esc(t('removeWish'))}">✕</button>
      </div>
      <div class="form-grid">${rows.join('')}</div>
      <div class="wish-pay">
        <div class="form-grid">
          ${fld(t('payWish'), `<select data-f="pay_direction" data-reload="1">
            <option value="none"${dir === 'none' ? ' selected' : ''}>${esc(t('payWishNone'))}</option>
            <option value="in"${dir === 'in' ? ' selected' : ''}>+ ${esc(t('payWishIn'))}</option>
            <option value="out"${dir === 'out' ? ' selected' : ''}>− ${esc(t('payWishOut'))}</option>
          </select>`)}
          ${dir === 'none' ? '' : fld(t('payAmount'), `<input data-f="pay_min" type="number" min="0" value="${esc(w.pay_min || 0)}">`)}
          ${dir === 'none' ? '' : fld('—', `<select data-f="pay_currency">${optionsHtml(CURS, w.pay_currency || 'USD')}</select>`)}
        </div>
      </div>
      ${fld(t('wishNote'), `<input data-f="note" maxlength="300" value="${esc(w.note || '')}" placeholder="${esc(t('wishNotePh'))}">`, true)}
    </div>`;
  }

  function readWishes() {
    wishes = [...wishBox.querySelectorAll('.wish-form')].map((card) => {
      const o = {};
      card.querySelectorAll('[data-f]').forEach((el) => { if (el.value !== '') o[el.dataset.f] = el.value; });
      return o;
    });
    return wishes;
  }

  function drawWishes() {
    wishBox.innerHTML = `
      ${wishes.length ? wishes.map(wishFormHtml).join('') : `<div class="wish-empty">${esc(t('noWishes'))}</div>`}
      <button type="button" class="btn btn-sm" id="add-wish" ${wishes.length >= 8 ? 'disabled' : ''}>+ ${esc(t('addWish'))}</button>`;
    wishBox.querySelector('#add-wish').addEventListener('click', () => {
      readWishes(); wishes.push({ kind: 'any', pay_direction: 'none' }); drawWishes();
    });
    wishBox.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      readWishes(); wishes.splice(Number(b.dataset.rm), 1); drawWishes();
    }));
    wishBox.querySelectorAll('[data-reload]').forEach((el) => el.addEventListener('change', () => {
      readWishes(); drawWishes();
    }));
  }
  drawWishes();

  /* фотографии */
  const dz = document.getElementById('dz');
  const filesInput = document.getElementById('files');
  const thumbs = document.getElementById('thumbs');

  function drawThumbs() {
    const all = [
      ...keptPhotos.map((src, i) => ({ src, kind: 'old', i })),
      ...newFiles.map((f, i) => ({ src: URL.createObjectURL(f), kind: 'new', i })),
    ];
    thumbs.innerHTML = all.map((p, idx) => `
      <div class="thumb">
        <img src="${esc(p.src)}" alt="">
        <button type="button" data-kind="${p.kind}" data-i="${p.i}" aria-label="remove">✕</button>
        ${idx === 0 ? `<span class="main-badge">1</span>` : ''}
      </div>`).join('');
    thumbs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.kind === 'old') keptPhotos.splice(Number(b.dataset.i), 1);
      else newFiles.splice(Number(b.dataset.i), 1);
      drawThumbs();
    }));
  }
  dz.addEventListener('click', () => filesInput.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--brand)'; });
  dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.style.borderColor = '';
    addFiles(e.dataTransfer.files);
  });
  filesInput.addEventListener('change', () => addFiles(filesInput.files));
  function addFiles(list) {
    for (const f of list) {
      if (!f.type.startsWith('image/')) continue;
      if (keptPhotos.length + newFiles.length >= 12) break;
      newFiles.push(f);
    }
    filesInput.value = '';
    drawThumbs();
  }
  drawThumbs();

  /* отправка */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('form-err');
    errBox.innerHTML = '';
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = t('creating');

    const fd = new FormData();
    const kind = form.querySelector('[name=kind]:checked').value;
    fd.set('kind', kind);
    form.querySelectorAll('#kind-fields [name]').forEach((el) => {
      if (el.type === 'radio' && !el.checked) return;
      fd.set(el.name, el.value);
    });
    ['title', 'description', 'city', 'price', 'currency', 'wanted_text', 'pay_amount', 'pay_currency']
      .forEach((n) => {
        const el = form.querySelector(`[name=${n}]`);
        if (el) fd.set(n, el.value);
      });
    fd.set('pay_direction', form.querySelector('[name=pay_direction]:checked').value);
    fd.set('wishes', JSON.stringify(readWishes()));
    newFiles.forEach((f) => fd.append('photos', f));

    try {
      if (editId) {
        fd.set('keep_photos', JSON.stringify(keptPhotos));
        await API.form('PATCH', '/listings/' + editId, fd);
        toast(t('saved'));
        go('#/l/' + editId);
      } else {
        const r = await API.form('POST', '/listings', fd);
        toast(t('saved'));
        go('#/l/' + r.id);
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = editId ? t('saveChanges') : t('publish');
      errBox.innerHTML = `<div class="form-error">${esc(err.text)}</div>`;
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  });
}

/* ---------------- страница: мои объявления ---------------- */

async function pageMy() {
  const gen = App.gen;
  const { items } = await API.get('/my/listings');
  if (stale(gen)) return;
  if (!items.length) {
    view().innerHTML = emptyHtml('📭', t('myEmpty'), t('myEmptyHint'),
      `<a class="btn btn-primary" href="#/new">${esc(t('heroCta'))}</a>`);
    return;
  }
  const statusChip = (s) => {
    const map = { active: 'chip-ok', hidden: 'chip', done: 'chip-brand' };
    const label = { active: t('statusActive'), hidden: t('statusHidden'), done: t('statusDone') }[s];
    return `<span class="chip ${map[s]}">${esc(label)}</span>`;
  };

  view().innerHTML = `
    <div class="spread" style="margin-bottom:16px">
      <h1>${esc(t('navMy'))}</h1>
      <a class="btn btn-dark" href="#/new">+ ${esc(t('navPost'))}</a>
    </div>
    <div class="stack">
      ${items.map((l) => `
        <div class="panel">
          <div class="row" style="align-items:flex-start">
            <a href="#/l/${l.id}" class="mini grow">
              ${l.photos[0] ? `<img src="${esc(l.photos[0])}" alt="">` : `<div class="ph">${l.kind === 'car' ? '🚗' : '🏠'}</div>`}
              <div class="txt">
                <b>${esc(l.title)}</b>
                <span>${esc(specLine(l))} · ${esc(money(l.price, l.currency))}</span>
              </div>
            </a>
            <div class="row" style="gap:6px">
              ${statusChip(l.status)}
              ${l.pending_offers ? `<a href="#/offers" class="chip chip-brand">⇄ ${l.pending_offers} ${esc(t('newOffers'))}</a>` : ''}
            </div>
          </div>
          <div class="row" style="margin-top:12px">
            <a class="btn btn-sm" href="#/edit/${l.id}">${esc(t('edit'))}</a>
            ${l.status === 'active'
              ? `<button class="btn btn-sm" data-act="hidden" data-id="${l.id}">${esc(t('hide'))}</button>
                 <button class="btn btn-sm" data-act="done" data-id="${l.id}">${esc(t('markDone'))}</button>`
              : `<button class="btn btn-sm" data-act="active" data-id="${l.id}">${esc(t('activate'))}</button>`}
            <button class="btn btn-sm btn-danger" data-del="${l.id}">${esc(t('delete'))}</button>
          </div>
        </div>`).join('')}
    </div>`;

  view().querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    await API.post(`/listings/${b.dataset.id}/status`, { status: b.dataset.act });
    render();
  }));
  view().querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('deleteConfirm'))) return;
    await API.del('/listings/' + b.dataset.del);
    toast(t('saved'));
    render();
  }));
}

/* ---------------- страница: избранное ---------------- */

async function pageFav() {
  const gen = App.gen;
  const { items } = await API.get('/my/favorites');
  if (stale(gen)) return;
  view().innerHTML = `<h1 style="margin-bottom:16px">${esc(t('navFav'))}</h1>` +
    (items.length ? gridHtml(items) : emptyHtml('☆', t('favEmpty'), ''));
}

/* ---------------- страница: предложения ---------------- */

async function pageOffers(box) {
  const gen = App.gen;
  const { items } = await API.get('/offers?box=' + box);
  await refreshSummary();
  if (stale(gen)) return;

  const statusChip = (s) => {
    const map = { pending: ['chip-wait', t('statusPending')], accepted: ['chip-ok', t('statusAccepted')],
      rejected: ['chip-no', t('statusRejected')], cancelled: ['chip', t('statusCancelled')] };
    const [cls, label] = map[s] || ['chip', s];
    return `<span class="chip ${cls}">${esc(label)}</span>`;
  };

  const miniHtml = (title, photo, price, currency, fallbackText) => title
    ? `<div class="mini">
        ${photo ? `<img src="${esc(photo)}" alt="">` : `<div class="ph">📦</div>`}
        <div class="txt"><b>${esc(title)}</b><span>${esc(money(price, currency))}</span></div>
       </div>`
    : `<div class="mini"><div class="ph">💵</div><div class="txt"><b>${esc(fallbackText)}</b></div></div>`;

  view().innerHTML = `
    <h1 style="margin-bottom:14px">${esc(t('navOffers'))}</h1>
    <div class="tabs">
      <a class="tab${box === 'in' ? ' on' : ''}" href="#/offers?box=in">${esc(t('offersIn'))}${App.summary.pendingOffers ? ' · ' + App.summary.pendingOffers : ''}</a>
      <a class="tab${box === 'out' ? ' on' : ''}" href="#/offers?box=out">${esc(t('offersOut'))}</a>
    </div>
    <div class="stack" id="offer-list">
      ${items.length ? items.map((o) => `
        <div class="offer">
          <div class="spread">
            <div class="row" style="gap:8px">
              ${statusChip(o.status)}
              <span class="chip ${o.matched ? 'chip-ok' : 'chip-no'}" title="${esc(t('matchTitle'))}">
                ${o.matched ? '✓ ' + esc(t('matchOk')) : '✕ ' + esc(t('matchNo'))}</span>
              <span class="small muted">${esc(box === 'in' ? o.from_name : o.to_name)} · ${esc(dateFmt(o.created_at))}</span>
            </div>
            ${payChip(o.pay_direction, o.pay_amount, o.pay_currency)}
          </div>
          <div class="offer-pair">
            <div>
              <div class="lbl-mini">${esc(box === 'in' ? t('theyOffer') : t('youOffer'))}</div>
              ${miniHtml(o.offered_title, o.offered_photo, o.offered_price, o.offered_currency, t('moneyOnly'))}
            </div>
            <div class="offer-arrow">⇄</div>
            <div>
              <div class="lbl-mini">${esc(box === 'in' ? t('forYour') : t('navBrowse'))}</div>
              ${miniHtml(o.target_title, o.target_photo, o.target_price, o.target_currency, '')}
            </div>
          </div>
          ${o.message ? `<div class="offer-msg">${esc(o.message)}</div>` : ''}
          <div class="row">
            <a class="btn btn-sm" href="#/l/${o.listing_id}">${esc(t('openListing'))}</a>
            ${o.status === 'pending' && box === 'in' ? `
              <button class="btn btn-sm btn-primary" data-offer="${o.id}" data-do="accept">✓ ${esc(t('accept'))}</button>
              <button class="btn btn-sm btn-danger" data-offer="${o.id}" data-do="reject">✕ ${esc(t('reject'))}</button>` : ''}
            ${o.status === 'pending' && box === 'out' ? `
              <button class="btn btn-sm btn-danger" data-offer="${o.id}" data-do="cancel">${esc(t('cancelOffer'))}</button>` : ''}
            ${o.status === 'accepted' && o.conversation_id ? `
              <a class="btn btn-sm btn-primary" href="#/chats/${o.conversation_id}">💬 ${esc(t('openChat'))}</a>` : ''}
          </div>
          ${o.status === 'pending' && box === 'in' ? `<div class="small muted">${esc(t('acceptHint'))}</div>` : ''}
        </div>`).join('')
        : emptyHtml('⇄', box === 'in' ? t('offersEmptyIn') : t('offersEmptyOut'), t('acceptHint'))}
    </div>`;

  view().querySelectorAll('[data-offer]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const r = await API.post(`/offers/${b.dataset.offer}/${b.dataset.do}`);
      await refreshSummary();
      if (r.conversation_id) go('#/chats/' + r.conversation_id);
      else render();
    } catch (err) {
      b.disabled = false;
      toast(err.text, true);
    }
  }));
}

/* ---------------- страница: чаты ---------------- */

async function pageChats(convId) {
  const gen = App.gen;
  const { items } = await API.get('/conversations');
  if (stale(gen)) return;
  if (!items.length) {
    view().innerHTML = `<h1 style="margin-bottom:16px">${esc(t('chats'))}</h1>` +
      emptyHtml('💬', t('chatsEmpty'), t('chatsEmptyHint'));
    return;
  }
  const active = convId ? items.find((c) => String(c.id) === String(convId)) : items[0];
  if (!active) return go('#/chats');

  view().innerHTML = `
    <h1 style="margin-bottom:14px">${esc(t('chats'))}</h1>
    <div class="chat-wrap">
      <div class="conv-list">
        ${items.map((c) => `
          <a class="conv${c.id === active.id ? ' on' : ''}" href="#/chats/${c.id}">
            ${c.listing_photo ? `<img src="${esc(c.listing_photo)}" alt="">` : `<div class="ph">📦</div>`}
            <div class="txt">
              <b>${esc(c.peer_name)}</b>
              <span>${esc(c.last_body || c.listing_title)}</span>
            </div>
            ${c.unread ? `<span class="chip chip-brand mono">${c.unread}</span>` : ''}
          </a>`).join('')}
      </div>

      <div class="chat">
        <div class="chat-head">
          <div class="brand-mark" style="background:var(--brand)">${esc((active.peer_name || '?')[0].toUpperCase())}</div>
          <div class="grow">
            <b>${esc(active.peer_name)}</b>
            <div class="small muted">${esc(t('chatAbout'))} <a href="#/l/${active.listing_id}">${esc(active.listing_title)}</a></div>
          </div>
        </div>
        <div class="chat-log" id="log"></div>
        <form class="chat-form" id="msg-form">
          <input id="msg" placeholder="${esc(t('messagePh'))}" autocomplete="off" maxlength="2000">
          <button class="btn btn-primary" type="submit">${esc(t('send'))}</button>
        </form>
      </div>
    </div>`;

  const log = document.getElementById('log');
  let lastId = 0;
  let me = App.user.id;

  async function poll(scroll) {
    const d = await API.get(`/conversations/${active.id}/messages?after=${lastId}`);
    if (stale(gen)) return;
    me = d.me;
    if (!d.items.length) return;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    for (const m of d.items) {
      lastId = Math.max(lastId, m.id);
      const div = document.createElement('div');
      div.className = 'bubble' + (m.sender_id === me ? ' me' : '');
      div.innerHTML = `${esc(m.body)}<time>${esc(timeFmt(m.created_at))}</time>`;
      log.appendChild(div);
    }
    if (scroll || atBottom) log.scrollTop = log.scrollHeight;
  }

  await poll(true);
  if (!log.children.length) {
    log.innerHTML = `<div class="empty small">${esc(t('acceptHint'))}</div>`;
  }
  App.timers.push(setInterval(() => poll(false).catch(() => {}), 3000));

  document.getElementById('msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('msg');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      await API.post(`/conversations/${active.id}/messages`, { body });
      if (log.querySelector('.empty')) log.innerHTML = '';
      await poll(true);
    } catch (err) {
      toast(err.text, true);
    }
  });
}

/* ---------------- страница: профиль ---------------- */

function pageProfile() {
  const u = App.user;
  view().innerHTML = `
    <div style="max-width:560px;margin:0 auto" class="stack">
      <h1>${esc(t('profileTitle'))}</h1>
      <div class="panel stack">
        <div class="field"><label>${esc(t('name'))}</label><input id="p-name" value="${esc(u.name)}"></div>
        <div class="field"><label>${esc(t('email'))}</label><input value="${esc(u.email)}" disabled></div>
        <div class="field"><label>${esc(t('phone'))}</label><input id="p-phone" value="${esc(u.phone || '')}" placeholder="+374 ..."></div>
        <div class="field"><label>${esc(t('city'))}</label>
          <select id="p-city">${optionsHtml(window.CITIES, u.city, '—')}</select></div>
        <div class="field"><label>${esc(t('language'))}</label>
          <select id="p-lang">${optionsHtml(window.LANGS.map((l) => [l.code, l.label, l.label, l.label]), I18N.lang)}</select></div>
        <div><button class="btn btn-primary" id="p-save">${esc(t('saveChanges'))}</button></div>
      </div>

      <div class="panel stack">
        <div class="form-sec-title">${esc(t('changePassword'))}</div>
        <div class="field"><label>${esc(t('currentPassword'))}</label><input id="p-cur" type="password"></div>
        <div class="field"><label>${esc(t('newPassword'))}</label><input id="p-new" type="password"></div>
        <div><button class="btn" id="p-pass">${esc(t('saveChanges'))}</button></div>
      </div>

      <div class="panel">
        <div class="form-sec-title">${esc(t('appSection'))}</div>
        ${isStandalone()
          ? `<div class="small muted">✓ ${esc(t('installDone'))}</div>`
          : `<div class="row">
               <img src="/icons/icon-192.png" alt="" width="44" height="44" style="border-radius:10px">
               <div class="grow"><b>${esc(t('installTitle'))}</b>
                 <div class="small muted">${esc(t('installLead'))}</div></div>
               <button class="btn btn-primary btn-sm" id="install-profile">${esc(t('installBtn'))}</button>
             </div>`}
      </div>

      <div class="panel">
        <div class="row">
          <a class="btn btn-sm" href="#/my">${esc(t('navMy'))}</a>
          <a class="btn btn-sm" href="#/alerts">🔔 ${esc(t('navAlerts'))}</a>
          <a class="btn btn-sm" href="#/fav">${esc(t('navFav'))}</a>
          <button class="btn btn-sm btn-danger" id="logout">${esc(t('navLogout'))}</button>
        </div>
      </div>
    </div>`;

  document.getElementById('p-save').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const lang = document.getElementById('p-lang').value;
      const r = await API.patch('/me', {
        name: document.getElementById('p-name').value,
        phone: document.getElementById('p-phone').value,
        city: document.getElementById('p-city').value,
        lang,
      });
      App.user = r.user;
      I18N.set(lang);
      toast(t('saved'));
      render();
    } catch (err) { toast(err.text, true); e.currentTarget.disabled = false; }
  });

  document.getElementById('p-pass').addEventListener('click', async () => {
    try {
      await API.post('/me/password', {
        current: document.getElementById('p-cur').value,
        next: document.getElementById('p-new').value,
      });
      document.getElementById('p-cur').value = '';
      document.getElementById('p-new').value = '';
      toast(t('saved'));
    } catch (err) { toast(err.text, true); }
  });

  const installProfile = document.getElementById('install-profile');
  if (installProfile) installProfile.addEventListener('click', runInstall);

  document.getElementById('logout').addEventListener('click', () => {
    API.setToken(null);
    App.user = null;
    App.summary = { newOffers: 0, pendingOffers: 0, unreadMessages: 0 };
    go('#/');
  });
}

/* ---------------- страница: вход / регистрация ---------------- */

function pageAuth(mode) {
  const isLogin = mode === 'login';
  view().innerHTML = `
    <div class="auth-wrap">
      <div class="panel stack">
        <h1>${esc(isLogin ? t('loginTitle') : t('registerTitle'))}</h1>
        <form id="auth" class="stack">
          ${isLogin ? '' : `<div class="field"><label>${esc(t('name'))}</label><input name="name" required maxlength="80"></div>`}
          <div class="field"><label>${esc(t('email'))}</label><input name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label>${esc(t('password'))}</label>
            <input name="password" type="password" required minlength="6" autocomplete="${isLogin ? 'current-password' : 'new-password'}"></div>
          ${isLogin ? '' : `
            <div class="field"><label>${esc(t('phone'))} <span class="muted">(${esc(t('optional'))})</span></label>
              <input name="phone" placeholder="+374 ..." maxlength="40"></div>
            <div class="field"><label>${esc(t('city'))}</label>
              <select name="city">${optionsHtml(window.CITIES, '', '—')}</select></div>`}
          <div id="auth-err"></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">
            ${esc(isLogin ? t('navLogin') : t('navRegister'))}</button>
        </form>
        <div class="center small muted">
          ${isLogin
            ? `${esc(t('noAccount'))} <a href="#/register" style="color:var(--brand);font-weight:600">${esc(t('navRegister'))}</a>`
            : `${esc(t('haveAccount'))} <a href="#/login" style="color:var(--brand);font-weight:600">${esc(t('navLogin'))}</a>`}
        </div>
      </div>
    </div>`;

  document.getElementById('auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.lang = I18N.lang;
    try {
      const r = await API.post(isLogin ? '/auth/login' : '/auth/register', body);
      API.setToken(r.token);
      App.user = r.user;
      if (isLogin && r.user.lang && !localStorage.getItem('lang')) I18N.set(r.user.lang);
      await refreshSummary();
      go('#/');
    } catch (err) {
      btn.disabled = false;
      document.getElementById('auth-err').innerHTML = `<div class="form-error">${esc(err.text)}</div>`;
    }
  });
}

/* ---------------- сохранённые поиски и оповещения ---------------- */

const ALERT_KINDS = ['any', 'car', 'land', 'house', 'apartment', 'commercial'];

/* Читаемое описание поиска: «Автомобиль · Toyota · от 2016 · Ереван» */
function alertSummary(a) {
  const p = [a.kind && a.kind !== 'any' ? t(a.kind) : t('anyKind')];
  if (a.make) p.push(a.make);
  if (a.model) p.push(a.model);
  if (a.year_min && a.year_max) p.push(a.year_min + '–' + a.year_max);
  else if (a.year_min) p.push(a.year_min + '+');
  else if (a.year_max) p.push('≤ ' + a.year_max);
  if (a.mileage_max) p.push('≤ ' + numFmt(a.mileage_max) + ' ' + t('km'));
  if (a.transmission) p.push(lookup(OPTIONS.transmission, a.transmission));
  if (a.fuel) p.push(lookup(OPTIONS.fuel, a.fuel));
  if (a.body) p.push(lookup(OPTIONS.body, a.body));
  if (a.rooms_min) p.push(t('roomsFrom').toLowerCase() + ' ' + a.rooms_min);
  if (a.area_min) p.push(t('from') + ' ' + numFmt(a.area_min) + ' ' + t('sqm'));
  if (a.land_min) p.push(t('from') + ' ' + numFmt(a.land_min) + ' ' + t('sotka'));
  if (a.city) p.push(cityName(a.city));
  if (a.price_min && a.price_max) p.push(money(a.price_min, a.price_currency) + '–' + money(a.price_max, a.price_currency));
  else if (a.price_min) p.push(t('from') + ' ' + money(a.price_min, a.price_currency));
  else if (a.price_max) p.push(t('to') + ' ' + money(a.price_max, a.price_currency));
  return p.join(' · ');
}

/* Поля критериев — те же, что в конструкторе условий обмена */
function alertFieldsHtml(a) {
  const f = (label, inner, wide) =>
    `<div class="field"${wide ? ' style="grid-column:1/-1"' : ''}><label>${esc(label)}</label>${inner}</div>`;
  const k = a.kind || 'any';
  const rows = [];
  if (k === 'car') {
    rows.push(f(t('make'), `<select data-a="make" data-reload="1">${optionsHtml(Object.keys(window.CAR_MAKES), a.make, t('all'))}</select>`));
    rows.push(f(t('model'), `<input data-a="model" list="al-models" value="${esc(a.model || '')}" placeholder="${esc(t('all'))}">
      <datalist id="al-models">${(window.CAR_MAKES[a.make] || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>`));
    rows.push(f(t('yearFrom'), `<select data-a="year_min">${optionsHtml(yearsList(), a.year_min, '—')}</select>`));
    rows.push(f(t('yearTo'), `<select data-a="year_max">${optionsHtml(yearsList(), a.year_max, '—')}</select>`));
    rows.push(f(t('mileageMax') + ', ' + t('km'), `<input data-a="mileage_max" type="number" min="0" value="${esc(a.mileage_max || '')}">`));
    rows.push(f(t('transmission'), `<select data-a="transmission">${optionsHtml(OPTIONS.transmission, a.transmission, t('all'))}</select>`));
    rows.push(f(t('fuel'), `<select data-a="fuel">${optionsHtml(OPTIONS.fuel, a.fuel, t('all'))}</select>`));
    rows.push(f(t('body'), `<select data-a="body">${optionsHtml(OPTIONS.body, a.body, t('all'))}</select>`));
  }
  if (k === 'house' || k === 'apartment' || k === 'commercial')
    rows.push(f(t('areaFrom') + ', ' + t('sqm'), `<input data-a="area_min" type="number" min="0" step="0.1" value="${esc(a.area_min || '')}">`));
  if (k === 'land' || k === 'house')
    rows.push(f(t('landFrom') + ', ' + t('sotka'), `<input data-a="land_min" type="number" min="0" step="0.1" value="${esc(a.land_min || '')}">`));
  if (k === 'house' || k === 'apartment')
    rows.push(f(t('roomsFrom'), `<input data-a="rooms_min" type="number" min="0" max="50" value="${esc(a.rooms_min || '')}">`));
  rows.push(f(t('city'), `<select data-a="city">${optionsHtml(window.CITIES, a.city, t('all'))}</select>`));
  rows.push(f(t('priceFrom'), `<input data-a="price_min" type="number" min="0" value="${esc(a.price_min || '')}">`));
  rows.push(f(t('priceTo'), `<input data-a="price_max" type="number" min="0" value="${esc(a.price_max || '')}">`));
  rows.push(f('—', `<select data-a="price_currency">${optionsHtml(['USD', 'AMD', 'EUR', 'RUB'], a.price_currency || 'USD')}</select>`));

  return `
    <div class="field">
      <label>${esc(t('kind'))}</label>
      <select data-a="kind" data-reload="1">
        ${ALERT_KINDS.map((x) => `<option value="${x}"${k === x ? ' selected' : ''}>${esc(x === 'any' ? t('anyKind') : t(x))}</option>`).join('')}
      </select>
    </div>
    <div class="form-grid">${rows.join('')}</div>`;
}

/* Окно создания поиска. prefill приходит из фильтров ленты. */
function openAlertModal(prefill, editId) {
  if (!App.user) { toast(t('loginRequired'), true); return go('#/login'); }
  let a = { kind: 'any', price_currency: 'USD', ...(prefill || {}) };

  const draw = () => {
    const modal = openModal(editId ? t('alertsTitle') : t('newSearch'),
      `<div id="alert-fields">${alertFieldsHtml(a)}</div>
       <div class="alert-preview mono" id="alert-preview">${esc(alertSummary(a))}</div>
       <div class="small muted">${esc(t('alertsLead'))}</div>`,
      `<button class="btn" data-close="1">${esc(t('cancel'))}</button>
       <button class="btn btn-primary" id="alert-save">${esc(t('saveSearch'))}</button>`);

    const read = () => {
      const o = {};
      modal.querySelectorAll('[data-a]').forEach((el) => { if (el.value !== '') o[el.dataset.a] = el.value; });
      return o;
    };
    const refresh = () => {
      a = { ...a, ...read() };
      const pv = modal.querySelector('#alert-preview');
      if (pv) pv.textContent = alertSummary(a);
    };
    modal.querySelectorAll('[data-a]').forEach((el) => {
      el.addEventListener('input', refresh);
      el.addEventListener('change', refresh);
    });
    modal.querySelectorAll('[data-reload]').forEach((el) => el.addEventListener('change', () => {
      a = { ...a, ...read() };
      closeModal();
      draw();
    }));

    modal.querySelector('#alert-save').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      a = { ...a, ...read() };
      try {
        if (editId) await API.patch('/alerts/' + editId, a);
        else await API.post('/alerts', a);
        closeModal();
        toast(t('searchSaved'));
        go('#/alerts');
        render();
      } catch (err) {
        e.currentTarget.disabled = false;
        toast(err.text, true);
      }
    });
  };
  draw();
}

/* ---------------- страница: мои поиски ---------------- */

async function pageAlerts(alertId) {
  const gen = App.gen;

  if (alertId) {
    const [alerts, res] = await Promise.all([API.get('/alerts'), API.get('/alerts/' + alertId + '/matches')]);
    if (stale(gen)) return;
    const a = alerts.items.find((x) => String(x.id) === String(alertId));
    view().innerHTML = `
      <a class="btn btn-ghost btn-sm" href="#/alerts" style="margin-bottom:12px">← ${esc(t('back'))}</a>
      <h1 style="margin-bottom:6px">${esc(t('matchingNow'))}</h1>
      <div class="alert-preview mono" style="margin-bottom:16px">${esc(a ? alertSummary(a) : '')}</div>
      ${res.items.length ? gridHtml(res.items) : emptyHtml('🔍', t('nothingFound'), t('alertsLead'))}`;
    return;
  }

  const [data, notif] = await Promise.all([API.get('/alerts'), API.get('/notifications')]);
  if (stale(gen)) return;

  const notifyState = ('Notification' in window) ? Notification.permission : 'unsupported';
  const unseen = notif.items.filter((n) => !n.seen).length;

  view().innerHTML = `
    <div class="spread" style="margin-bottom:6px">
      <h1>${esc(t('alertsTitle'))}</h1>
      <button class="btn btn-dark" id="new-alert">+ ${esc(t('newSearch'))}</button>
    </div>
    <p class="small muted" style="margin:0 0 16px">${esc(t('alertsLead'))}</p>

    ${notifyState === 'granted'
      ? `<div class="notify-row ok">✓ ${esc(t('notifyEnabled'))}</div>`
      : notifyState === 'denied'
        ? `<div class="notify-row">${esc(t('notifyBlocked'))}</div>`
        : notifyState === 'unsupported' ? ''
          : `<div class="notify-row">
               <div class="grow"><b>🔔 ${esc(t('notifyEnable'))}</b>
                 <div class="small muted">${esc(t('notifyHint'))}</div></div>
               <button class="btn btn-primary btn-sm" id="ask-notify">${esc(t('notifyEnable'))}</button>
             </div>`}

    <div class="panel" style="margin-bottom:16px">
      <div class="spread" style="margin-bottom:10px">
        <div class="form-sec-title" style="margin:0">${esc(t('newForYou'))}</div>
        ${unseen ? `<button class="btn btn-ghost btn-sm" id="mark-read">${esc(t('markRead'))}</button>` : ''}
      </div>
      ${notif.items.length ? `<div class="notif-list">${notif.items.map((n) => `
        <a class="notif${n.seen ? '' : ' new'}" href="#/l/${n.listing_id}">
          ${n.photo ? `<img src="${esc(n.photo)}" alt="">` : `<div class="ph">${n.kind === 'car' ? '🚗' : '🏠'}</div>`}
          <div class="txt">
            <b>${esc(n.title)}</b>
            <span>${esc([kindName(n), cityName(n.city), money(n.price, n.currency)].filter(Boolean).join(' · '))}</span>
          </div>
          <span class="small muted mono">${esc(dateFmt(n.created_at))}</span>
        </a>`).join('')}</div>`
        : `<div class="small muted">${esc(t('noNewMatches'))}</div>`}
    </div>

    ${data.items.length ? `<div class="stack">${data.items.map((a) => `
      <div class="panel alert-card${a.active ? '' : ' off'}">
        <div class="spread">
          <div class="grow">
            <div class="row" style="gap:8px">
              <b>${esc(a.kind === 'any' ? t('anyKind') : t(a.kind))}</b>
              ${a.unseen ? `<span class="chip chip-brand">${a.unseen} ${esc(t('newForYou').toLowerCase())}</span>` : ''}
              ${a.active ? '' : `<span class="chip">${esc(t('alertPaused'))}</span>`}
            </div>
            <div class="alert-preview mono" style="margin-top:8px">${esc(alertSummary(a))}</div>
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <a class="btn btn-sm btn-primary" href="#/alerts/${a.id}">${esc(t('foundNow'))}: ${a.matches}</a>
          <button class="btn btn-sm" data-toggle="${a.id}" data-active="${a.active ? 0 : 1}">
            ${esc(a.active ? t('alertPause') : t('alertResume'))}</button>
          <button class="btn btn-sm btn-danger" data-del-alert="${a.id}">${esc(t('delete'))}</button>
        </div>
      </div>`).join('')}</div>`
      : emptyHtml('🔔', t('alertsEmpty'), t('alertsEmptyHint'))}`;

  document.getElementById('new-alert').addEventListener('click', () => openAlertModal());

  const askBtn = document.getElementById('ask-notify');
  if (askBtn) askBtn.addEventListener('click', enableNotifications);

  const markBtn = document.getElementById('mark-read');
  if (markBtn) markBtn.addEventListener('click', async () => {
    await API.post('/notifications/read');
    await refreshSummary();
    render();
  });

  view().querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    await API.patch('/alerts/' + b.dataset.toggle, { active: Number(b.dataset.active) });
    render();
  }));
  view().querySelectorAll('[data-del-alert]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('deleteSearch'))) return;
    await API.del('/alerts/' + b.dataset.delAlert);
    render();
  }));
}

/* ---------------- уведомления ---------------- */

async function enableNotifications() {
  if (!('Notification' in window)) return toast(t('notifyBlocked'), true);
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast(t('notifyBlocked'), true); return render(); }
  toast(t('notifyEnabled'));
  await subscribePush();
  render();
}

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted' || !App.user) return;
    const { key } = await API.get('/push/key');
    if (!key) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) }));
    await API.post('/push/subscribe', sub.toJSON());
  } catch (e) {
    console.warn('push:', e && e.message);
  }
}

/* Появились новые совпадения, пока приложение открыто */
function announceMatches(count) {
  toast('🔔 ' + t('notifyNewTitle') + (count > 1 ? ' · ' + count : ''));
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('TooBarter', { body: t('notifyNewTitle'), icon: '/icons/icon-192.png' });
    }
  } catch { /* браузер может запретить прямой показ */ }
}

/* ---------------- установка на телефон ---------------- */

let deferredInstall = null;

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  } catch { return false; }
}
function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function canOfferInstall() {
  if (isStandalone()) return false;
  return !!deferredInstall || (isIos() && /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
}

async function runInstall() {
  if (deferredInstall) {
    deferredInstall.prompt();
    const res = await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    drawInstallBar();
    if (res && res.outcome === 'accepted') toast(t('installDone'));
    return;
  }
  if (isIos()) openModal(t('installTitle'), `<p>${esc(t('installIos'))}</p>`, '');
}

function drawInstallBar() {
  const bar = document.getElementById('install-bar');
  if (!bar) return;
  if (!canOfferInstall() || localStorage.getItem('install-hidden')) { bar.innerHTML = ''; return; }
  bar.innerHTML = `
    <div class="install-bar">
      <img src="/icons/icon-192.png" alt="" width="40" height="40">
      <div class="grow">
        <b>${esc(t('installTitle'))}</b>
        <div class="small muted">${esc(t('installLead'))}</div>
      </div>
      <button class="btn btn-primary btn-sm" id="install-go">${esc(t('installBtn'))}</button>
      <button class="btn btn-ghost btn-sm" id="install-hide" aria-label="${esc(t('installLater'))}">✕</button>
    </div>`;
  bar.querySelector('#install-go').addEventListener('click', runInstall);
  bar.querySelector('#install-hide').addEventListener('click', () => {
    localStorage.setItem('install-hidden', '1');
    bar.innerHTML = '';
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  drawInstallBar();
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  drawInstallBar();
  toast(t('installDone'));
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/* ---------------- запуск ---------------- */


async function loadMe() {
  if (!API.token) return;
  try {
    const r = await API.get('/me');
    App.user = r.user;
    if (r.user.lang && !localStorage.getItem('lang')) I18N.set(r.user.lang);
  } catch {
    API.setToken(null);
    App.user = null;
  }
}

async function refreshSummary() {
  if (!App.user) return;
  try {
    const before = App.summary.newMatches || 0;
    App.summary = await API.get('/summary');
    renderHeader();
    const now = App.summary.newMatches || 0;
    if (now > before) announceMatches(now - before);
  } catch { /* игнорируем */ }
}

window.addEventListener('hashchange', render);

(async function start() {
  I18N.init();
  registerServiceWorker();
  await loadMe();
  await render();
  drawInstallBar();
  await refreshSummary();
  subscribePush();
  setInterval(refreshSummary, 20000);
})();
