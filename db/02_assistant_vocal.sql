-- ============================================================================
-- ADBARTH — ASSISTANT VOCAL TÉLÉPHONIQUE (table d'état des appels)
-- À COLLER UNE SEULE FOIS dans Supabase :
--   Dashboard → SQL Editor → New query → coller tout → Run.
--   (ou : bash ~/apply_sql_adbart.sh sbp_TON_TOKEN ~/adbart/db/02_assistant_vocal.sql)
-- ----------------------------------------------------------------------------
-- Twilio appelle la fonction Edge à CHAQUE phrase du client (sans état). On
-- garde donc l'historique de la conversation par appel (clé = CallSid Twilio),
-- ce qui sert aussi de JOURNAL des appels vocaux.
--
-- Sécurité : SEUL le service_role (la fonction Edge) y accède. Ni l'anonyme ni
-- le restaurateur connecté ne lisent cette table directement (données d'appel).
-- Idempotent : peut être rejoué sans risque.
-- ============================================================================

create table if not exists public.vocal_appels (
  call_sid   text primary key,                         -- identifiant d'appel Twilio
  compte_id  uuid references public.comptes(id),       -- restaurant concerné
  resto      text,
  history    jsonb   not null default '[]'::jsonb,      -- conversation (rôles user/assistant)
  total      numeric,
  statut     text    default 'en_cours',                -- en_cours | commande | termine
  cree_le    timestamptz not null default now(),
  maj_le     timestamptz not null default now()
);

create index if not exists vocal_appels_compte_idx on public.vocal_appels(compte_id);
create index if not exists vocal_appels_cree_idx   on public.vocal_appels(cree_le desc);

-- RLS : on verrouille tout accès direct. La fonction Edge utilise la clé
-- service_role, qui CONTOURNE le RLS — elle continue donc de fonctionner.
alter table public.vocal_appels enable row level security;

revoke all on public.vocal_appels from anon, authenticated;

-- (Aucune policy pour anon/authenticated → aucun accès direct. service_role passe outre.)

-- ----------------------------------------------------------------------------
-- VÉRIFICATIONS
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='vocal_appels';   -- rowsecurity = true
--   select count(*) from public.vocal_appels;                 -- 0 au départ
-- ============================================================================
