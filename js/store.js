/* store.js — livello dati e calcoli. Tutto in localStorage, nessun server. */
(function (global) {
  'use strict';

  const KEY = 'turni:v1';

  const DEFAULT = {
    settings: {
      hourlyPay: 0,
      currency: '€',
      weekStartsMonday: true,
      theme: 'auto',           // auto | light | dark
      lockEnabled: false,
      pinHash: null,
      pinSalt: null,
    },
    locations: [],   // {id, name, color}
    colleagues: [],  // {id, name}
    shifts: [],      // vedi normalizza()
  };

  const PALETTE = ['#2563EB', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];

  let state = load();

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULT);
      const parsed = JSON.parse(raw);
      return {
        settings: Object.assign(clone(DEFAULT.settings), parsed.settings || {}),
        locations: parsed.locations || [],
        colleagues: parsed.colleagues || [],
        shifts: (parsed.shifts || []).map(normalizeShift),
      };
    } catch (e) {
      console.error('Errore lettura dati', e);
      return clone(DEFAULT);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('Attenzione: impossibile salvare i dati (memoria piena?).');
      console.error(e);
    }
  }

  function normalizeShift(s) {
    return {
      id: s.id || uid(),
      type: s.type === 'bulk' ? 'bulk' : 'shift',
      date: s.date,                       // YYYY-MM-DD (per bulk = data di riferimento/inizio periodo)
      start: s.start || null,             // HH:MM
      end: s.end || null,                 // HH:MM
      hours: typeof s.hours === 'number' ? s.hours : null, // per bulk o override
      breakMin: s.breakMin || 0,          // minuti di pausa da scalare (turno singolo)
      label: s.label || '',               // etichetta bulk (es. "Settimana 12-18 maggio")
      locationId: s.locationId || null,
      colleagueIds: Array.isArray(s.colleagueIds) ? s.colleagueIds : [],
      rating: s.rating || null,           // 1..5
      note: s.note || '',
      createdAt: s.createdAt || Date.now(),
      updatedAt: s.updatedAt || Date.now(),
    };
  }

  /* ---------- Date helpers ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

  function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay(); // 0=dom
    const mondayBased = state.settings.weekStartsMonday;
    const diff = mondayBased ? (day === 0 ? -6 : 1 - day) : -day;
    x.setDate(x.getDate() + diff);
    return x;
  }
  function endOfWeek(d) { const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); return e; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

  /* ---------- Calcoli ---------- */
  // Ore di un turno. Gestisce turni oltre mezzanotte e pausa.
  function shiftHours(s) {
    if (s.type === 'bulk') return Math.max(0, s.hours || 0);
    if (typeof s.hours === 'number' && s.hours > 0 && (!s.start || !s.end)) return s.hours;
    if (!s.start || !s.end) return 0;
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60; // oltre mezzanotte
    mins -= (s.breakMin || 0);
    return Math.max(0, mins / 60);
  }

  function shiftEarnings(s) { return shiftHours(s) * (state.settings.hourlyPay || 0); }

  // Somma su un intervallo [from,to] inclusi (Date).
  function summarize(from, to) {
    const f = ymd(from), t = ymd(to);
    let hours = 0, earnings = 0, count = 0;
    state.shifts.forEach((s) => {
      if (s.date >= f && s.date <= t) {
        hours += shiftHours(s);
        earnings += shiftEarnings(s);
        count++;
      }
    });
    return { hours, earnings, count };
  }

  function summaryWeek(ref) { return summarize(startOfWeek(ref || new Date()), endOfWeek(ref || new Date())); }
  function summaryMonth(ref) { return summarize(startOfMonth(ref || new Date()), endOfMonth(ref || new Date())); }

  // Ore per collega (opzionale: intervallo)
  function hoursByColleague(from, to) {
    const f = from ? ymd(from) : null, t = to ? ymd(to) : null;
    const map = {};
    state.shifts.forEach((s) => {
      if (f && (s.date < f || s.date > t)) return;
      const h = shiftHours(s);
      s.colleagueIds.forEach((cid) => { map[cid] = (map[cid] || 0) + h; });
    });
    return map;
  }

  function hoursByLocation(from, to) {
    const f = from ? ymd(from) : null, t = to ? ymd(to) : null;
    const map = {};
    state.shifts.forEach((s) => {
      if (f && (s.date < f || s.date > t)) return;
      const k = s.locationId || '_none';
      if (!map[k]) map[k] = { hours: 0, earnings: 0 };
      map[k].hours += shiftHours(s);
      map[k].earnings += shiftEarnings(s);
    });
    return map;
  }

  function shiftsOnDate(dateStr) {
    return state.shifts.filter((s) => s.date === dateStr)
      .sort((a, b) => (a.start || '') < (b.start || '') ? -1 : 1);
  }
  function shiftsInMonth(year, month0) {
    const from = ymd(new Date(year, month0, 1));
    const to = ymd(new Date(year, month0 + 1, 0));
    return state.shifts.filter((s) => s.date >= from && s.date <= to);
  }

  /* ---------- Cloud (opzionale) ---------- */
  // Ritorna il modulo Cloud solo se configurato + login fatto, altrimenti null.
  function C() { return (global.Cloud && global.Cloud.active && global.Cloud.active()) ? global.Cloud : null; }
  function cloudTry(fn) { const c = C(); if (c) { try { const p = fn(c); if (p && p.catch) p.catch((e) => console.warn('cloud sync', e)); } catch (e) { console.warn('cloud sync', e); } } }
  // Sostituisce lo stato con i dati arrivati dal cloud (NON ri-sincronizza).
  function replaceFromCloud(data) {
    if (data.settings) Object.assign(state.settings, data.settings);
    if (data.locations) state.locations = data.locations;
    if (data.colleagues) state.colleagues = data.colleagues;
    if (data.shifts) state.shifts = data.shifts.map(normalizeShift);
    save();
  }

  /* ---------- CRUD ---------- */
  function upsertShift(data) {
    const s = normalizeShift(data);
    s.updatedAt = Date.now();
    const i = state.shifts.findIndex((x) => x.id === s.id);
    if (i >= 0) state.shifts[i] = s; else state.shifts.push(s);
    save();
    cloudTry((c) => c.pushShift(s));
    return s;
  }
  function deleteShift(id) { state.shifts = state.shifts.filter((s) => s.id !== id); save(); cloudTry((c) => c.removeShift(id)); }
  function getShift(id) { return state.shifts.find((s) => s.id === id) || null; }

  function addLocation(name, color) {
    const loc = { id: uid(), name: name.trim(), color: color || PALETTE[state.locations.length % PALETTE.length] };
    state.locations.push(loc); save(); cloudTry((c) => c.pushLocation(loc)); return loc;
  }
  function updateLocation(id, patch) {
    const l = state.locations.find((x) => x.id === id); if (l) Object.assign(l, patch); save();
    if (l) cloudTry((c) => c.pushLocation(l));
  }
  function deleteLocation(id) {
    state.locations = state.locations.filter((l) => l.id !== id);
    const touched = state.shifts.filter((s) => s.locationId === id);
    touched.forEach((s) => { s.locationId = null; });
    save();
    cloudTry((c) => c.removeLocation(id));
    touched.forEach((s) => cloudTry((c) => c.pushShift(s)));
  }
  function getLocation(id) { return state.locations.find((l) => l.id === id) || null; }

  function addColleague(name) {
    const c = { id: uid(), name: name.trim() }; state.colleagues.push(c); save(); cloudTry((cl) => cl.pushColleague(c)); return c;
  }
  function updateColleague(id, patch) { const c = state.colleagues.find((x) => x.id === id); if (c) Object.assign(c, patch); save(); if (c) cloudTry((cl) => cl.pushColleague(c)); }
  function deleteColleague(id) {
    state.colleagues = state.colleagues.filter((c) => c.id !== id);
    const touched = state.shifts.filter((s) => s.colleagueIds.includes(id));
    touched.forEach((s) => { s.colleagueIds = s.colleagueIds.filter((x) => x !== id); });
    save();
    cloudTry((c) => c.removeColleague(id));
    touched.forEach((s) => cloudTry((c) => c.pushShift(s)));
  }
  function getColleague(id) { return state.colleagues.find((c) => c.id === id) || null; }

  function updateSettings(patch) {
    Object.assign(state.settings, patch); save();
    // Sincronizza solo i campi rilevanti (non il PIN, che resta locale)
    if ('hourlyPay' in patch || 'weekStartsMonday' in patch || 'theme' in patch) cloudTry((c) => c.pushSettings(state.settings));
  }

  /* ---------- PIN (hash locale) ---------- */
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function setPin(pin) {
    const salt = uid() + uid();
    const hash = await sha256(salt + ':' + pin);
    updateSettings({ lockEnabled: true, pinHash: hash, pinSalt: salt });
  }
  async function verifyPin(pin) {
    if (!state.settings.pinHash) return true;
    const hash = await sha256(state.settings.pinSalt + ':' + pin);
    return hash === state.settings.pinHash;
  }
  function clearPin() { updateSettings({ lockEnabled: false, pinHash: null, pinSalt: null }); }

  /* ---------- Backup / ripristino ---------- */
  function exportData() {
    return JSON.stringify({ app: 'turni-gelateria', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
  }
  function importData(json, merge) {
    const parsed = JSON.parse(json);
    const d = parsed.data || parsed;
    if (!d || !Array.isArray(d.shifts)) throw new Error('File non valido');
    if (merge) {
      const existingIds = new Set(state.shifts.map((s) => s.id));
      d.shifts.forEach((s) => { if (!existingIds.has(s.id)) state.shifts.push(normalizeShift(s)); });
      const locIds = new Set(state.locations.map((l) => l.id));
      (d.locations || []).forEach((l) => { if (!locIds.has(l.id)) state.locations.push(l); });
      const colIds = new Set(state.colleagues.map((c) => c.id));
      (d.colleagues || []).forEach((c) => { if (!colIds.has(c.id)) state.colleagues.push(c); });
    } else {
      state = {
        settings: Object.assign(clone(DEFAULT.settings), d.settings || {}),
        locations: d.locations || [],
        colleagues: d.colleagues || [],
        shifts: (d.shifts || []).map(normalizeShift),
      };
    }
    save();
  }

  /* ---------- Export .ics (per Apple/Google Calendar) ---------- */
  function icsEscape(t) { return String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
  function toIcsDate(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-');
    const [hh, mm] = (timeStr || '00:00').split(':');
    return `${y}${m}${d}T${hh}${mm}00`;
  }
  function exportIcs(withAlarm) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Turni Gelateria//IT', 'CALSCALE:GREGORIAN'];
    state.shifts.filter((s) => s.type === 'shift' && s.start && s.end).forEach((s) => {
      const loc = getLocation(s.locationId);
      const cols = s.colleagueIds.map((id) => (getColleague(id) || {}).name).filter(Boolean);
      // gestione fine oltre mezzanotte
      let endDate = s.date;
      const [sh] = s.start.split(':').map(Number);
      const [eh] = s.end.split(':').map(Number);
      if (eh < sh) { const d = parseYmd(s.date); d.setDate(d.getDate() + 1); endDate = ymd(d); }
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + s.id + '@turni');
      lines.push('DTSTART:' + toIcsDate(s.date, s.start));
      lines.push('DTEND:' + toIcsDate(endDate, s.end));
      lines.push('SUMMARY:' + icsEscape('Turno' + (loc ? ' · ' + loc.name : '')));
      const desc = [cols.length ? 'Con: ' + cols.join(', ') : '', s.note].filter(Boolean).join('\n');
      if (desc) lines.push('DESCRIPTION:' + icsEscape(desc));
      if (loc) lines.push('LOCATION:' + icsEscape(loc.name));
      if (withAlarm) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Fine turno — segna a che ora hai finito'), 'TRIGGER:PT0M', 'END:VALARM');
      }
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  global.Store = {
    // stato
    get: () => state,
    settings: () => state.settings,
    locations: () => state.locations,
    colleagues: () => state.colleagues,
    shifts: () => state.shifts,
    PALETTE,
    // date
    ymd, parseYmd, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    // calcoli
    shiftHours, shiftEarnings, summarize, summaryWeek, summaryMonth,
    hoursByColleague, hoursByLocation, shiftsOnDate, shiftsInMonth,
    // crud
    upsertShift, deleteShift, getShift,
    addLocation, updateLocation, deleteLocation, getLocation,
    addColleague, updateColleague, deleteColleague, getColleague,
    updateSettings,
    // pin
    setPin, verifyPin, clearPin,
    // backup / calendario
    exportData, importData, exportIcs,
    // cloud
    replaceFromCloud,
  };
})(window);
