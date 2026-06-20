-- ============================================================================
-- ADBARTH — MISE EN PLACE COMPLÈTE D'UN NOUVEAU PROJET SUPABASE
-- ----------------------------------------------------------------------------
-- À faire UNE SEULE FOIS, sur un projet Supabase tout neuf :
--   Dashboard → SQL Editor → New query → coller TOUT ce fichier → Run.
--
-- Ce script crée :
--   • les tables  comptes  et  commandes
--   • la table    vocal_appels  (assistant vocal téléphonique)
--   • le déclencheur qui crée automatiquement la fiche restaurateur à l'inscription
--   • la sécurité (RLS) et la vitrine publique (public_restaurants)
-- Idempotent : peut être rejoué sans risque.
-- ============================================================================

-- 1) TABLES -------------------------------------------------------------------

create table if not exists public.comptes (
  id              uuid primary key references auth.users(id) on delete cascade,
  nom             text,
  email           text,
  telephone       text,
  resto           text,
  plan            text    default 'starter',
  prix            numeric,
  abonnement_fin  timestamptz,
  config          jsonb   default '{}'::jsonb,
  menu            jsonb   default '[]'::jsonb,
  cats            jsonb   default '[]'::jsonb,
  cree_le         timestamptz not null default now()
);

create table if not exists public.commandes (
  id         uuid primary key default gen_random_uuid(),
  compte_id  uuid references public.comptes(id) on delete cascade,
  ref        text,
  type       text,
  client     text,
  items      jsonb   default '[]'::jsonb,
  total      text,
  note       text,
  status     text    default 'en_cours',
  cree_le    timestamptz not null default now()
);
create index if not exists commandes_compte_idx on public.commandes(compte_id);
create index if not exists commandes_cree_idx   on public.commandes(cree_le desc);

create table if not exists public.vocal_appels (
  call_sid   text primary key,
  compte_id  uuid references public.comptes(id) on delete cascade,
  resto      text,
  history    jsonb   not null default '[]'::jsonb,
  total      numeric,
  statut     text    default 'en_cours',
  cree_le    timestamptz not null default now(),
  maj_le     timestamptz not null default now()
);
create index if not exists vocal_appels_compte_idx on public.vocal_appels(compte_id);

-- 2) DÉCLENCHEUR : créer la fiche restaurateur à l'inscription -----------------
-- À l'inscription, le site fait supabase.auth.signUp(...) puis met à jour la
-- fiche comptes. Cette fiche doit donc exister : ce trigger la crée à partir
-- des métadonnées d'inscription (nom, resto, téléphone, plan).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.comptes (id, email, nom, resto, telephone, plan)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nom', ''),
    coalesce(new.raw_user_meta_data->>'resto', ''),
    coalesce(new.raw_user_meta_data->>'telephone', ''),
    coalesce(new.raw_user_meta_data->>'plan', 'starter')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) RLS + DROITS -------------------------------------------------------------
alter table public.comptes      enable row level security;
alter table public.commandes    enable row level security;
alter table public.vocal_appels enable row level security;

revoke all on public.comptes      from anon;
revoke all on public.commandes    from anon;
revoke all on public.vocal_appels from anon, authenticated;

grant select, insert, update, delete on public.comptes   to authenticated;
grant select, insert, update, delete on public.commandes to authenticated;

-- On repart de policies propres (idempotent)
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname='public' and tablename in ('comptes','commandes','vocal_appels')
  loop execute format('drop policy if exists %I on public.%I;', r.policyname, r.tablename); end loop;
end $$;

-- COMPTES : chaque restaurateur ne voit/édite que sa propre fiche
create policy comptes_select_own on public.comptes for select to authenticated using (id = auth.uid());
create policy comptes_insert_own on public.comptes for insert to authenticated with check (id = auth.uid());
create policy comptes_update_own on public.comptes for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- COMMANDES : le restaurateur gère uniquement les commandes de son restaurant
create policy commandes_select_own on public.commandes for select to authenticated using (compte_id = auth.uid());
create policy commandes_update_own on public.commandes for update to authenticated using (compte_id = auth.uid()) with check (compte_id = auth.uid());
create policy commandes_delete_own on public.commandes for delete to authenticated using (compte_id = auth.uid());
create policy commandes_insert_own on public.commandes for insert to authenticated with check (compte_id = auth.uid());

-- Le CLIENT FINAL (anonyme, via le lien) peut DÉPOSER une commande vers un resto existant
grant insert on public.commandes to anon;
create policy commandes_public_insert on public.commandes for insert to anon
  with check (exists (select 1 from public.comptes c where c.id = compte_id));

-- vocal_appels : aucun accès direct (la fonction Edge passe par service_role)

-- 4) VITRINE PUBLIQUE ---------------------------------------------------------
-- Le chatbot/assistant client (anonyme) lit le resto via cette vue, jamais la table.
create or replace view public.public_restaurants
with (security_invoker = false) as
  select id, resto, menu, cats,
         (coalesce(config, '{}'::jsonb) - 'email' - 'prix' - 'plan' - 'abonnement_fin' - 'sms') as config
  from public.comptes
  where coalesce((config->>'active')::boolean, true) = true;

revoke all on public.public_restaurants from anon, authenticated;
grant select on public.public_restaurants to anon, authenticated;

-- 5) REALTIME (écran cuisine en temps réel) ----------------------------------
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.commandes'; exception when others then null; end;
end $$;

-- ============================================================================
-- FINI. Vérifs :
--   select table_name from information_schema.tables where table_schema='public';
--   -> comptes, commandes, vocal_appels, public_restaurants
-- ============================================================================
