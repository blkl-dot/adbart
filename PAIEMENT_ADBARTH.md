# AdBarth — Paiement des commandes client

Après sa commande dans le chatbot, le client choisit **comment régler** :

- **🏪 Payer au restaurant** — fonctionne **immédiatement**, sans aucune configuration.
  La commande part en cuisine avec la mention « 🏪 À régler au restaurant » sur le ticket.
- **💳 Payer en ligne** — encaissement par carte via SumUp (à activer, voir ci-dessous).
  Le ticket cuisine affiche « 💳 Paiement en ligne ».

Le restaurateur peut **activer/désactiver** le paiement en ligne dans son espace :
**Admin → onglet Chatbot → « 💳 Paiement de la commande »**. S'il est désactivé,
le client règle uniquement au restaurant.

---

## Activer le paiement en ligne par carte (SumUp)

1. **Créer la fonction Edge** `creer-paiement-commande` (modèle fourni dans
   `supabase/functions/creer-paiement-commande/index.ts`).
   - Le plus simple : **copiez votre fonction `creer-paiement`** (celle de l'abonnement,
     qui fonctionne déjà) et remplacez le montant fixe par le `montant` reçu dans le
     corps de la requête. Le front attend une réponse `{ url }`.

2. **Déployer + secrets** :
   ```bash
   supabase functions deploy creer-paiement-commande --no-verify-jwt
   supabase secrets set SUMUP_API_KEY=sup_sk_xxx SUMUP_MERCHANT_CODE=MXXXXX APP_URL=https://votre-site.vercel.app
   ```

3. **Tester** : commande dans le chatbot → « 💳 Payer en ligne » → vous devez être
   redirigé vers la page SumUp. Au retour (`?paye=1`), la commande est déjà en cuisine.

> Tant que la fonction n'est pas déployée, le bouton « Payer en ligne » bascule
> proprement le client sur « Payer au restaurant » (aucun blocage, aucune erreur).

## Notes

- Le mode de paiement est inscrit dans le champ **note** de la commande → visible
  directement sur le ticket en cuisine (dashboard). Aucune migration SQL nécessaire.
- L'encaissement va sur le compte SumUp configuré (secrets). Pour un compte SumUp
  **par restaurant**, il faudra stocker leurs identifiants et les lire dans la fonction.
