// Edge Function: send-reminders
// - test:true  -> chiamata dall'utente (JWT): invia una notifica di prova ai suoi dispositivi
// - cron       -> chiamata dallo scheduler (CRON_SECRET): avvisa i turni che stanno finendo
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:federicolagamma@gmail.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const APP_URL = "https://redmamba06.github.io/turni/";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function sendTo(sub: any, payload: unknown): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return true;
  } catch (e: any) {
    const code = e?.statusCode;
    if (code === 404 || code === 410) {
      await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    console.error("push error", code, e?.body || e?.message);
    return false;
  }
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return asUTC - utcMs;
}
function addDay(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}
// UTC ms dell'orario locale (wall clock) HH:MM del giorno dateStr nel fuso tz
function zonedMs(dateStr: string, timeStr: string, tz: string): number {
  const [Y, M, D] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const guess = Date.UTC(Y, M - 1, D, h, mi);
  return guess - tzOffsetMs(guess, tz);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({} as any));
  const auth = req.headers.get("Authorization") || "";

  // --- MODE TEST (utente loggato) ---
  if (body.test) {
    const jwt = auth.replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", u.user.id);
    let sent = 0;
    for (const s of subs || []) {
      if (await sendTo(s, { title: "Turni Gelateria 🍦", body: "Notifica di prova: funziona! 🎉", url: APP_URL })) sent++;
    }
    return json({ ok: true, sent, subs: subs?.length || 0 });
  }

  // --- MODE CRON (scheduler) ---
  if (auth !== `Bearer ${CRON_SECRET}`) return json({ error: "forbidden" }, 403);

  const now = Date.now();
  const { data: shifts } = await admin
    .from("shifts").select("*")
    .eq("type", "shift").is("notified_end_at", null)
    .not("end", "is", null).not("start", "is", null);

  let sent = 0, notified = 0;
  for (const sh of shifts || []) {
    const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", sh.user_id);
    if (!subs || !subs.length) continue;
    const tz = subs[0].tz || "Europe/Rome";
    const endDate = sh.end <= sh.start ? addDay(sh.date) : sh.date; // turno oltre mezzanotte
    const endMs = zonedMs(endDate, sh.end, tz);
    const diffMin = (now - endMs) / 60000;
    // il turno è finito da 0 a 15 minuti fa (il cron gira ~ogni 5 min)
    if (diffMin >= -1 && diffMin <= 15) {
      const payload = {
        title: "Fine turno 🍦",
        body: "Segna a che ora hai finito e dai un voto al turno.",
        url: `${APP_URL}?finish=${sh.id}`,
        tag: `fine-${sh.id}`,
      };
      for (const s of subs) if (await sendTo(s, payload)) sent++;
      await admin.from("shifts").update({ notified_end_at: new Date().toISOString() }).eq("id", sh.id);
      notified++;
    }
  }
  return json({ ok: true, checked: shifts?.length || 0, notified, sent });
});
