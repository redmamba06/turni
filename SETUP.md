# Attivare il cloud + notifiche — guida

Segui una volta sola. Non devi incollarmi chiavi segrete in chat: le pubbliche le metti dentro l'app.

## 1) Crea il progetto Supabase
1. Vai su **supabase.com** → accedi → **New project**.
2. Nome: `turni`. Scegli una **password del database** (salvala) e una **region** europea (es. *West EU (Ireland)* o *Frankfurt*).
3. Aspetta ~2 minuti che il progetto sia pronto.

## 2) Crea le tabelle
1. Nel progetto, menu a sinistra → **SQL Editor** → **New query**.
2. Apri il file `sql/schema.sql` di questo repo, copia **tutto**, incolla e premi **Run**.
3. Deve dire "Success". (Crea tabelle turni/sedi/colleghi/impostazioni + sicurezza.)

## 3) Attiva il login via email
1. Menu → **Authentication** → **Providers** → **Email**: lascia attivo. (Per fare prima, puoi **disattivare "Confirm email"**: così il link entra subito.)
2. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://redmamba06.github.io/turni/`
   - **Redirect URLs** → *Add URL*: `https://redmamba06.github.io/turni/**`
   - (quando passiamo a Vercel aggiungeremo anche l'indirizzo Vercel con `/**`)

## 4) Collega l'app
1. Menu → **Project Settings** → **API**. Ti servono due valori **pubblici** (sono sicuri da usare nell'app):
   - **Project URL** (es. `https://abcd1234.supabase.co`)
   - **anon public** key (una stringa lunga che inizia con `eyJ...`)
2. Apri l'app → **Impostazioni → Cloud e notifiche → Configura** e incolla i due valori.
3. Fai **Accedi**, metti la tua email, ti arriva un link: toccalo dal telefono e sei dentro.

## 5) Notifiche (Fase 2 — te la preparo dopo)
Quando il cloud funziona, aggiungiamo:
- il permesso notifiche nell'app,
- un secondo script SQL per il "motore" che manda l'avviso a fine turno,
- le chiavi push (VAPID) che genero io: la pubblica va nell'app, la privata la incolli tu tra i *Secrets* di Supabase.

---
Note oneste:
- Su **iPhone** le notifiche arrivano solo con l'app **installata sulla Home** e col **permesso** dato (iOS 16.4+).
- I dati sono protetti: ogni utente vede solo i propri (Row Level Security).
