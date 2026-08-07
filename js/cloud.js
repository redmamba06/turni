/* cloud.js — sincronizzazione con Supabase via REST (niente SDK).
   Attivo solo se configurato + login fatto; altrimenti l'app resta locale. */
(function (global) {
  'use strict';
  const CFG = 'turni:cloud';   // { url, anon }
  const SESS = 'turni:sess';   // { access_token, refresh_token, expires_at }
  // Configurazione incorporata (la anon key è pubblica per definizione): l'utente non deve incollare nulla.
  const DEFAULT_URL = 'https://bfkdhsazithymcdbxxot.supabase.co';
  const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJma2Roc2F6aXRoeW1jZGJ4eG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwODQ4MzgsImV4cCI6MjA5ODY2MDgzOH0.cpZWPUIxbNOHy4gSQZrDbaZKewXh3IiDU9nyJSFQHY0';
  let cfg = read(CFG);
  if (!cfg || !cfg.url || !cfg.anon) { cfg = { url: DEFAULT_URL, anon: DEFAULT_ANON }; write(CFG, cfg); }
  let sess = read(SESS);
  let me = null;               // { id, email, name }

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'; } catch (e) { return 'Europe/Rome'; } }

  function configured() { return !!(cfg && cfg.url && cfg.anon); }
  function loggedIn() { return !!(sess && sess.access_token); }
  function active() { return configured() && loggedIn(); }
  function email() { return me && me.email; }
  function userId() { return me && me.id; }
  function name() { return me && me.name; }
  function firstName() { return (me && me.name || '').split(' ')[0] || ''; }
  function meFrom(u) {
    const md = (u && u.user_metadata) || {};
    const nm = md.full_name || [md.first_name, md.last_name].filter(Boolean).join(' ') || '';
    return { id: u.id, email: u.email, name: nm };
  }
  function storeSession(d) {
    sess = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
    write(SESS, sess);
    if (d.user) me = meFrom(d.user);
  }
  function setConfig(url, anon) {
    cfg = { url: (url || '').trim().replace(/\/+$/, ''), anon: (anon || '').trim() };
    write(CFG, cfg);
  }
  function clearConfig() { localStorage.removeItem(CFG); cfg = null; logout(); }

  function headers(auth) {
    const o = { apikey: cfg.anon, 'Content-Type': 'application/json' };
    if (auth && sess) o.Authorization = 'Bearer ' + sess.access_token;
    return o;
  }

  /* ---------- Auth email + password ---------- */
  async function signInPassword(mail, password) {
    const r = await fetch(cfg.url + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: headers(false),
      body: JSON.stringify({ email: (mail || '').trim(), password: password }),
    });
    if (!r.ok) { let m = 'Email o password errati'; try { const j = await r.json(); m = j.error_description || j.msg || m; } catch (e) {} throw new Error(m); }
    const d = await r.json();
    storeSession(d);
    if (!me) await loadUser();
    return me;
  }
  async function signUp(mail, password, first, last) {
    const full = [first, last].filter(Boolean).join(' ').trim();
    const r = await fetch(cfg.url + '/auth/v1/signup', {
      method: 'POST', headers: headers(false),
      body: JSON.stringify({ email: (mail || '').trim(), password: password, data: { first_name: first, last_name: last, full_name: full } }),
    });
    if (!r.ok) { let m = 'Registrazione non riuscita'; try { const j = await r.json(); m = j.msg || j.error_description || m; } catch (e) {} throw new Error(m); }
    const d = await r.json();
    // con mailer_autoconfirm la signup restituisce già la sessione
    if (d.access_token) storeSession(d);
    else return signInPassword(mail, password);
    try { await saveProfile(first, last, mail); } catch (e) { console.warn('profilo', e); }
    if (!me) await loadUser();
    return me;
  }
  async function sendRecovery(mail) {
    const r = await fetch(cfg.url + '/auth/v1/recover', { method: 'POST', headers: headers(false), body: JSON.stringify({ email: (mail || '').trim() }) });
    if (!r.ok) { let m = 'Errore invio codice'; try { m = (await r.json()).msg || m; } catch (e) {} throw new Error(m); }
    return true;
  }
  async function verifyRecovery(mail, token) {
    const r = await fetch(cfg.url + '/auth/v1/verify', { method: 'POST', headers: headers(false), body: JSON.stringify({ type: 'recovery', email: (mail || '').trim(), token: (token || '').trim() }) });
    if (!r.ok) { let m = 'Codice non valido'; try { const j = await r.json(); m = j.msg || j.error_description || m; } catch (e) {} throw new Error(m); }
    const d = await r.json(); storeSession(d); if (!me) await loadUser(); return me;
  }
  async function changePassword(newPass) {
    await ensureFresh();
    const rr = await fetch(cfg.url + '/auth/v1/user', { method: 'PUT', headers: headers(true), body: JSON.stringify({ password: newPass }) });
    if (!rr.ok) { let m = 'Impossibile cambiare la password'; try { m = (await rr.json()).msg || m; } catch (e) {} throw new Error(m); }
    return true;
  }
  async function updateName(first, last) {
    await ensureFresh();
    const full = [first, last].filter(Boolean).join(' ').trim();
    const r = await fetch(cfg.url + '/auth/v1/user', { method: 'PUT', headers: headers(true), body: JSON.stringify({ data: { first_name: first, last_name: last, full_name: full } }) });
    if (!r.ok) throw new Error('Impossibile salvare il nome');
    const u = await r.json(); me = meFrom(u);
    try { await saveProfile(first, last, me.email); } catch (e) {}
    return me;
  }
  async function saveProfile(first, last, mail) {
    const full = [first, last].filter(Boolean).join(' ').trim();
    const row = { id: userId(), first_name: first || '', last_name: last || '', full_name: full, email: mail || email() };
    const r = await rest('profiles?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) throw new Error('profilo: ' + await r.text());
  }

  /* ---------- Auth (magic link / OTP — mantenuto) ---------- */
  async function sendMagicLink(mail) {
    const redirect = location.origin + location.pathname;
    const r = await fetch(cfg.url + '/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), {
      method: 'POST', headers: headers(false),
      body: JSON.stringify({ email: (mail || '').trim(), create_user: true }),
    });
    if (!r.ok) { let m = 'Errore invio link'; try { m = (await r.json()).msg || m; } catch (e) {} throw new Error(m); }
    return true;
  }

  // Verifica il codice a 6 cifre ricevuto via email (login senza link)
  async function verifyCode(mail, token) {
    const r = await fetch(cfg.url + '/auth/v1/verify', {
      method: 'POST', headers: headers(false),
      body: JSON.stringify({ type: 'email', email: (mail || '').trim(), token: (token || '').trim() }),
    });
    if (!r.ok) { let m = 'Codice non valido'; try { m = (await r.json()).msg || (await r.json()).error_description || m; } catch (e) {} throw new Error(m); }
    const d = await r.json();
    sess = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
    write(SESS, sess);
    if (d.user) me = meFrom(d.user);
    return me || (await loadUser());
  }

  // Cattura i token dall'URL dopo il click sul link email (#access_token=...)
  function captureRedirect() {
    if (!location.hash || location.hash.indexOf('access_token') < 0) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    const at = p.get('access_token');
    if (!at) return false;
    sess = {
      access_token: at,
      refresh_token: p.get('refresh_token'),
      expires_at: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000,
    };
    write(SESS, sess);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  async function refresh() {
    if (!sess || !sess.refresh_token) return false;
    const r = await fetch(cfg.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: headers(false), body: JSON.stringify({ refresh_token: sess.refresh_token }),
    });
    if (!r.ok) { logout(); return false; }
    const d = await r.json();
    sess = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
    write(SESS, sess);
    if (d.user) me = meFrom(d.user);
    return true;
  }
  async function ensureFresh() {
    if (sess && sess.expires_at && sess.expires_at - Date.now() < 60000) await refresh();
  }
  async function loadUser() {
    if (!loggedIn()) return null;
    await ensureFresh();
    const r = await fetch(cfg.url + '/auth/v1/user', { headers: headers(true) });
    if (r.status === 401) { if (await refresh()) return loadUser(); logout(); return null; }
    if (!r.ok) return null;
    const u = await r.json();
    me = meFrom(u);
    return me;
  }
  function logout() { localStorage.removeItem(SESS); sess = null; me = null; }

  /* ---------- Dati (PostgREST) ---------- */
  async function rest(path, opts) {
    await ensureFresh();
    opts = opts || {};
    opts.headers = Object.assign(headers(true), opts.headers || {});
    let r = await fetch(cfg.url + '/rest/v1/' + path, opts);
    if (r.status === 401 && await refresh()) { opts.headers = Object.assign(headers(true), opts.headers || {}); r = await fetch(cfg.url + '/rest/v1/' + path, opts); }
    return r;
  }
  async function selectAll(table) { const r = await rest(table + '?select=*'); if (!r.ok) throw new Error('load ' + table + ': ' + await r.text()); return r.json(); }
  async function upsert(table, row) {
    const r = await rest(table, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) throw new Error('save ' + table + ': ' + await r.text());
  }
  async function removeRow(table, id) {
    const r = await rest(table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    if (!r.ok) throw new Error('del ' + table + ': ' + await r.text());
  }

  /* ---------- Mappatura modello app <-> DB ---------- */
  function shiftToDb(s) {
    return {
      id: s.id, user_id: userId(), type: s.type, date: s.date, date_to: s.dateTo || null,
      start: s.start, end: s.end, hours: s.hours, break_min: s.breakMin || 0,
      label: s.label || '', location_id: s.locationId, colleague_ids: s.colleagueIds || [],
      rating: s.rating, note: s.note || '', updated_at: new Date().toISOString(),
    };
  }
  function shiftFromDb(d) {
    return {
      id: d.id, type: d.type, date: d.date, dateTo: d.date_to || null, start: d.start, end: d.end,
      hours: d.hours != null ? Number(d.hours) : null, breakMin: d.break_min || 0,
      label: d.label || '', locationId: d.location_id, colleagueIds: d.colleague_ids || [],
      rating: d.rating || null, note: d.note || '',
      createdAt: d.created_at ? Date.parse(d.created_at) : Date.now(),
      updatedAt: d.updated_at ? Date.parse(d.updated_at) : Date.now(),
    };
  }
  function settingsToDb(st) {
    return { user_id: userId(), hourly_pay: st.hourlyPay || 0, week_starts_monday: !!st.weekStartsMonday, theme: st.theme || 'auto', tz: tz(), updated_at: new Date().toISOString() };
  }

  /* ---------- API di alto livello usata da store/app ---------- */
  async function pullAll() {
    // Filtra sempre sul proprio user_id: la vista personale mostra SOLO i propri dati
    // (un admin, con le policy di lettura estese, altrimenti vedrebbe tutti qui).
    const uid = userId();
    const mine = (t) => rest(t + '?select=*&user_id=eq.' + uid).then((r) => { if (!r.ok) throw new Error('load ' + t); return r.json(); });
    const [locs, cols, shifts, setRows] = await Promise.all([
      mine('locations'), mine('colleagues'), mine('shifts'), mine('settings'),
    ]);
    const s = setRows[0];
    return {
      locations: locs.map((l) => ({ id: l.id, name: l.name, color: l.color })),
      colleagues: cols.map((c) => ({ id: c.id, name: c.name })),
      shifts: shifts.map(shiftFromDb),
      settings: s ? { hourlyPay: Number(s.hourly_pay) || 0, weekStartsMonday: s.week_starts_monday, theme: s.theme || 'auto' } : null,
    };
  }
  // Manda tutti i dati locali al cloud (prima migrazione)
  async function migrateFromLocal(state) {
    for (const l of state.locations) await upsert('locations', { id: l.id, user_id: userId(), name: l.name, color: l.color });
    for (const c of state.colleagues) await upsert('colleagues', { id: c.id, user_id: userId(), name: c.name });
    for (const s of state.shifts) await upsert('shifts', shiftToDb(s));
    await upsert('settings', settingsToDb(state.settings));
  }

  // push/remove per singola entità (chiamate da store dopo ogni modifica)
  const pushShift = (s) => upsert('shifts', shiftToDb(s));
  const removeShift = (id) => removeRow('shifts', id);
  const pushLocation = (l) => upsert('locations', { id: l.id, user_id: userId(), name: l.name, color: l.color });
  const removeLocation = (id) => removeRow('locations', id);
  const pushColleague = (c) => upsert('colleagues', { id: c.id, user_id: userId(), name: c.name });
  const removeColleague = (id) => removeRow('colleagues', id);
  const pushSettings = (st) => upsert('settings', settingsToDb(st));

  // Iscrizioni push
  async function saveSubscription(sub) {
    const j = sub.toJSON ? sub.toJSON() : sub;
    const row = { user_id: userId(), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, tz: tz() };
    const r = await rest('push_subscriptions?on_conflict=user_id,endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) throw new Error('sub save: ' + await r.text());
  }
  async function deleteSubscription(endpoint) {
    const r = await rest('push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), { method: 'DELETE' });
    if (!r.ok) throw new Error('sub del: ' + await r.text());
  }
  // Invoca una Edge Function (con il token dell'utente)
  async function invokeFunction(slug, body) {
    await ensureFresh();
    return fetch(cfg.url + '/functions/v1/' + slug, { method: 'POST', headers: headers(true), body: JSON.stringify(body || {}) });
  }

  /* ---------- Admin ---------- */
  function isAdmin() { return !!(me && me.isAdmin); }
  function isSuper() { return !!(me && me.isSuper); }
  async function checkAdmin() {
    if (!loggedIn() || !userId()) return false;
    try {
      const r = await rest('profiles?id=eq.' + userId() + '&select=is_admin,is_super');
      if (r.ok) { const a = await r.json(); if (me) { me.isAdmin = !!(a[0] && a[0].is_admin); me.isSuper = !!(a[0] && a[0].is_super); } }
    } catch (e) { /* ignora */ }
    return isAdmin();
  }
  async function adminListProfiles() {
    const r = await rest('profiles?select=id,full_name,first_name,last_name,email,is_admin,is_super&order=full_name.asc');
    if (!r.ok) throw new Error('profili: ' + await r.text());
    return r.json();
  }
  // Imposta la paga oraria di un dipendente (solo admin)
  async function adminSetPay(uid, pay) {
    const r = await rest('settings?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: uid, hourly_pay: pay }) });
    if (!r.ok) throw new Error('paga: ' + await r.text());
  }
  // Dati di tutti i dipendenti per un mese (solo admin, grazie alle policy RLS)
  async function adminMonthData(fromYmd, toYmd) {
    const [shiftsR, setR, locR] = await Promise.all([
      rest('shifts?select=*&date=gte.' + fromYmd + '&date=lte.' + toYmd),
      rest('settings?select=user_id,hourly_pay'),
      rest('locations?select=*'),
    ]);
    if (!shiftsR.ok) throw new Error('turni: ' + await shiftsR.text());
    const shifts = (await shiftsR.json()).map((d) => { const o = shiftFromDb(d); o.userId = d.user_id; return o; });
    const payByUser = {}; if (setR.ok) (await setR.json()).forEach((s) => { payByUser[s.user_id] = Number(s.hourly_pay) || 0; });
    const locations = {}; if (locR.ok) (await locR.json()).forEach((l) => { locations[l.id] = { name: l.name, color: l.color }; });
    return { shifts, payByUser, locations };
  }

  global.Cloud = {
    configured, loggedIn, active, email, userId, name, firstName, tz,
    setConfig, clearConfig, sendMagicLink, verifyCode, captureRedirect, loadUser, logout,
    signInPassword, signUp, changePassword, updateName, saveProfile, sendRecovery, verifyRecovery,
    pullAll, migrateFromLocal,
    pushShift, removeShift, pushLocation, removeLocation, pushColleague, removeColleague, pushSettings,
    saveSubscription, deleteSubscription, invokeFunction,
    isAdmin, isSuper, checkAdmin, adminListProfiles, adminMonthData, adminSetPay,
  };
})(window);
