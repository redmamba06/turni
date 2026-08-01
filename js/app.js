/* app.js — interfaccia dell'app Turni Gelateria. */
(function () {
  'use strict';
  const S = window.Store;

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const euro = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const DOW_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

  function fmtHours(h) {
    if (!h) return '0h';
    const H = Math.floor(h);
    const M = Math.round((h - H) * 60);
    if (M === 0) return H + 'h';
    if (H === 0) return M + 'm';
    return H + 'h ' + M + 'm';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function turniLabel(n) { return n === 1 ? '1 turno' : n + ' turni'; }
  function todayStr() { return S.ymd(new Date()); }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  /* ---------- Sheet ---------- */
  function openSheet(html) {
    $('#sheet-body').innerHTML = '<button class="sheet-close" id="sheet-close" aria-label="Chiudi">✕</button><button class="sheet-grip" id="sheet-grip" aria-label="Chiudi"></button>' + html;
    $('#sheet').classList.remove('hidden');
    $('#sheet-close').onclick = closeSheet;
    $('#sheet-grip').onclick = closeSheet;
    return $('#sheet-body');
  }
  function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheet-body').innerHTML = ''; }
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

  /* ---------- Tema ---------- */
  function applyTheme() {
    const t = S.settings().theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  /* ================= ROUTER ================= */
  let currentTab = 'home';
  let calCursor = new Date();
  let calSelected = null;

  function setTab(tab) {
    if (tab === 'add') { openShiftSheet(null); return; }
    currentTab = tab;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#btn-today').classList.toggle('hidden', tab !== 'calendar');
    render();
  }

  function render() {
    const v = $('#view');
    if (currentTab === 'home') { $('#page-title').textContent = greeting(); v.innerHTML = viewHome(); bindHome(); }
    else if (currentTab === 'calendar') { $('#page-title').textContent = 'Calendario'; v.innerHTML = viewCalendar(); bindCalendar(); }
    else if (currentTab === 'stats') { $('#page-title').textContent = 'Statistiche'; v.innerHTML = viewStats(); }
    else if (currentTab === 'settings') { $('#page-title').textContent = 'Impostazioni'; v.innerHTML = viewSettings(); bindSettings(); }
    v.scrollTop = 0;
  }

  function greeting() {
    const h = new Date().getHours();
    const fn = (window.Cloud && Cloud.firstName && Cloud.firstName()) ? ', ' + Cloud.firstName() : '';
    if (h < 12) return 'Buongiorno' + fn + ' ☀️';
    if (h < 18) return 'Buon pomeriggio' + fn + ' 🍦';
    return 'Buonasera' + fn + ' 🌙';
  }

  /* ================= HOME / DASHBOARD ================= */
  function viewHome() {
    const wk = S.summaryWeek();
    const mo = S.summaryMonth();
    const pay = S.settings().hourlyPay;
    let html = '';

    if (window.Cloud && Cloud.isAdmin && Cloud.isAdmin()) {
      html += `<div class="card" data-go="admin" style="background:linear-gradient(135deg,var(--yellow),var(--yellow-d));color:#3b2f00;cursor:pointer"><div class="shift-top"><b>👑 Pannello admin</b><span>→</span></div><div style="font-size:13px;margin-top:2px">Controlla ore e guadagni dei dipendenti</div></div>`;
    }

    if (!pay) {
      html += `<div class="card" style="border:1.5px dashed var(--blue)">
        <b>👋 Ciao!</b><p class="muted" style="margin:6px 0 12px">Imposta la tua paga oraria per vedere subito quanto guadagni.</p>
        <button class="btn" data-go="pay">Imposta paga oraria</button></div>`;
    }

    html += `<div class="hero">
      <div class="label">GUADAGNO DI ${MONTHS[calNow().getMonth()].toUpperCase()}</div>
      <div class="money">${euro(mo.earnings)}</div>
      <div class="sub">${fmtHours(mo.hours)} lavorate · ${turniLabel(mo.count)}</div>
      <div class="hero-row">
        <div class="box"><div class="n">${euro(wk.earnings)}</div><div class="t">Questa settimana</div></div>
        <div class="box"><div class="n">${fmtHours(wk.hours)}</div><div class="t">Ore settimana</div></div>
      </div>
    </div>`;

    // media oraria reale
    if (mo.hours > 0) {
      html += `<div class="stat-grid">
        <div class="stat"><div class="n">${euro(pay)}<small>/h</small></div><div class="t">Paga oraria</div></div>
        <div class="stat"><div class="n">${fmtHours(mo.hours / (new Date().getDate()) * 7)}</div><div class="t">Media a settimana</div></div>
      </div>`;
    }

    // Prossimi turni
    const today = todayStr();
    const next = S.shifts().filter((s) => s.type === 'shift' && s.date >= today)
      .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))).slice(0, 4);
    html += `<div class="section-title">Prossimi turni</div>`;
    html += next.length ? next.map(shiftRow).join('') : `<div class="empty"><div class="big">📅</div>Nessun turno in programma.<br>Tocca <b>+</b> per aggiungerne uno.</div>`;

    // Ultimi turni fatti (con voto)
    const done = S.shifts().filter((s) => s.date < today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    if (done.length) {
      html += `<div class="section-title">Ultimi turni fatti</div>`;
      html += done.map(shiftRow).join('');
    }
    return html;
  }
  function calNow() { return new Date(); }
  function bindHome() {
    $$('[data-go="pay"]').forEach((b) => b.onclick = () => editHourlyPay());
    $$('[data-go="admin"]').forEach((b) => b.onclick = () => showAdmin());
    bindShiftRows($('#view'));
  }

  function shiftRow(s) {
    const loc = S.getLocation(s.locationId);
    const color = loc ? loc.color : 'var(--blue)';
    const h = S.shiftHours(s);
    const d = S.parseYmd(s.date);
    let dateLabel;
    if (s.type === 'bulk' && s.dateTo && s.dateTo !== s.date) {
      const d2 = S.parseYmd(s.dateTo);
      dateLabel = `${d.getDate()}/${d.getMonth() + 1} – ${d2.getDate()}/${d2.getMonth() + 1}`;
    } else {
      dateLabel = DOW[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
    }
    let timeLabel;
    if (s.type === 'bulk') timeLabel = '📦 ' + (s.label || 'Ore inserite');
    else timeLabel = (s.start || '--:--') + ' → ' + (s.end || '--:--');
    const meta = [];
    meta.push(`<span>${dateLabel}</span>`);
    meta.push(`<span>${fmtHours(h)}</span>`);
    if (loc) meta.push(`<span><i class="dot" style="background:${loc.color}"></i> ${esc(loc.name)}</span>`);
    if (s.rating) meta.push(`<span class="stars-mini">${'★'.repeat(s.rating)}</span>`);
    return `<div class="shift-item" data-shift="${s.id}">
      <div class="shift-bar" style="background:${color}"></div>
      <div class="shift-main">
        <div class="shift-top"><span class="shift-time">${esc(timeLabel)}</span><span class="shift-pay">${euro(S.shiftEarnings(s))}</span></div>
        <div class="shift-meta">${meta.join('')}</div>
      </div>
    </div>`;
  }
  function bindShiftRows(root) {
    $$('.shift-item', root).forEach((el) => el.onclick = () => openShiftSheet(el.dataset.shift));
  }

  /* ================= CALENDARIO ================= */
  function viewCalendar() {
    const y = calCursor.getFullYear(), m = calCursor.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7; // lun=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const monthShifts = S.shiftsInMonth(y, m);
    const byDate = {};
    monthShifts.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
    const mo = S.summaryMonth(calCursor);

    let cells = '';
    for (let i = 0; i < startOffset; i++) {
      const d = new Date(y, m, 1 - (startOffset - i));
      cells += dayCell(d, true, byDate);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells += dayCell(new Date(y, m, day), false, byDate);
    }
    const total = startOffset + daysInMonth;
    for (let i = 0; i < (7 - (total % 7)) % 7; i++) {
      cells += dayCell(new Date(y, m + 1, i + 1), true, byDate);
    }

    return `<div class="cal-head">
      <div class="m">${MONTHS[m]} ${y}</div>
      <div class="cal-nav"><button data-cal="-1">‹</button><button data-cal="1">›</button></div>
    </div>
    <div class="cal-grid">${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
    <div class="card" style="margin-top:16px">
      <div class="shift-top">
        <div><b>${MONTHS[m]}</b><div class="muted" style="font-size:13px">${fmtHours(mo.hours)} · ${turniLabel(mo.count)}</div></div>
        <div class="shift-pay" style="font-size:20px">${euro(mo.earnings)}</div>
      </div>
      ${mo.count ? '<button class="btn secondary" id="cal-pdf" style="margin-top:14px">📄 Esporta il mese in PDF</button>' : ''}
    </div>
    <div id="cal-day-list"></div>`;
  }
  function dayCell(d, other, byDate) {
    const ds = S.ymd(d);
    const list = byDate[ds] || [];
    const isToday = ds === todayStr();
    const dots = list.slice(0, 4).map((s) => {
      const loc = S.getLocation(s.locationId);
      return `<i style="background:${loc ? loc.color : 'var(--blue)'}"></i>`;
    }).join('');
    const totH = list.reduce((a, s) => a + S.shiftHours(s), 0);
    const isSel = ds === calSelected;
    return `<div class="cal-day${other ? ' other' : ''}${isToday ? ' today' : ''}${isSel ? ' selected' : ''}" data-date="${ds}">
      <span class="n">${d.getDate()}</span>
      <div class="dots">${dots}</div>
      ${totH ? `<span class="hrs">${fmtHours(totH)}</span>` : ''}
    </div>`;
  }
  function bindCalendar() {
    $$('[data-cal]').forEach((b) => b.onclick = () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + Number(b.dataset.cal), 1); calSelected = null; render(); });
    $$('.cal-day').forEach((c) => c.onclick = () => {
      calSelected = c.dataset.date;
      $$('.cal-day').forEach((x) => x.classList.toggle('selected', x.dataset.date === calSelected));
      showDay(c.dataset.date);
    });
    const pdf = $('#cal-pdf'); if (pdf) pdf.onclick = exportMonthPdf;
  }
  function showDay(ds) {
    const d = S.parseYmd(ds);
    const list = S.shiftsOnDate(ds);
    const title = DOW_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    const box = $('#cal-day-list');
    box.innerHTML = `<div class="section-title">${title}</div>` +
      (list.length ? list.map(shiftRow).join('') : `<div class="empty" style="padding:20px">Nessun turno.</div>`) +
      `<button class="btn" data-add-date="${ds}" style="margin-top:6px">+ Aggiungi turno il ${d.getDate()}/${d.getMonth() + 1}</button>`;
    bindShiftRows(box);
    $('[data-add-date]', box).onclick = () => openShiftSheet(null, ds);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ================= FORM TURNO / BULK ================= */
  // Selettore orario a quarti d'ora (ora + 00/15/30/45)
  function timeSelectHtml(idBase, val) {
    const [h, m] = (val || '').split(':');
    let mins = ['00', '15', '30', '45'];
    if (m && !mins.includes(m)) mins = [m].concat(mins); // preserva orari "vecchi" non allineati
    const hOpts = ['<option value="">--</option>'].concat(
      Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((hh) => `<option value="${hh}" ${hh === h ? 'selected' : ''}>${hh}</option>`)
    ).join('');
    const mOpts = mins.map((mm) => `<option value="${mm}" ${mm === m ? 'selected' : ''}>${mm}</option>`).join('');
    return `<div class="tsel-row">
      <select id="${idBase}-h" class="tsel">${hOpts}</select>
      <span class="tsel-sep">:</span>
      <select id="${idBase}-m" class="tsel">${mOpts}</select>
    </div>`;
  }

  let formState = null;
  function openShiftSheet(id, presetDate) {
    const existing = id ? S.getShift(id) : null;
    formState = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: null, type: 'shift', date: presetDate || todayStr(),
      start: '', end: '', hours: null, breakMin: 0, label: '',
      locationId: S.locations()[0] ? S.locations()[0].id : null,
      colleagueIds: [], rating: null, note: '',
    };
    renderShiftSheet();
  }

  function renderShiftSheet() {
    const f = formState;
    const isBulk = f.type === 'bulk';
    const locs = S.locations();

    const locChips = locs.length ? locs.map((l) =>
      `<button class="chip loc ${f.locationId === l.id ? 'on' : ''}" data-loc="${l.id}" style="${f.locationId === l.id ? `background:${l.color};border-color:${l.color}` : ''}">
        <i class="dot" style="background:${f.locationId === l.id ? '#fff' : l.color}"></i>${esc(l.name)}</button>`).join('')
      : `<span class="muted" style="font-size:13px">Nessuna sede. Aggiungile nelle Impostazioni.</span>`;

    const single = `
      <div class="field"><label>Data</label><input type="date" id="f-date" value="${f.date}"></div>
      <div class="row-2">
        <div class="field"><label>Inizio</label>${timeSelectHtml('f-start', f.start)}</div>
        <div class="field"><label>Fine</label>${timeSelectHtml('f-end', f.end)}</div>
      </div>
      <div class="field"><label>Pausa non pagata (minuti) — facoltativo</label><input type="number" id="f-break" min="0" step="15" value="${f.breakMin || ''}" placeholder="0"></div>
      <div class="hint" id="f-calc"></div>`;

    const bulk = `
      <div class="row-2">
        <div class="field"><label>Dal</label><input type="date" id="f-date" value="${f.date}"></div>
        <div class="field"><label>Al</label><input type="date" id="f-date-to" value="${f.dateTo || ''}"></div>
      </div>
      <div class="field"><label>Ore totali nel periodo</label><input type="text" id="f-hours" inputmode="decimal" autocomplete="off" value="${f.hours ? String(f.hours).replace('.', ',') : ''}" placeholder="es. 40"></div>
      <div class="field"><label>Etichetta (facoltativo)</label><input type="text" id="f-label" value="${esc(f.label)}" placeholder="es. Prima settimana di maggio"></div>
      <div class="hint">Le ore vengono <b>distribuite equamente</b> sui giorni del periodo, così le vedi spalmate nel calendario. Comodo per inserire in fretta i periodi passati.</div>`;

    openSheet(`
      <h2>${f.id ? 'Modifica turno' : 'Nuovo turno'}</h2>
      <div class="seg">
        <button data-type="shift" class="${!isBulk ? 'active' : ''}">🕐 Turno singolo</button>
        <button data-type="bulk" class="${isBulk ? 'active' : ''}">📦 Ore totali</button>
      </div>
      ${isBulk ? bulk : single}
      <div class="field"><label>Sede</label><div class="chips" id="f-locs">${locChips}</div></div>
      <div class="field"><label>Voto turno (facoltativo)</label>
        <div class="stars" id="f-stars">${[1, 2, 3, 4, 5].map((n) => `<span class="s ${f.rating >= n ? 'on' : ''}" data-star="${n}">★</span>`).join('')}</div>
      </div>
      <div class="field"><label>Note (facoltativo)</label><textarea id="f-note" placeholder="Com'è andata? Cosa ricordare…">${esc(f.note)}</textarea></div>
      <button class="btn" id="f-save">Salva turno</button>
      ${f.id ? '<button class="btn danger" id="f-del">Elimina turno</button>' : ''}
    `);
    bindShiftSheet();
    updateCalc();
  }

  function readForm() {
    const f = formState;
    f.date = $('#f-date').value || todayStr();
    if (f.type === 'shift') {
      const sh = $('#f-start-h').value, sm = $('#f-start-m').value;
      const eh = $('#f-end-h').value, em = $('#f-end-m').value;
      f.start = sh ? sh + ':' + (sm || '00') : '';
      f.end = eh ? eh + ':' + (em || '00') : '';
      f.breakMin = Number($('#f-break').value) || 0; f.hours = null; f.dateTo = null;
    } else {
      f.hours = Number(String($('#f-hours').value).replace(',', '.')) || 0; f.label = $('#f-label').value.trim();
      const dt = $('#f-date-to'); f.dateTo = dt && dt.value ? dt.value : null;
      f.start = null; f.end = null;
    }
    const note = $('#f-note'); if (note) f.note = note.value.trim();
  }

  function updateCalc() {
    if (formState.type !== 'shift') return;
    readForm();
    const el = $('#f-calc'); if (!el) return;
    const h = S.shiftHours(formState);
    el.innerHTML = h > 0 ? `Durata: <b>${fmtHours(h)}</b> · Guadagno stimato: <b style="color:var(--green)">${euro(S.shiftEarnings(formState))}</b>` : '';
  }

  function bindShiftSheet() {
    $$('[data-type]').forEach((b) => b.onclick = () => { readForm(); formState.type = b.dataset.type; renderShiftSheet(); });
    $$('#f-locs [data-loc]').forEach((b) => b.onclick = () => { formState.locationId = (formState.locationId === b.dataset.loc) ? null : b.dataset.loc; renderShiftSheet(); });
    $$('#f-stars [data-star]').forEach((b) => b.onclick = () => {
      const n = Number(b.dataset.star);
      formState.rating = (formState.rating === n) ? null : n;
      $$('#f-stars .s').forEach((s) => s.classList.toggle('on', Number(s.dataset.star) <= (formState.rating || 0)));
    });
    ['f-start-h', 'f-start-m', 'f-end-h', 'f-end-m'].forEach((id) => { const el = $('#' + id); if (el) el.onchange = updateCalc; });
    const br = $('#f-break'); if (br) br.oninput = updateCalc;
    $('#f-save').onclick = saveForm;
    const del = $('#f-del'); if (del) del.onclick = () => {
      if (confirm('Eliminare questo turno?')) { S.deleteShift(formState.id); closeSheet(); toast('Turno eliminato'); render(); }
    };
  }

  function daysBetweenInclusive(a, b) {
    return Math.round((S.parseYmd(b) - S.parseYmd(a)) / 86400000) + 1;
  }
  function saveForm() {
    readForm();
    const f = formState;
    if (f.type === 'shift') {
      if (!f.start || !f.end) { toast('Inserisci inizio e fine'); return; }
    } else if (!f.hours || f.hours <= 0) { toast('Inserisci le ore totali'); return; }

    // Ore totali su un intervallo → distribuisci equamente sui giorni (un record per giorno)
    if (f.type === 'bulk' && !f.id && f.dateTo && f.dateTo !== f.date) {
      if (f.dateTo < f.date) { toast('La data "Al" deve venire dopo "Dal"'); return; }
      const days = daysBetweenInclusive(f.date, f.dateTo);
      const totalMin = Math.round(f.hours * 60);
      const base = Math.floor(totalMin / days);
      const rem = totalMin - base * days; // i primi "rem" giorni ricevono 1 minuto in più
      const cur = S.parseYmd(f.date);
      for (let i = 0; i < days; i++) {
        const mins = base + (i < rem ? 1 : 0);
        S.upsertShift({
          type: 'bulk', date: S.ymd(cur), dateTo: null, hours: mins / 60,
          label: f.label, locationId: f.locationId, colleagueIds: f.colleagueIds.slice(),
          rating: f.rating, note: f.note,
        });
        cur.setDate(cur.getDate() + 1);
      }
      closeSheet();
      toast(`${fmtHours(f.hours)} distribuite su ${days} giorni ✓`);
      render();
      return;
    }

    S.upsertShift(f);
    closeSheet();
    toast(f.id ? 'Turno aggiornato' : 'Turno salvato ✓');
    render();
  }

  /* ================= STATISTICHE ================= */
  let statsRange = 'month'; // month | all
  function viewStats() {
    const now = new Date();
    let from, to, label;
    if (statsRange === 'month') { from = S.startOfMonth(now); to = S.endOfMonth(now); label = MONTHS[now.getMonth()]; }
    else { from = null; to = null; label = 'Sempre'; }
    const sum = from ? S.summarize(from, to) : totalAll();
    const byLoc = S.hoursByLocation(from, to);

    let html = `<div class="seg">
      <button data-range="month" class="${statsRange === 'month' ? 'active' : ''}">Questo mese</button>
      <button data-range="all" class="${statsRange === 'all' ? 'active' : ''}">Da sempre</button>
    </div>`;

    html += `<div class="stat-grid">
      <div class="stat"><div class="n">${fmtHours(sum.hours)}</div><div class="t">Ore totali · ${label}</div></div>
      <div class="stat"><div class="n">${euro(sum.earnings)}</div><div class="t">Guadagno</div></div>
      <div class="stat"><div class="n">${sum.count}</div><div class="t">Turni</div></div>
      <div class="stat"><div class="n">${fmtHours(sum.count ? sum.hours / sum.count : 0)}</div><div class="t">Durata media</div></div>
    </div>`;

    // Per sede
    const locKeys = Object.keys(byLoc);
    if (locKeys.length) {
      const maxH = Math.max(...locKeys.map((k) => byLoc[k].hours));
      html += `<div class="section-title">Ore per sede</div><div class="card">`;
      locKeys.sort((a, b) => byLoc[b].hours - byLoc[a].hours).forEach((k) => {
        const loc = S.getLocation(k);
        const name = loc ? loc.name : 'Senza sede';
        const color = loc ? loc.color : 'var(--muted)';
        const o = byLoc[k];
        html += `<div style="margin-bottom:12px">
          <div class="shift-top"><span><i class="dot" style="background:${color}"></i> <b>${esc(name)}</b></span><span class="muted">${fmtHours(o.hours)} · ${euro(o.earnings)}</span></div>
          <div class="bar"><i style="width:${maxH ? (o.hours / maxH * 100) : 0}%;background:${color}"></i></div>
        </div>`;
      });
      html += `</div>`;
    }

    setTimeout(() => $$('[data-range]').forEach((b) => b.onclick = () => { statsRange = b.dataset.range; render(); }), 0);
    return html;
  }
  function totalAll() {
    let hours = 0, earnings = 0, count = 0;
    S.shifts().forEach((s) => { hours += S.shiftHours(s); earnings += S.shiftEarnings(s); count++; });
    return { hours, earnings, count };
  }

  /* ================= IMPOSTAZIONI ================= */
  function viewSettings() {
    const st = S.settings();
    const locs = S.locations();
    return `
      <div class="section-title">Paga</div>
      <div class="card">
        <div class="list-row" data-act="pay">
          <div class="grow"><div class="title">Paga oraria</div><div class="sub">Usata per calcolare i guadagni</div></div>
          <b style="color:var(--green)">${euro(st.hourlyPay)}/h</b>
        </div>
      </div>

      <div class="section-title">Sedi</div>
      <div class="card" id="loc-list">
        ${locs.map((l) => `<div class="list-row">
          <span class="swatch" style="background:${l.color}" data-loccolor="${l.id}"></span>
          <div class="grow"><div class="title">${esc(l.name)}</div></div>
          <button class="icon-btn" data-locedit="${l.id}">✏️</button>
          <button class="icon-btn" data-locdel="${l.id}">🗑️</button>
        </div>`).join('') || '<div class="muted" style="padding:6px 0">Nessuna sede ancora.</div>'}
        <button class="link-btn" data-act="addloc">+ Aggiungi sede</button>
      </div>

      <div class="section-title">Privacy & tema</div>
      <div class="card">
        <div class="list-row">
          <div class="grow"><div class="title">Blocco con PIN</div><div class="sub">${st.lockEnabled ? 'Attivo' : 'Disattivato'}</div></div>
          <div class="toggle ${st.lockEnabled ? 'on' : ''}" data-act="lock"></div>
        </div>
        <div class="list-row" data-act="theme">
          <div class="grow"><div class="title">Tema</div><div class="sub">${{ auto: 'Automatico', light: 'Chiaro', dark: 'Scuro' }[st.theme]}</div></div>
          <span>${{ auto: '🌓', light: '☀️', dark: '🌙' }[st.theme]}</span>
        </div>
      </div>

      ${cloudSectionHtml()}

      <div class="section-title">Backup</div>
      <div class="card">
        <div class="list-row" data-act="export"><div class="grow"><div class="title">Salva backup</div><div class="sub">Esporta tutti i dati in un file</div></div><span>⬇️</span></div>
        <div class="list-row" data-act="import"><div class="grow"><div class="title">Ripristina backup</div><div class="sub">Importa da un file salvato</div></div><span>⬆️</span></div>
      </div>
      <p class="muted" style="text-align:center;font-size:12px;margin:20px 0 0">Turni Gelateria${cloudFooter()}</p>
    `;
  }

  function cloudSectionHtml() {
    if (!(window.Cloud && Cloud.active())) return '';
    const ps = pushState();
    let notif;
    if (ps === 'on') notif = `<div class="list-row"><div class="grow"><div class="title">Notifiche di fine turno</div><div class="sub">Attive · ti avviso quando finisce il turno</div></div><div class="toggle on" data-act="push-off"></div></div>
      <div class="list-row" data-act="push-test"><div class="grow"><div class="title">Invia una notifica di prova</div><div class="sub">Per controllare che arrivino</div></div><span>🔔</span></div>`;
    else if (ps === 'denied') notif = `<div class="list-row"><div class="grow"><div class="title">Notifiche</div><div class="sub">Bloccate: attivale dalle impostazioni del telefono per quest'app</div></div><span>🔕</span></div>`;
    else if (ps === 'unsupported') notif = `<div class="list-row"><div class="grow"><div class="title">Notifiche</div><div class="sub">Su iPhone: installa l'app sulla Home per riceverle</div></div><span>📲</span></div>`;
    else notif = `<div class="list-row"><div class="grow"><div class="title">Notifiche di fine turno</div><div class="sub">Attivale per essere avvisata</div></div><div class="toggle" data-act="push-on"></div></div>`;
    const hasName = !!Cloud.name();
    const adminRow = (Cloud.isAdmin && Cloud.isAdmin()) ? `<div class="list-row" data-act="admin"><div class="grow"><div class="title">Pannello admin 👑</div><div class="sub">Controlla ore e guadagni dei dipendenti</div></div><span>→</span></div>` : '';
    const inner = `<div class="list-row" data-act="edit-name"><div class="grow"><div class="title">${hasName ? esc(Cloud.name()) : 'Aggiungi nome e cognome'}</div><div class="sub">${esc(Cloud.email() || '')}</div></div><span>${hasName ? '✏️' : '⚠️'}</span></div>
      ${adminRow}
      ${notif}
      <div class="list-row" data-act="change-pass"><div class="grow"><div class="title">Cambia password</div></div><span>🔑</span></div>
      <div class="list-row" data-act="cloud-logout"><div class="grow"><div class="title">Esci</div><div class="sub">Torni alla schermata di accesso</div></div><span>🚪</span></div>`;
    return `<div class="section-title">Account e notifiche</div><div class="card">${inner}</div>`;
  }
  function cloudFooter() {
    return (window.Cloud && Cloud.active()) ? ' · sincronizzata sul cloud ☁️' : '';
  }

  function bindSettings() {
    const act = (name, fn) => $$(`[data-act="${name}"]`).forEach((el) => el.onclick = fn);
    act('pay', editHourlyPay);
    act('addloc', () => editLocation(null));
    act('export', exportBackup);
    act('import', importBackup);
    act('lock', toggleLock);
    act('theme', cycleTheme);
    act('edit-name', editNameFlow);
    act('admin', showAdmin);
    act('change-pass', changePasswordFlow);
    act('cloud-logout', () => { if (confirm('Vuoi uscire? Tornerai alla schermata di accesso. I dati restano salvati sul cloud.')) { Cloud.logout(); showAuth(); } });
    act('push-on', enablePush);
    act('push-off', disablePush);
    act('push-test', sendTestPush);
    $$('[data-locedit]').forEach((b) => b.onclick = () => editLocation(b.dataset.locedit));
    $$('[data-loccolor]').forEach((b) => b.onclick = () => editLocation(b.dataset.loccolor));
    $$('[data-locdel]').forEach((b) => b.onclick = () => {
      const l = S.getLocation(b.dataset.locdel);
      if (confirm(`Eliminare la sede "${l.name}"? I turni resteranno senza sede.`)) { S.deleteLocation(l.id); render(); }
    });
  }

  function editHourlyPay() {
    openSheet(`<h2>Paga oraria</h2><p class="sub">Quanto guadagni all'ora, al lordo o netto — decidi tu.</p>
      <div class="field"><label>Euro all'ora</label><input type="text" id="pay" value="${S.settings().hourlyPay ? String(S.settings().hourlyPay).replace('.', ',') : ''}" placeholder="es. 8,50" inputmode="decimal" autocomplete="off"></div>
      <button class="btn" id="pay-save">Salva</button>`);
    const inp = $('#pay'); inp.focus();
    $('#pay-save').onclick = () => {
      const v = Number(String(inp.value).replace(',', '.')) || 0;
      S.updateSettings({ hourlyPay: v }); closeSheet(); toast('Paga salvata ✓'); render();
    };
  }

  function editLocation(id) {
    const l = id ? S.getLocation(id) : null;
    const palette = S.PALETTE;
    const cur = l ? l.color : palette[S.locations().length % palette.length];
    openSheet(`<h2>${l ? 'Modifica sede' : 'Nuova sede'}</h2>
      <div class="field"><label>Nome sede</label><input type="text" id="loc-name" value="${l ? esc(l.name) : ''}" placeholder="es. Gelateria Centro"></div>
      <div class="field"><label>Colore nel calendario</label>
        <div class="chips" id="loc-colors">${palette.map((c) => `<button class="swatch" data-color="${c}" style="background:${c};width:40px;height:40px;${c === cur ? 'outline:3px solid var(--blue);outline-offset:2px' : ''}"></button>`).join('')}</div>
      </div>
      <button class="btn" id="loc-save">Salva</button>
      ${l ? '<button class="btn danger" id="loc-del">Elimina sede</button>' : ''}`);
    let color = cur;
    $$('#loc-colors [data-color]').forEach((b) => b.onclick = () => {
      color = b.dataset.color;
      $$('#loc-colors .swatch').forEach((s) => s.style.outline = s.dataset.color === color ? '3px solid var(--blue)' : 'none');
    });
    $('#loc-name').focus();
    $('#loc-save').onclick = () => {
      const name = $('#loc-name').value.trim(); if (!name) { toast('Inserisci il nome'); return; }
      if (l) S.updateLocation(l.id, { name, color }); else S.addLocation(name, color);
      closeSheet(); render();
    };
    if (l) $('#loc-del').onclick = () => { if (confirm('Eliminare la sede?')) { S.deleteLocation(l.id); closeSheet(); render(); } };
  }

  function editColleague(id) {
    const c = id ? S.getColleague(id) : null;
    openSheet(`<h2>${c ? 'Modifica collega' : 'Nuovo collega'}</h2>
      <div class="field"><label>Nome</label><input type="text" id="col-name" value="${c ? esc(c.name) : ''}" placeholder="es. Giulia"></div>
      <button class="btn" id="col-save">Salva</button>`);
    $('#col-name').focus();
    $('#col-save').onclick = () => {
      const name = $('#col-name').value.trim(); if (!name) { toast('Inserisci il nome'); return; }
      if (c) S.updateColleague(c.id, { name }); else S.addColleague(name);
      closeSheet(); render();
    };
  }

  function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(S.settings().theme) + 1) % 3];
    S.updateSettings({ theme: next }); applyTheme(); render();
  }

  /* ---------- Lock / PIN ---------- */
  function toggleLock() {
    if (S.settings().lockEnabled) {
      if (confirm('Disattivare il blocco con PIN?')) { S.clearPin(); render(); }
    } else {
      setupPin();
    }
  }
  function setupPin() {
    let first = '';
    openSheet(`<h2>Imposta un PIN</h2><p class="sub">Serve per aprire l'app. Scegli 4 cifre.</p>
      <div class="field"><label>Nuovo PIN (4 cifre)</label><input type="password" id="pin1" inputmode="numeric" maxlength="4" pattern="[0-9]*" placeholder="••••"></div>
      <div class="field"><label>Ripeti PIN</label><input type="password" id="pin2" inputmode="numeric" maxlength="4" placeholder="••••"></div>
      <button class="btn" id="pin-save">Attiva blocco</button>`);
    $('#pin1').focus();
    $('#pin-save').onclick = async () => {
      const a = $('#pin1').value, b = $('#pin2').value;
      if (!/^\d{4}$/.test(a)) { toast('Il PIN deve avere 4 cifre'); return; }
      if (a !== b) { toast('I due PIN non coincidono'); return; }
      await S.setPin(a); closeSheet(); toast('Blocco attivato 🔒'); render();
    };
  }

  // Schermata di sblocco
  let pinBuffer = '';
  function showLock() {
    $('#app').classList.add('hidden');
    const lock = $('#lock'); lock.classList.remove('hidden');
    pinBuffer = '';
    renderPinPad();
    tryBiometric();
  }
  function renderPinPad() {
    const dots = $('#pin-dots');
    dots.innerHTML = [0, 1, 2, 3].map((i) => `<i class="${i < pinBuffer.length ? 'on' : ''}"></i>`).join('');
    const pad = $('#pin-pad');
    if (!pad.dataset.built) {
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];
      pad.innerHTML = keys.map((k) => {
        if (k === 'bio') return `<button class="blank" data-k="bio">😊</button>`;
        if (k === 'del') return `<button data-k="del">⌫</button>`;
        return `<button data-k="${k}">${k}</button>`;
      }).join('');
      pad.dataset.built = '1';
      $$('#pin-pad button').forEach((b) => b.onclick = () => onPinKey(b.dataset.k));
    }
  }
  async function onPinKey(k) {
    if (k === 'del') { pinBuffer = pinBuffer.slice(0, -1); renderPinPad(); return; }
    if (k === 'bio') { tryBiometric(); return; }
    if (pinBuffer.length >= 4) return;
    pinBuffer += k; renderPinPad();
    if (pinBuffer.length === 4) {
      const ok = await S.verifyPin(pinBuffer);
      if (ok) unlock();
      else { $('#lock-msg').textContent = 'PIN errato, riprova'; pinBuffer = ''; setTimeout(renderPinPad, 250); navigator.vibrate && navigator.vibrate(80); }
    }
  }
  function unlock() { $('#lock').classList.add('hidden'); $('#app').classList.remove('hidden'); }
  async function tryBiometric() { /* opzionale: Face ID/impronta via WebAuthn — abilitato in futuro */ }

  /* ---------- Download helper ---------- */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Backup ---------- */
  function exportBackup() {
    download('turni-backup-' + todayStr() + '.json', S.exportData(), 'application/json');
    toast('Backup scaricato ✓');
  }
  function importBackup() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const file = inp.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          if (!confirm('Ripristinare sostituirà i dati attuali. Continuare?')) return;
          S.importData(reader.result, false);
          applyTheme(); toast('Backup ripristinato ✓'); render();
        } catch (e) { alert('File non valido: ' + e.message); }
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  /* ---------- Notifiche push ---------- */
  const VAPID_PUBLIC = 'BA33YfzuTPUrnGxSGX4sdkHECx6o5jpOOZS8gLxty9Sw_3-M5-O0S1toUBkoNJlLrlkVh-uOsDtzvShHHUF2rNo';
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function urlB64ToUint8(base64) {
    const pad = '='.repeat((4 - base64.length % 4) % 4);
    const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(Array.prototype.map.call(raw, (c) => c.charCodeAt(0)));
  }
  async function enablePush() {
    if (!(window.Cloud && Cloud.active())) { toast('Prima collega il cloud e accedi'); return; }
    if (!pushSupported()) { toast('Notifiche non supportate qui. Su iPhone installa l\'app sulla Home.'); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Permesso notifiche negato'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) });
      await Cloud.saveSubscription(sub);
      toast('Notifiche attivate ✓'); render();
    } catch (e) { toast('Errore notifiche: ' + e.message); console.warn(e); }
  }
  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { try { await Cloud.deleteSubscription(sub.endpoint); } catch (e) {} await sub.unsubscribe(); }
      toast('Notifiche disattivate'); render();
    } catch (e) { toast('Errore: ' + e.message); }
  }
  async function sendTestPush() {
    try {
      toast('Invio…');
      const r = await Cloud.invokeFunction('send-reminders', { test: true });
      if (r.ok) toast('Prova inviata 🔔 (arriva tra pochi secondi)');
      else toast('Errore prova: ' + (await r.text()).slice(0, 80));
    } catch (e) { toast('Errore: ' + e.message); }
  }
  function pushState() {
    if (!pushSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'granted') return 'on';
    return 'off';
  }

  /* ---------- Cloud: sincronizzazione ---------- */
  async function syncFromCloud() {
    if (!(window.Cloud && Cloud.active())) return;
    // Il cloud è l'unica fonte di verità: carico SOLO i dati dell'utente corrente.
    // (Niente auto-migrazione dei dati locali: in multi-utente rischierebbe di mischiare dati tra account.)
    const data = await Cloud.pullAll();
    S.replaceFromCloud(data);
    applyTheme();
    render();
  }

  /* ---------- Schermata di accesso (email + password) ---------- */
  let authMode = 'login'; // 'login' | 'signup'
  function showAuth() {
    $('#app').classList.add('hidden');
    $('#lock').classList.add('hidden');
    $('#auth').classList.remove('hidden');
    renderAuth();
  }
  function renderAuth() {
    const login = authMode === 'login';
    $('#auth').innerHTML = `
      <div class="auth-logo"><div class="ico">🍦</div><h1>Turni Gelateria</h1></div>
      <div class="auth-card">
        <div class="seg">
          <button data-am="login" class="${login ? 'active' : ''}">Accedi</button>
          <button data-am="signup" class="${!login ? 'active' : ''}">Registrati</button>
        </div>
        ${login ? `
          <div class="field"><label>Email</label><input type="email" id="a-email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="nome@email.com"></div>
          <div class="field"><label>Password</label><input type="password" id="a-pass" autocomplete="current-password" placeholder="La tua password"></div>
          <button class="btn" id="a-go">Accedi</button>
        ` : `
          <div class="row-2">
            <div class="field"><label>Nome</label><input type="text" id="a-first" autocapitalize="words" placeholder="Nome"></div>
            <div class="field"><label>Cognome</label><input type="text" id="a-last" autocapitalize="words" placeholder="Cognome"></div>
          </div>
          <div class="field"><label>Email</label><input type="email" id="a-email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="nome@email.com"></div>
          <div class="field"><label>Password</label><input type="password" id="a-pass" autocomplete="new-password" placeholder="Almeno 6 caratteri"></div>
          <button class="btn" id="a-go">Crea account</button>
        `}
        <div class="auth-err" id="a-err"></div>
      </div>`;
    $$('#auth [data-am]').forEach((b) => b.onclick = () => { authMode = b.dataset.am; renderAuth(); });
    $('#a-go').onclick = login ? doLogin : doSignup;
    const pass = $('#a-pass'); if (pass) pass.onkeydown = (e) => { if (e.key === 'Enter') $('#a-go').click(); };
  }
  function authErr(m) { const e = $('#a-err'); if (e) e.textContent = m || ''; }
  async function doLogin() {
    const mail = $('#a-email').value.trim(), pass = $('#a-pass').value;
    if (!/.+@.+\..+/.test(mail)) { authErr('Email non valida'); return; }
    if (!pass) { authErr('Inserisci la password'); return; }
    const btn = $('#a-go'); btn.textContent = 'Accesso…'; btn.disabled = true; authErr('');
    try { await Cloud.signInPassword(mail, pass); await afterAuth(); }
    catch (e) { authErr(e.message); btn.textContent = 'Accedi'; btn.disabled = false; }
  }
  async function doSignup() {
    const first = $('#a-first').value.trim(), last = $('#a-last').value.trim();
    const mail = $('#a-email').value.trim(), pass = $('#a-pass').value;
    if (!first || !last) { authErr('Inserisci nome e cognome'); return; }
    if (!/.+@.+\..+/.test(mail)) { authErr('Email non valida'); return; }
    if (pass.length < 6) { authErr('Password troppo corta (minimo 6)'); return; }
    const btn = $('#a-go'); btn.textContent = 'Creazione…'; btn.disabled = true; authErr('');
    try { await Cloud.signUp(mail, pass, first, last); await afterAuth(); }
    catch (e) { authErr(e.message); btn.textContent = 'Crea account'; btn.disabled = false; }
  }
  async function afterAuth() {
    $('#auth').classList.add('hidden');
    $('#app').classList.remove('hidden');
    try { await Cloud.checkAdmin(); } catch (e) {}
    try { await syncFromCloud(); } catch (e) { console.warn(e); }
    render();
    toast('Ciao' + (Cloud.firstName() ? ', ' + Cloud.firstName() : '') + '! 🍦');
    if (!Cloud.name()) setTimeout(editNameFlow, 600);
  }

  function editNameFlow() {
    const cur = (Cloud.name() || '').split(' ');
    const first = cur[0] || '', last = cur.slice(1).join(' ') || '';
    openSheet(`<h2>Nome e cognome</h2><p class="sub">Così l'app ti saluta e (in futuro) l'admin vede chi sei.</p>
      <div class="row-2">
        <div class="field"><label>Nome</label><input type="text" id="pn-first" autocapitalize="words" value="${esc(first)}" placeholder="Nome"></div>
        <div class="field"><label>Cognome</label><input type="text" id="pn-last" autocapitalize="words" value="${esc(last)}" placeholder="Cognome"></div>
      </div>
      <button class="btn" id="pn-save">Salva</button>`);
    $('#pn-first').focus();
    $('#pn-save').onclick = async () => {
      const f = $('#pn-first').value.trim(), l = $('#pn-last').value.trim();
      if (!f || !l) { toast('Inserisci nome e cognome'); return; }
      const btn = $('#pn-save'); btn.textContent = 'Salvo…'; btn.disabled = true;
      try { await Cloud.updateName(f, l); closeSheet(); toast('Profilo aggiornato ✓'); render(); }
      catch (e) { toast('Errore: ' + e.message); btn.textContent = 'Salva'; btn.disabled = false; }
    };
  }

  function changePasswordFlow() {
    openSheet(`<h2>Cambia password</h2><p class="sub">Scegli una nuova password (almeno 6 caratteri).</p>
      <div class="field"><label>Nuova password</label><input type="password" id="np1" autocomplete="new-password"></div>
      <div class="field"><label>Ripeti password</label><input type="password" id="np2" autocomplete="new-password"></div>
      <button class="btn" id="np-save">Salva</button>`);
    $('#np1').focus();
    $('#np-save').onclick = async () => {
      const a = $('#np1').value, b = $('#np2').value;
      if (a.length < 6) { toast('Password troppo corta'); return; }
      if (a !== b) { toast('Le due password non coincidono'); return; }
      const btn = $('#np-save'); btn.textContent = 'Salvo…'; btn.disabled = true;
      try { await Cloud.changePassword(a); closeSheet(); toast('Password aggiornata ✓'); }
      catch (e) { toast('Errore: ' + e.message); btn.textContent = 'Salva'; btn.disabled = false; }
    };
  }

  /* ---------- Export PDF del mese ---------- */
  // Costruisce il PDF di un mese. locName(id)->nome sede. Ritorna il documento jsPDF.
  function buildMonthPdf(opts) {
    const { jsPDF } = window.jspdf;
    const money = (n) => (n || 0).toFixed(2).replace('.', ',') + ' €';
    const shifts = opts.shifts.slice().sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    const pay = opts.pay || 0;
    const locName = opts.locName || (() => null);
    let totH = 0; shifts.forEach((s) => { totH += S.shiftHours(s); });
    const totE = totH * pay;
    const byLoc = {};
    shifts.forEach((s) => { const k = s.locationId || '_'; if (!byLoc[k]) byLoc[k] = 0; byLoc[k] += S.shiftHours(s); });

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 40; let yy = M + 4;
    const col = { day: M, when: M + 66, loc: M + 180, hoursR: W - M - 72, payR: W - M };
    const trunc = (t, w) => { const p = doc.splitTextToSize(String(t || ''), w); return p[0] || ''; };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(15, 23, 42);
    doc.text('Turni Gelateria', M, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(22, 163, 74);
    doc.text(money(totE), W - M, yy, { align: 'right' });
    yy += 20;
    if (opts.authorName) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
      doc.text(opts.authorName, M, yy); yy += 16;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(100, 116, 139);
    doc.text(opts.monthLabel, M, yy);
    doc.setFontSize(10); doc.text(fmtHours(totH) + ' · ' + turniLabel(shifts.length), W - M, yy, { align: 'right' });
    yy += 14;
    doc.setDrawColor(37, 99, 235); doc.setLineWidth(2); doc.line(M, yy, W - M, yy); yy += 18;

    function tableHeader() {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(37, 99, 235);
      doc.text('GIORNO', col.day, yy); doc.text('ORARIO', col.when, yy); doc.text('SEDE', col.loc, yy);
      doc.text('ORE', col.hoursR, yy, { align: 'right' }); doc.text('GUADAGNO', col.payR, yy, { align: 'right' });
      yy += 6; doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, yy, W - M, yy); yy += 13;
    }
    tableHeader();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (!shifts.length) { doc.setTextColor(120); doc.text('Nessun turno questo mese.', M, yy); yy += 16; }
    shifts.forEach((s) => {
      if (yy > H - 80) { doc.addPage(); yy = M; tableHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); }
      const d = S.parseYmd(s.date);
      const dn = DOW[(d.getDay() + 6) % 7] + ' ' + d.getDate();
      const when = s.type === 'bulk' ? (s.label || 'Ore') : ((s.start || '--') + '-' + (s.end || '--'));
      const rate = s.rating ? ' (' + s.rating + '/5)' : '';
      const nm = locName(s.locationId);
      doc.setTextColor(15, 23, 42);
      doc.text(dn, col.day, yy);
      doc.text(trunc(when + rate, 108), col.when, yy);
      doc.text(trunc(nm || '-', 255), col.loc, yy);
      doc.text(fmtHours(S.shiftHours(s)), col.hoursR, yy, { align: 'right' });
      doc.setTextColor(22, 163, 74);
      doc.text(money(S.shiftHours(s) * pay), col.payR, yy, { align: 'right' });
      yy += 7; doc.setDrawColor(238); doc.setLineWidth(0.5); doc.line(M, yy, W - M, yy); yy += 11;
    });
    yy += 3; doc.setDrawColor(37, 99, 235); doc.setLineWidth(1); doc.line(M, yy, W - M, yy); yy += 15;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text('TOTALE', col.day, yy);
    doc.text(fmtHours(totH), col.hoursR, yy, { align: 'right' });
    doc.text(money(totE), col.payR, yy, { align: 'right' });
    yy += 26;

    const locKeys = Object.keys(byLoc);
    if (locKeys.length) {
      if (yy > H - 100) { doc.addPage(); yy = M; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42);
      doc.text('Riepilogo per sede', M, yy); yy += 16;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      locKeys.sort((a, b) => byLoc[b] - byLoc[a]).forEach((k) => {
        doc.setTextColor(15, 23, 42); doc.text(trunc(k === '_' ? 'Senza sede' : (locName(k) || 'Senza sede'), 300), M, yy);
        doc.text(fmtHours(byLoc[k]), col.hoursR, yy, { align: 'right' });
        doc.setTextColor(22, 163, 74); doc.text(money(byLoc[k] * pay), col.payR, yy, { align: 'right' });
        yy += 15;
      });
    }
    const now = new Date();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(150);
    doc.text('Paga oraria: ' + money(pay) + '/h  ·  Generato il ' + now.getDate() + '/' + (now.getMonth() + 1) + '/' + now.getFullYear(), M, H - M);
    return doc;
  }

  async function sharePdf(doc, fname, title) {
    const blob = doc.output('blob');
    const file = new File([blob], fname, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); } catch (e) { /* annullato */ }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('PDF salvato ✓');
    }
  }

  async function exportMonthPdf() {
    if (!(window.jspdf && window.jspdf.jsPDF)) { toast('Libreria PDF non caricata'); return; }
    const y = calCursor.getFullYear(), m = calCursor.getMonth();
    const doc = buildMonthPdf({
      authorName: (window.Cloud && Cloud.name && Cloud.name()) || '',
      monthLabel: MONTHS[m] + ' ' + y,
      shifts: S.shiftsInMonth(y, m),
      pay: S.settings().hourlyPay,
      locName: (id) => { const l = S.getLocation(id); return l ? l.name : null; },
    });
    await sharePdf(doc, 'turni-' + MONTHS[m].toLowerCase() + '-' + y + '.pdf', 'Turni ' + MONTHS[m] + ' ' + y);
  }

  /* ================= PANNELLO ADMIN ================= */
  let adminCursor = new Date();
  let adminMonth = null;

  function showAdmin() {
    if (!(window.Cloud && Cloud.isAdmin && Cloud.isAdmin())) { toast('Solo per l\'amministratore'); return; }
    $('#admin').classList.remove('hidden');
    renderAdmin();
  }
  function closeAdmin() { $('#admin').classList.add('hidden'); $('#admin').innerHTML = ''; }

  async function renderAdmin() {
    const el = $('#admin');
    const y = adminCursor.getFullYear(), m = adminCursor.getMonth();
    el.innerHTML = `<div class="admin-top"><button class="admin-back" id="adm-back">←</button><h1>Pannello admin 👑</h1></div>
      <div class="cal-head" style="margin-top:2px"><div class="m">${MONTHS[m]} ${y}</div>
        <div class="cal-nav"><button data-am="-1">‹</button><button data-am="1">›</button></div></div>
      <div id="adm-body"><div class="empty"><div class="big">⏳</div>Carico i dati…</div></div>`;
    $('#adm-back').onclick = closeAdmin;
    $$('#admin [data-am]').forEach((b) => b.onclick = () => { adminCursor = new Date(y, m + Number(b.dataset.am), 1); renderAdmin(); });

    let profiles, data;
    try {
      const from = S.ymd(S.startOfMonth(adminCursor)), to = S.ymd(S.endOfMonth(adminCursor));
      [profiles, data] = await Promise.all([Cloud.adminListProfiles(), Cloud.adminMonthData(from, to)]);
    } catch (e) { $('#adm-body').innerHTML = `<div class="empty">Errore: ${esc(e.message)}</div>`; return; }

    const perUser = {};
    profiles.forEach((p) => { perUser[p.id] = { p, hours: 0, earnings: 0, shifts: [] }; });
    data.shifts.forEach((s) => {
      if (!perUser[s.userId]) perUser[s.userId] = { p: { id: s.userId, full_name: '', email: '(senza profilo)' }, hours: 0, earnings: 0, shifts: [] };
      const h = S.shiftHours(s); const pay = data.payByUser[s.userId] || 0;
      perUser[s.userId].hours += h; perUser[s.userId].earnings += h * pay; perUser[s.userId].shifts.push(s);
    });
    const users = Object.values(perUser).sort((a, b) => b.earnings - a.earnings || b.hours - a.hours);
    let teamH = 0, teamE = 0; users.forEach((u) => { teamH += u.hours; teamE += u.earnings; });
    adminMonth = { perUser, locations: data.locations, payByUser: data.payByUser };

    let html = `<div class="hero" style="margin-top:4px">
      <div class="label">TOTALE TEAM · ${MONTHS[m].toUpperCase()}</div>
      <div class="money">${euro(teamE)}</div>
      <div class="sub">${fmtHours(teamH)} · ${users.filter((u) => u.shifts.length).length} dipendenti attivi</div>
    </div>`;
    html += `<div class="section-title">Dipendenti (${users.length})</div>`;
    users.forEach((u) => {
      const nm = (u.p.full_name && u.p.full_name.trim()) || u.p.email || '(sconosciuto)';
      const initials = nm.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
      html += `<div class="emp-card" data-emp="${u.p.id}">
        <div class="emp-avatar">${esc(initials)}</div>
        <div class="emp-main"><div class="emp-name">${esc(nm)}${u.p.is_admin ? '<span class="badge-admin">ADMIN</span>' : ''}</div><div class="emp-sub">${esc(u.p.email || '')}</div></div>
        <div class="emp-fig"><div class="e">${euro(u.earnings)}</div><div class="h">${fmtHours(u.hours)}</div></div>
      </div>`;
    });
    if (!users.length) html += `<div class="empty">Nessun dipendente registrato.</div>`;
    $('#adm-body').innerHTML = html;
    $$('#admin .emp-card').forEach((c) => c.onclick = () => showEmployee(c.dataset.emp));
  }

  function showEmployee(uid) {
    if (!adminMonth || !adminMonth.perUser[uid]) return;
    const u = adminMonth.perUser[uid];
    const y = adminCursor.getFullYear(), m = adminCursor.getMonth();
    const nm = (u.p.full_name && u.p.full_name.trim()) || u.p.email || '(sconosciuto)';
    const pay = adminMonth.payByUser[uid] || 0;
    const locName = (id) => (adminMonth.locations[id] || {}).name;
    const shifts = u.shifts.slice().sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    const rows = shifts.map((s) => {
      const d = S.parseYmd(s.date); const dn = DOW[(d.getDay() + 6) % 7] + ' ' + d.getDate();
      const when = s.type === 'bulk' ? ('📦 ' + (s.label || 'Ore')) : ((s.start || '--') + ' → ' + (s.end || '--'));
      const ln = locName(s.locationId); const lc = (adminMonth.locations[s.locationId] || {}).color || 'var(--blue)';
      return `<div class="shift-item"><div class="shift-bar" style="background:${lc}"></div>
        <div class="shift-main"><div class="shift-top"><span class="shift-time">${esc(when)}</span><span class="shift-pay">${euro(S.shiftHours(s) * pay)}</span></div>
        <div class="shift-meta"><span>${dn}</span><span>${fmtHours(S.shiftHours(s))}</span>${ln ? `<span>${esc(ln)}</span>` : ''}${s.rating ? `<span class="stars-mini">${'★'.repeat(s.rating)}</span>` : ''}</div></div></div>`;
    }).join('') || '<div class="empty" style="padding:20px">Nessun turno questo mese.</div>';

    openSheet(`<h2>${esc(nm)}</h2><p class="sub">${MONTHS[m]} ${y} · paga ${euro(pay)}/h</p>
      <div class="stat-grid">
        <div class="stat"><div class="n">${fmtHours(u.hours)}</div><div class="t">Ore lavorate</div></div>
        <div class="stat"><div class="n">${euro(u.earnings)}</div><div class="t">Da pagare</div></div>
      </div>
      <div class="section-title">Turni del mese</div>${rows}
      <button class="btn" id="emp-pdf" style="margin-top:14px">📄 Esporta PDF</button>`);
    $('#emp-pdf').onclick = async () => {
      if (!(window.jspdf && window.jspdf.jsPDF)) { toast('Libreria PDF non caricata'); return; }
      const doc = buildMonthPdf({ authorName: nm, monthLabel: MONTHS[m] + ' ' + y, shifts, pay, locName });
      await sharePdf(doc, 'turni-' + nm.toLowerCase().replace(/\s+/g, '-') + '-' + MONTHS[m].toLowerCase() + '-' + y + '.pdf', 'Turni ' + nm);
    };
  }

  function openFinishFromParam() {
    const finishId = new URLSearchParams(location.search).get('finish');
    if (finishId && S.getShift(finishId)) openShiftSheet(finishId);
  }

  /* ================= AVVIO ================= */
  async function boot() {
    applyTheme();
    $$('.tab').forEach((b) => b.onclick = () => setTab(b.dataset.tab));
    $('#btn-today').onclick = () => { calCursor = new Date(); render(); };
    setTab('home');
    $$('.tab')[0].classList.add('active');

    if ('serviceWorker' in navigator) {
      // Aggiornamento automatico: quando una nuova versione prende il controllo, ricarica
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !hadController) return; reloading = true; location.reload();
      });
      navigator.serviceWorker.register('sw.js').then((reg) => { try { reg.update(); } catch (e) {} }).catch((e) => console.warn('SW non registrato', e));
      // La notifica cliccata apre direttamente il turno (anche ad app già aperta)
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'finish' && e.data.id) { const s = S.getShift(e.data.id); if (s) openShiftSheet(e.data.id); }
      });
    }

    if (window.Cloud && Cloud.loggedIn()) {
      // Già loggata: mostra l'app (o il PIN) e sincronizza
      if (S.settings().lockEnabled) showLock(); else $('#app').classList.remove('hidden');
      try { await Cloud.loadUser(); await Cloud.checkAdmin(); await syncFromCloud(); } catch (e) { console.warn('sync iniziale', e); }
      openFinishFromParam();
      if (Cloud.active() && !Cloud.name()) setTimeout(editNameFlow, 600);
    } else {
      // Non loggata: schermata di accesso
      showAuth();
    }
  }
  boot();
})();
