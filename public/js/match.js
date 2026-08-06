/* ============================================================
   Сопоставление «пожеланий к обмену» с предложенным объектом.
   Один и тот же файл используют сервер и браузер, чтобы
   проверка совпадала до последнего условия.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MATCH = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const n = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
  const s = (v) => (v === null || v === undefined ? '' : String(v).trim().toLowerCase());
  const eq = (a, b) => s(a) === s(b);

  /* Категория объекта одним словом: car | land | house | apartment | commercial */
  function kindOf(l) {
    return l.kind === 'car' ? 'car' : (l.realty_type || 'realty');
  }

  /* Проверка одного пожелания.
     w     — пожелание владельца
     c     — предложенный объект (объявление того, кто предлагает)
     offer — { pay_direction, pay_amount, pay_currency } со стороны предлагающего
     Возвращает { ok, checks: [{ field, ok, need, got }] } */
  function checkWish(w, c, offer) {
    const checks = [];
    const add = (field, ok, need, got) => checks.push({ field, ok: !!ok, need, got });

    if (w.kind && w.kind !== 'any') add('kind', kindOf(c) === w.kind, w.kind, kindOf(c));

    if (w.make) add('make', eq(c.make, w.make), w.make, c.make || '—');
    if (w.model) add('model', s(c.model).includes(s(w.model)), w.model, c.model || '—');

    if (n(w.year_min) !== null) add('year_min', n(c.year) !== null && n(c.year) >= n(w.year_min), '≥ ' + w.year_min, c.year || '—');
    if (n(w.year_max) !== null) add('year_max', n(c.year) !== null && n(c.year) <= n(w.year_max), '≤ ' + w.year_max, c.year || '—');
    if (n(w.mileage_max) !== null) add('mileage_max', n(c.mileage) !== null && n(c.mileage) <= n(w.mileage_max), '≤ ' + w.mileage_max, c.mileage);
    if (w.transmission) add('transmission', eq(c.transmission, w.transmission), w.transmission, c.transmission || '—');
    if (w.fuel) add('fuel', eq(c.fuel, w.fuel), w.fuel, c.fuel || '—');
    if (w.body) add('body', eq(c.body, w.body), w.body, c.body || '—');

    if (w.city) add('city', eq(c.city, w.city), w.city, c.city || '—');

    if (n(w.area_min) !== null) add('area_min', n(c.area) !== null && n(c.area) >= n(w.area_min), '≥ ' + w.area_min, c.area);
    if (n(w.land_min) !== null) add('land_min', n(c.land_area) !== null && n(c.land_area) >= n(w.land_min), '≥ ' + w.land_min, c.land_area);
    if (n(w.rooms_min) !== null) add('rooms_min', n(c.rooms) !== null && n(c.rooms) >= n(w.rooms_min), '≥ ' + w.rooms_min, c.rooms);

    if (n(w.price_min) !== null || n(w.price_max) !== null) {
      const sameCur = !w.price_currency || !c.currency || w.price_currency === c.currency;
      const p = n(c.price);
      let ok = p !== null && sameCur;
      if (ok && n(w.price_min) !== null) ok = p >= n(w.price_min);
      if (ok && n(w.price_max) !== null) ok = p <= n(w.price_max);
      const need = [n(w.price_min) !== null ? '≥ ' + w.price_min : '', n(w.price_max) !== null ? '≤ ' + w.price_max : '']
        .filter(Boolean).join(' · ');
      add('price', ok, need, p);
    }

    /* Доплата. Пожелание записано со стороны владельца:
       in  — «мне доплачивают минимум N» → предлагающий должен платить (out) не меньше N
       out — «я готов доплатить максимум N» → предлагающий получает (in) не больше N */
    const dir = w.pay_direction;
    if ((dir === 'in' || dir === 'out') && !(offer && offer.ignorePay)) {
      const o = offer || {};
      const amount = n(o.pay_amount) || 0;
      const min = n(w.pay_min) || 0;
      let ok;
      if (dir === 'in') ok = o.pay_direction === 'out' && amount >= min;
      else ok = (o.pay_direction === 'none' && min >= 0) || (o.pay_direction === 'in' && amount <= min);
      if (ok && o.pay_direction !== 'none' && w.pay_currency && o.pay_currency && w.pay_currency !== o.pay_currency) ok = false;
      add('pay', ok, { direction: dir, amount: min, currency: w.pay_currency || 'USD' },
        { direction: o.pay_direction || 'none', amount, currency: o.pay_currency || 'USD' });
    }

    return { ok: checks.every((x) => x.ok), checks };
  }

  /* Проверка объекта по всем пожеланиям: достаточно совпасть с одним вариантом.
     Возвращает { ok, index, result, results } — index указывает на лучший вариант. */
  function matchListing(wishes, c, offer) {
    const list = Array.isArray(wishes) ? wishes : [];
    if (!list.length) return { ok: true, free: true, index: -1, result: null, results: [] };

    const results = list.map((w) => checkWish(w, c, offer));
    let best = 0;
    for (let i = 0; i < results.length; i++) {
      if (results[i].ok) { best = i; break; }
      const score = (r) => r.checks.filter((x) => x.ok).length - r.checks.filter((x) => !x.ok).length;
      if (score(results[i]) > score(results[best])) best = i;
    }
    return { ok: results.some((r) => r.ok), free: false, index: best, result: results[best], results };
  }

  /* Минимальная доплата, которую ждёт владелец по конкретному пожеланию */
  function suggestedPay(w) {
    if (!w || (w.pay_direction !== 'in' && w.pay_direction !== 'out')) return null;
    return {
      direction: w.pay_direction === 'in' ? 'out' : 'in',
      amount: Number(w.pay_min) || 0,
      currency: w.pay_currency || 'USD',
    };
  }

  return { kindOf, checkWish, matchListing, suggestedPay };
});
