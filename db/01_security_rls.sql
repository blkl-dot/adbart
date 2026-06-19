-- ============================================================================
-- ADBARTH — VERROUILLAGE SÉCURITÉ (RLS Supabase)
-- À COLLER UNE SEULE FOIS dans Supabase :
--   Dashboard → SQL Editor → New query → coller tout → Run.
--   (ou : bash ~/apply_sql_adbart.sh sbp_TON_TOKEN ~/adbart/db/01_security_rls.sql)
-- ----------------------------------------------------------------------------
-- AVANT : RLS désactivé -> avec la clé publique visible dans le code, n'importe
--         qui pouvait lire/modifier/supprimer TOUS les comptes restaurateurs
--         (email, téléphone, abonnement) et TOUTES les commandes de tout le monde.
-- APRÈS : - service_role (côté serveur / Edge Functions) garde tous les droits ;
--         - un visiteur NON connecté (anon) ne voit AUCUN compte ;
--         - il peut seulement LIRE la vitrine publique d'un restaurant
--           (nom, menu, catégories, réglages chatbot) via la vue dédiée, et
--           DÉPOSER une commande/réservation pour ce restaurant — sans jamais
--           pouvoir lire les commandes des autres ;
--         - un restaurateur connecté ne voit/édite QUE son propre compte et
--           QUE ses propres commandes.
-- Idempotent : peut être rejoué sans risque.
-- Schéma visé :
--   comptes(id uuid = auth.uid(), nom, email, telephone, resto, plan, prix,
--           abonnement_fin, config jsonb, menu jsonb, cats jsonb)
--   commandes(id, compte_id uuid -> comptes.id, ref, type, client, items jsonb,
--             total, note, status, cree_le)
-- ============================================================================

-- 1) ACTIVER RLS + COUPER L'ACCÈS ANONYME DIRECT AUX TABLES SENSIBLES ---------
alter table public.comptes   enable row level security;
alter table public.commandes enable row level security;

-- L'anonyme n'a AUCUN droit direct sur ces tables (il passera par la vue + une
-- policy d'insertion contrôlée plus bas).
revoke all on public.comptes   from anon;
revoke all on public.commandes from anon;

-- Le restaurateur connecté a les droits applicatifs (filtrés par les policies).
grant select, insert, update, delete on public.comptes   to authenticated;
grant select, insert, update, delete on public.commandes to authenticated;

-- 2) ON REPART DE POLICIES PROPRES (idempotent) ------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('comptes','commandes')
  loop
    execute format('drop policy if exists %I on public.%I;', r.policyname, r.tablename);
  end loop;
end $$;

-- 3) POLICIES : COMPTES ------------------------------------------------------
-- Chaque restaurateur ne voit et n'édite QUE sa propre ligne (id = auth.uid()).
create policy comptes_select_own on public.comptes for select to authenticated
  using (id = auth.uid());
create policy comptes_insert_own on public.comptes for insert to authenticated
  with check (id = auth.uid());
create policy comptes_update_own on public.comptes for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- (pas de DELETE : un restaurateur ne supprime pas son compte depuis le front)

-- 4) POLICIES : COMMANDES ----------------------------------------------------
-- Le restaurateur gère uniquement les commandes de SON restaurant.
create policy commandes_select_own on public.commandes for select to authenticated
  using (compte_id = auth.uid());
create policy commandes_update_own on public.commandes for update to authenticated
  using (compte_id = auth.uid()) with check (compte_id = auth.uid());
create policy commandes_delete_own on public.commandes for delete to authenticated
  using (compte_id = auth.uid());
-- Un restaurateur peut aussi créer une commande de test depuis son espace.
create policy commandes_insert_own on public.commandes for insert to authenticated
  with check (compte_id = auth.uid());

-- Le CLIENT FINAL (anonyme, via le lien SMS) peut DÉPOSER une commande, mais
-- seulement vers un restaurant qui existe réellement — et jamais en lire aucune.
grant insert on public.commandes to anon;
create policy commandes_public_insert on public.commandes for insert to anon
  with check (exists (select 1 from public.comptes c where c.id = compte_id));

-- 5) VITRINE PUBLIQUE : VUE EXPOSANT UNIQUEMENT LE STRICT NÉCESSAIRE ----------
-- Le chatbot client (anonyme) lit le restaurant via cette vue, jamais via la
-- table comptes. On n'expose donc PAS l'email ni le plan ni l'abonnement :
-- seulement le nom, le menu, les catégories et les réglages d'affichage.
-- La vue appartient au propriétaire (postgres, BYPASSRLS) et n'utilise pas
-- security_invoker : l'anonyme lit la vue sans jamais toucher la table protégée.
create or replace view public.public_restaurants
with (security_invoker = false) as
  select
    id,
    resto,
    menu,
    cats,
    -- config nettoyée : on retire toute clé potentiellement sensible
    (coalesce(config, '{}'::jsonb)
      - 'email' - 'prix' - 'plan' - 'abonnement_fin' - 'sms') as config
  from public.comptes
  where coalesce((config->>'active')::boolean, true) = true;   -- restaurant non « en pause »

revoke all on public.public_restaurants from anon, authenticated;
grant select on public.public_restaurants to anon, authenticated;

-- 6) VÉRIFICATIONS RAPIDES (à lire dans la sortie) ---------------------------
-- a) RLS bien activé :
--    select tablename, rowsecurity from pg_tables
--    where schemaname='public' and tablename in ('comptes','commandes');
--    -> rowsecurity = true partout.
-- b) Policies en place :
--    select tablename, policyname, cmd, roles from pg_policies
--    where schemaname='public' and tablename in ('comptes','commandes')
--    order by tablename, policyname;
-- c) La vitrine publique ne renvoie aucune donnée sensible :
--    select * from public.public_restaurants limit 1;   -- doit montrer id/resto/menu/cats/config nettoyée
-- ============================================================================
