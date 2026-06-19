# AdBarth — Sécurité, conformité & mise en ligne

Mise au niveau de **projet Titanium** : sécurité base de données, guide d'utilisation,
confidentialité et conformité. AdBarth tourne sur **Vercel** (≠ Titanium qui est sur le VPS).

---

## 1. Verrouiller la base de données (RLS Supabase) — **à faire une fois**

Sans ça, la clé publique visible dans le code laisse lire/modifier **tous** les comptes
et **toutes** les commandes. Le fichier `db/01_security_rls.sql` corrige ça :

- visiteur non connecté (anon) → ne voit **aucun** compte ;
- il peut seulement lire la **vitrine publique** d'un restaurant (nom, menu, horaires)
  et **déposer** une commande, sans jamais lire celles des autres ;
- un restaurateur connecté → ne voit/édite **que** son compte et **que** ses commandes.

**Appliquer (2 méthodes au choix) :**

```bash
# A) en une commande (token sur https://supabase.com/dashboard/account/tokens)
bash ~/apply_sql_adbart.sh sbp_TON_TOKEN ~/adbart/db/01_security_rls.sql
```

ou **B)** Supabase → **SQL Editor → New query** → coller tout `db/01_security_rls.sql` → **Run**.

Le script est **idempotent** (rejouable sans risque) et affiche une vérif : `rowsecurity`
doit être `true` sur `comptes` et `commandes`.

> ⚠️ Vérifie d'abord que les noms de colonnes correspondent à ta base
> (`comptes.id = auth.uid()`, `commandes.compte_id`). Ils correspondent au code actuel.

---

## 2. Guide d'utilisation (déjà intégré ✅)

- Bouton **❓ Guide** dans l'en-tête de l'espace admin.
- S'ouvre **tout seul à la première connexion** (mémorisé via `localStorage`).
- 5 étapes : configurer le restaurant → menu → SMS/chatbot → partager le lien → cuisine.

---

## 3. Confidentialité & légal (conformité RGPD)

Pages **Mentions légales / CGV / Confidentialité** accessibles depuis le pied de page,
et **case de consentement** obligatoire à l'inscription.

La politique de confidentialité est complète (rôles responsable/sous-traitant, finalités,
base légale, durées, sécurité RLS, droits, CNIL). **À finaliser avant la prod :**
remplacer dans le code (`LEGAL_DOCS` de `src/App.jsx`) les champs entre crochets :

- `[NOM DE LA SOCIÉTÉ]`, `[FORME JURIDIQUE]`, `[SIREN]`, `[N° TVA]`, `[ADRESSE COMPLÈTE]`
- `[EMAIL]`, `[TÉLÉPHONE]`, `[VILLE]`, `[PRÉNOM NOM]`, `[FONCTION]`

Tant qu'il reste des crochets, un bandeau orange le rappelle en haut de la page concernée.

---

## 4. Mise en ligne (Vercel)

Le projet se déploie automatiquement à chaque `git push` sur `main`
(build : `npm install && npm run build`, sortie `dist/`).

```bash
cd ~/adbart
git add -A && git commit -m "..." && git push
```

**Avant le paiement réel** : remplacer `SUMUP_LINK` / brancher la fonction Edge
`creer-paiement` (Supabase Functions) et le vrai système SMS.
