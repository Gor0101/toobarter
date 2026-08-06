/* Прогон SPA в jsdom: ловим ошибки рендера страниц. node tools/fronttest.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE = 'http://localhost:3000';
const pub = path.join(__dirname, '..', 'public');
const errors = [];

const dom = new JSDOM(fs.readFileSync(path.join(pub, 'index.html'), 'utf8'), {
  url: BASE + '/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;

// jsdom's FormData не распознаётся встроенным fetch (undici) как multipart —
// на границе fetch пересобираем тело в нативный класс, иначе запросы
// с файлами уходят с пустым телом и сервер получает req.body === undefined.
w.fetch = (url, opts) => {
  if (opts && opts.body && typeof opts.body.entries === 'function' && !(opts.body instanceof FormData)) {
    const native = new FormData();
    for (const [k, v] of opts.body.entries()) native.append(k, v);
    opts = { ...opts, body: native };
  }
  return fetch(url.startsWith('http') ? url : BASE + url, opts);
};
w.localStorage.setItem('lang', 'ru');
w.URL.createObjectURL = () => 'blob:x';
w.confirm = () => true;
w.scrollTo = () => {};
w.console.error = (...a) => { const m = a.join(' '); if (!m.includes('not_found')) errors.push(m); };
w.addEventListener('error', (e) => errors.push('window error: ' + e.message));

for (const f of ['i18n.js', 'catalog.js', 'match.js', 'api.js', 'ui.js', 'app.js']) {
  w.eval(fs.readFileSync(path.join(pub, 'js', f), 'utf8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => w.document.getElementById('view').textContent.replace(/\s+/g, ' ').trim();

async function visit(hash, label, mustContain) {
  w.go(hash);   // go() перерисовывает и когда адрес не изменился
  let body = '';
  for (let i = 0; i < 40; i++) {           // ждём, пока страница действительно отрисуется
    await sleep(100);
    body = text();
    if (!mustContain || body.includes(mustContain)) break;
  }
  const ok = !mustContain || body.includes(mustContain);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(26)} ${body.slice(0, 78)}`);
  if (!ok) { errors.push(`page ${label}: ожидали "${mustContain}"`); console.log('   ПОЛНЫЙ ТЕКСТ:', body.slice(0, 400)); }
}

(async () => {
  await sleep(1200);

  // гость
  await visit('#/', 'лента (гость)', 'Toyota');
  await visit('#/?kind=car', 'фильтр: машины', 'Марка');
  await visit('#/?kind=realty', 'фильтр: недвижимость', 'Тип недвижимости');
  await visit('#/?q=Camry', 'поиск', 'Camry');
  await visit('#/l/1', 'карточка объявления', 'Характеристики');
  await visit('#/l/9999', 'несуществующее', 'Ошибка');
  await visit('#/my', 'приватная страница гостю', 'Вход');

  // вход
  await visit('#/login', 'страница входа', 'Вход');
  w.document.querySelector('[name=email]').value = 'ani@demo.am';
  w.document.querySelector('[name=password]').value = 'demo1234';
  w.document.getElementById('auth').dispatchEvent(new w.Event('submit'));
  await sleep(1200);
  console.log('OK    вход выполнен            user =', w.App.user && w.App.user.name);
  if (!w.App.user) errors.push('логин не сработал');

  await visit('#/my', 'мои объявления', 'Скрыть');
  await visit('#/offers', 'предложения (входящие)', 'Предлагает');
  await visit('#/offers?box=out', 'предложения (исходящие)', 'Исходящие');
  await visit('#/chats', 'чаты', 'Сообщения');
  await visit('#/fav', 'избранное', 'Избранное');
  await visit('#/profile', 'профиль', 'Профиль');
  await visit('#/new', 'новое объявление', 'Опубликовать');
  await visit('#/edit/1', 'редактирование', 'Сохранить');

  // переключение языков на каждой странице
  for (const lang of ['hy', 'en', 'ru']) {
    w.I18N.set(lang);
    await w.render();
    await sleep(400);
    console.log(`OK    язык ${lang}                 ${text().slice(0, 60)}`);
  }

  // отправка сообщения в чат
  await visit('#/chats', 'чат: открыт', 'Сообщения');
  const input = w.document.getElementById('msg');
  if (input) {
    input.value = 'Тестовое сообщение из jsdom';
    w.document.getElementById('msg-form').dispatchEvent(new w.Event('submit'));
    await sleep(1100);
    const ok = w.document.getElementById('log').textContent.includes('jsdom');
    console.log((ok ? 'OK  ' : 'FAIL') + '  отправка сообщения');
    if (!ok) errors.push('сообщение не отправилось');
  } else errors.push('поле ввода чата не найдено');

  // предложение обмена от другого пользователя
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mher@demo.am', password: 'demo1234' }),
  }).then((x) => x.json());
  w.API.setToken(r.token);
  w.App.user = r.user;
  await visit('#/l/2', 'чужое объявление', 'Предложить обмен');
  w.document.getElementById('make-offer').click();
  await sleep(1200);
  const modal = w.document.querySelector('.modal');
  console.log((modal ? 'OK  ' : 'FAIL') + '  модалка обмена            ' +
    (modal ? modal.textContent.replace(/\s+/g, ' ').slice(0, 60) : ''));
  if (modal) {
    modal.querySelector('#offered').value = '3';
    modal.querySelector('#pd-out').checked = true;
    modal.querySelector('#offer-msg').value = 'Меняю Мерседес на квартиру';
    modal.querySelector('#send-offer').click();
    let sent = false;
    for (let i = 0; i < 40; i++) { await sleep(100); if (!w.document.querySelector('.modal')) { sent = true; break; } }
    if (!sent) console.log('   тост:', w.document.getElementById('toasts').textContent);
    console.log((sent ? 'OK  ' : 'FAIL') + '  предложение отправлено');
    if (!sent) errors.push('предложение не отправилось');
  } else errors.push('модалка не открылась');

  // создание объявления через форму
  w.API.setToken(null); w.App.user = null;
  const la = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lilit@demo.am', password: 'demo1234' }) }).then((x) => x.json());
  w.API.setToken(la.token); w.App.user = la.user;

  await visit('#/new', 'форма нового объявления', 'Опубликовать');
  const f = w.document.getElementById('lform');
  f.querySelector('[name=make]').value = 'Honda';
  f.querySelector('[name=make]').dispatchEvent(new w.Event('change'));
  f.querySelector('[name=model]').value = 'Civic';
  f.querySelector('[name=year]').value = '2015';
  f.querySelector('[name=mileage]').value = '120000';
  f.querySelector('[name=price]').value = '9000';
  f.querySelector('[name=city]').value = 'gyumri';
  // конструктор пожеланий: «Mercedes-Benz A-Class 2020+, доплата мне от 5000$»
  const wb = w.document.getElementById('wishes');
  wb.querySelector('#add-wish').click();
  await sleep(200);
  const setW = async (field, value) => {
    const el = w.document.querySelector(`#wishes [data-f=${field}]`);
    el.value = value;
    el.dispatchEvent(new w.Event('change'));
    await sleep(200);
  };
  await setW('kind', 'car');
  await setW('make', 'Mercedes-Benz');
  await setW('model', 'A-Class');
  await setW('year_min', '2020');
  await setW('mileage_max', '80000');
  await setW('pay_direction', 'in');
  await setW('pay_min', '5000');
  const wishOk = w.document.querySelectorAll('#wishes .wish-form').length === 1;
  console.log((wishOk ? 'OK  ' : 'FAIL') + '  пожелание собрано');
  if (!wishOk) errors.push('конструктор пожеланий не собрал карточку');
  f.querySelector('#p-in').checked = true;
  f.querySelector('[name=pay_amount]').value = '2500';
  f.querySelector('[name=description]').value = 'Тест из jsdom';
  f.dispatchEvent(new w.Event('submit'));
  await sleep(1500);
  const created = text().includes('Honda Civic 2015') && text().includes('2 500');
  const wishShown = text().includes('Mercedes-Benz A-Class') && text().includes('2020+') && text().includes('80 000');
  console.log((wishShown ? 'OK  ' : 'FAIL') + '  пожелания на странице     ' +
    text().split('Рассматриваю обмен на')[1]?.slice(0, 90));
  if (!wishShown) errors.push('пожелания не отображаются в объявлении');
  const newListingHash = w.location.hash;
  console.log((created ? 'OK  ' : 'FAIL') + '  объявление создано        ' + text().slice(0, 70));
  if (!created) errors.push('форма создания не сработала');

  // приём предложения владельцем
  w.API.setToken(null);
  const ani = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ani@demo.am', password: 'demo1234' }) }).then((x) => x.json());
  w.API.setToken(ani.token); w.App.user = ani.user;
  await visit('#/offers', 'входящие до приёма', 'Ждёт ответа');
  const acceptBtn = [...w.document.querySelectorAll('[data-do=accept]')][0];
  if (acceptBtn) {
    acceptBtn.click();
    await sleep(1800);
    const opened = w.location.hash.startsWith('#/chats/');
    console.log((opened ? 'OK  ' : 'FAIL') + '  приём → чат открылся      ' + w.location.hash);
    if (!opened) errors.push('после принятия чат не открылся');
  } else errors.push('кнопка «Принять» не найдена');

  // живая проверка соответствия в окне обмена
  w.API.setToken(null);
  const mh = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mher@demo.am', password: 'demo1234' }) }).then((x) => x.json());
  w.API.setToken(mh.token); w.App.user = mh.user;
  await visit(newListingHash, 'объявление с условиями', 'Предложить обмен');
  w.document.getElementById('make-offer').click();
  await sleep(1500);
  const m = w.document.querySelector('#match-box');
  const mismatch = m && m.textContent.includes('Не подходит');
  console.log((mismatch ? 'OK  ' : 'FAIL') + '  несовпадение показано     ' +
    (m ? m.textContent.replace(/\s+/g, ' ').slice(0, 95) : ''));
  if (!mismatch) errors.push('проверка соответствия не показала несовпадение');

  // сбрасываем доплату — тогда условие по деньгам перестаёт выполняться
  const pdNone = w.document.querySelector('#pd-none');
  pdNone.checked = true;
  pdNone.dispatchEvent(new w.Event('change'));
  await sleep(300);
  const fix = w.document.querySelector('#fix-pay');
  if (fix) {
    fix.click();
    await sleep(400);
    const payFixed = w.document.querySelector('#pay-amount').value === '5000' &&
      w.document.querySelector('#pd-out').checked;
    console.log((payFixed ? 'OK  ' : 'FAIL') + '  доплата подставлена       ' +
      w.document.querySelector('#pay-amount').value);
    if (!payFixed) errors.push('кнопка «поставить минимум» не сработала');
  } else errors.push('кнопка подстановки доплаты не появилась');
  w.closeModal();

  // фильтр «что подойдёт моему объекту»
  await visit('#/?matches=3', 'фильтр: подходящего нет', 'Ничего не найдено');

  w.API.setToken(ani.token); w.App.user = ani.user;   // Camry 2018 — под неё условия есть
  await visit('#/?matches=1', 'фильтр: есть подходящее', 'Найдено');
  const fitOk = text().includes('Квартира');
  console.log((fitOk ? 'OK  ' : 'FAIL') + '  подобрал нужный объект    ' + text().replace(/\s+/g, ' ').slice(-80));
  if (!fitOk) errors.push('фильтр совпадений не нашёл подходящее объявление');

  // ---- сохранённые поиски и оповещения ----
  const mher = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mher@demo.am', password: 'demo1234' }) }).then((x) => x.json());
  w.API.setToken(mher.token); w.App.user = mher.user;

  await visit('#/alerts', 'страница поисков', 'Мои поиски');
  w.document.getElementById('new-alert').click();
  await sleep(600);
  let am = w.document.querySelector('.modal');
  const kindSel = am && am.querySelector('[data-a=kind]');
  if (kindSel) {
    kindSel.value = 'car';
    kindSel.dispatchEvent(new w.Event('change'));
    await sleep(400);
    am = w.document.querySelector('.modal');
    const mk = am.querySelector('[data-a=make]');
    mk.value = 'Toyota';
    mk.dispatchEvent(new w.Event('change'));
    await sleep(400);
    am = w.document.querySelector('.modal');
    const ym = am.querySelector('[data-a=year_min]');
    ym.value = '2016';
    ym.dispatchEvent(new w.Event('change'));
    const preview = am.querySelector('#alert-preview').textContent;
    console.log('OK    описание поиска           ' + preview.trim());
    am.querySelector('#alert-save').click();
    let saved = false;
    for (let i = 0; i < 40; i++) { await sleep(100); if (!w.document.querySelector('.modal')) { saved = true; break; } }
    await sleep(500);
    const listed = text().includes('Toyota');
    console.log((saved && listed ? 'OK  ' : 'FAIL') + '  поиск сохранён            ' + text().replace(/\s+/g, ' ').slice(0, 70));
    if (!saved || !listed) errors.push('поиск не сохранился');
  } else errors.push('окно создания поиска не открылось');

  // другой пользователь публикует подходящее объявление
  const lil = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lilit@demo.am', password: 'demo1234' }) }).then((x) => x.json());
  const fd = new FormData();
  [['kind', 'car'], ['make', 'Toyota'], ['model', 'Corolla'], ['year', '2021'], ['mileage', '30000'],
   ['city', 'yerevan'], ['price', '19000']].forEach(([k, v]) => fd.set(k, v));
  const posted = await fetch(BASE + '/api/listings', { method: 'POST', headers: { Authorization: 'Bearer ' + lil.token }, body: fd })
    .then((x) => x.json());
  console.log((posted.notified >= 1 ? 'OK  ' : 'FAIL') + '  оповещено получателей     ' + posted.notified);
  if (!posted.notified) errors.push('оповещение по поиску не сработало');

  // счётчик растёт до захода на вкладку «Поиски» — сам заход отмечает всё прочитанным
  const sum = await fetch(BASE + '/api/summary', { headers: { Authorization: 'Bearer ' + mher.token } }).then((x) => x.json());
  console.log((sum.newMatches >= 1 ? 'OK  ' : 'FAIL') + '  счётчик новых совпадений  ' + sum.newMatches);
  if (!sum.newMatches) errors.push('счётчик совпадений не вырос');

  await visit('#/alerts', 'совпадение в списке', 'Corolla');
  await sleep(500);
  const sum2 = await fetch(BASE + '/api/summary', { headers: { Authorization: 'Bearer ' + mher.token } }).then((x) => x.json());
  console.log((sum2.newMatches === 0 ? 'OK  ' : 'FAIL') + '  отметка «прочитано» при заходе  ' + sum2.newMatches);
  if (sum2.newMatches !== 0) errors.push('заход на «Поиски» не отметил совпадения прочитанными');

  // ---- нижнее меню ----
  const tabs = [...w.document.querySelectorAll('#tabbar a')];
  const tabsOk = tabs.length === 5 && tabs.every((a) => a.querySelector('svg')) &&
    w.document.querySelector('#tabbar a.fab');
  console.log((tabsOk ? 'OK  ' : 'FAIL') + '  нижнее меню               ' +
    tabs.map((a) => a.textContent.trim()).join(' · '));
  if (!tabsOk) errors.push('нижнее меню собрано неверно');

  // ---- установка на телефон ----
  const mf = await fetch(BASE + '/manifest.webmanifest').then((r) => r.json());
  const mfOk = mf.display === 'standalone' && mf.icons.length >= 3 && mf.start_url === '/';
  console.log((mfOk ? 'OK  ' : 'FAIL') + '  манифест приложения       ' + mf.short_name + ' · иконок ' + mf.icons.length);
  if (!mfOk) errors.push('манифест приложения некорректен');

  for (const f of ['/sw.js', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png']) {
    const r = await fetch(BASE + f);
    if (!r.ok) errors.push('не отдаётся ' + f);
  }
  console.log('OK    файлы приложения          sw.js + 4 иконки отдаются');

  const evt = new w.Event('beforeinstallprompt');
  evt.prompt = () => {};
  evt.userChoice = Promise.resolve({ outcome: 'accepted' });
  w.dispatchEvent(evt);
  await sleep(300);
  const bar = w.document.getElementById('install-bar').textContent;
  const barOk = bar.includes('Установи приложение');
  console.log((barOk ? 'OK  ' : 'FAIL') + '  предложение установки     ' + bar.replace(/\s+/g, ' ').slice(0, 60));
  if (!barOk) errors.push('баннер установки не показался');

  w.document.getElementById('install-hide').click();
  const hidden = w.document.getElementById('install-bar').textContent === '';
  console.log((hidden ? 'OK  ' : 'FAIL') + '  баннер закрывается');
  if (!hidden) errors.push('баннер установки не закрывается');

  console.log('\n' + (errors.length ? '❌ ОШИБКИ:\n' + errors.join('\n') : '✅ Все проверки прошли'));
  process.exit(errors.length ? 1 : 0);
})();
