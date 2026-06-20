# AdBarth — Paiement des commandes client

Après sa commande dans le chatbot, le client choisit **comment régler** :

- **💳 Payer par carte ICI** — formulaire de carte **intégré au chat** : le client
  saisit sa carte et paie **sans jamais quitter AdBarth**. La commande ne part en
  cuisine **qu'une fois le paiement accepté** (pas de ticket impayé). Le ticket
  affiche « 💳 Payé en ligne par carte ✓ ».
- **🏪 Payer au restaurant** — fonctionne **immédiatement**, sans configuration.
  La commande part en cuisine avec « 🏪 À régler au restaurant » sur le ticket.

Le restaurateur active/désactive le paiement par carte dans son espace :
**Admin → onglet Chatbot → « 💳 Paiement de la commande »**. S'il est désactivé,
le client règle uniquement au restaurant.

---

## Activer l'encaissement réel par carte (SumUp)

Le formulaire de carte est déjà en place côté client. Pour que l'argent soit
réellement encaissé, il faut brancher la fonction serveur sur votre compte SumUp.

1. **Déployer la fonction Edge** `creer-paiement-commande` (fournie dans
   `supabase/functions/creer-paiement-commande/index.ts`). Elle gère deux modes :
   - `mode:"card"` (défaut) — **paiement direct sur AdBarth** : elle crée un
     checkout SumUp puis le règle côté serveur avec la carte → renvoie
     `{ status:"PAID" }`. En cas de 3-D Secure, elle renvoie `{ url }` et le client
     est redirigé le temps de l'authentification, puis revient.
   - `mode:"checkout"` — repli : renvoie `{ url }`, la page de paiement hébergée SumUp.

2. **Déployer + secrets** :
   ```bash
   supabase functions deploy creer-paiement-commande --no-verify-jwt
   supabase secrets set SUMUP_API_KEY=sup_sk_xxx SUMUP_MERCHANT_CODE=MXXXXX APP_URL=https://votre-site.vercel.app
   ```

3. **Tester** : commande dans le chatbot → « 💳 Payer par carte ici » → saisir une
   carte de test SumUp → le paiement est validé et la commande tombe en cuisine,
   le tout sans quitter le site.

> Tant que les secrets SumUp ne sont pas posés, le bouton « Payer » renvoie un
> message clair et propose « 🏪 Payer au restaurant » (aucun blocage, aucune erreur).

## ⚠️ Conformité PCI-DSS — à lire

Collecter le **numéro de carte** sur votre propre formulaire vous place dans le
périmètre **PCI-DSS** (questionnaire SAQ A-EP / D selon l'hébergement). C'est légal
et faisable, mais cela engage votre responsabilité sur la sécurité des données.

- Pour **rester en SAQ A** (le plus simple), utilisez plutôt le mode `checkout`
  (page hébergée SumUp) : le front sait déjà rediriger si la fonction renvoie `{ url }`.
- Le formulaire intégré (mode `card`) ne **stocke jamais** la carte : elle est
  transmise directement à SumUp et n'est pas écrite en base.
- Servez toujours le site en **HTTPS** (c'est le cas sur Vercel).

## Notes

- Le mode de paiement est inscrit dans le champ **note** de la commande → visible
  directement sur le ticket en cuisine (dashboard). Aucune migration SQL nécessaire.
- Pour un compte SumUp **par restaurant**, stockez leurs identifiants (dans
  `comptes`/`config`) et lisez-les dans la fonction au lieu des secrets globaux.
