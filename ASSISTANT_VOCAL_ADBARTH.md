# 📞 Assistant vocal téléphonique AdBarth (Premium)

Un client **appelle** le restaurant. Une **IA vocale** décroche, dit bonjour, présente
la carte, prend la commande en français — et la commande **tombe en cuisine**
exactement comme une commande du chatbot. Inclus à partir de l'abonnement **Pro** (et **Premium**).

```
Client appelle ──▶ Twilio ──▶ Edge Function "assistant-vocal" ──▶ Claude (Opus 4.8)
                                      │
                                      └──▶ insère dans `commandes` ──▶ écran cuisine (temps réel)
```

---

## Ce qui est déjà fait (dans le code)

- **`supabase/functions/assistant-vocal/index.ts`** — la fonction qui répond aux appels.
- **`db/02_assistant_vocal.sql`** — la table `vocal_appels` (mémoire + journal des appels).
- **Côté site** — onglet **Admin → Chatbot → « 📞 Assistant vocal téléphonique »**
  (visible à partir du plan Pro) : interrupteur + champ « Numéro vocal ».
- L'offre **Premium** mentionne le standard téléphonique IA sur la page tarifs.

Il reste **3 branchements** (clés + numéro), décrits ci-dessous.

---

## Mise en service (une fois)

### 1. Appliquer la table en base

Supabase → **SQL Editor** → coller `db/02_assistant_vocal.sql` → **Run**.
(ou `bash ~/apply_sql_adbart.sh sbp_TON_TOKEN ~/adbart/db/02_assistant_vocal.sql`)

### 2. Déployer la fonction + poser les secrets

```bash
supabase functions deploy assistant-vocal --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxx        # obligatoire (cerveau de l'IA)
supabase secrets set TWILIO_AUTH_TOKEN=xxxxxxxx          # recommandé (vérifie que l'appel vient bien de Twilio)
```

> `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement, rien à faire.

L'URL publique de la fonction est :

```
https://myipfprkixvgtlumyufq.functions.supabase.co/assistant-vocal
```

### 3. Obtenir un numéro Twilio et le brancher

1. Créer un compte sur **twilio.com** → **Phone Numbers → Buy a number** →
   choisir un numéro **français (+33)** avec la capacité **Voice**.
2. Ouvrir ce numéro → section **Voice → "A call comes in"** :
   - **Webhook** : coller l'URL ci-dessus
   - **Méthode** : **HTTP POST**
   - Enregistrer.
3. Récupérer le **Auth Token** du compte (Console Twilio) → c'est le `TWILIO_AUTH_TOKEN` de l'étape 2.

### 4. Renseigner le numéro côté restaurant

Dans le site : **Admin → Chatbot → 📞 Assistant vocal** → activer l'interrupteur →
saisir le **numéro Twilio** (ex. `+33 9 70 XX XX XX`) → **Enregistrer**.

C'est ce numéro qui relie l'appel au bon restaurant (la fonction cherche le compte
Premium dont `config.numeroVocal` correspond au numéro appelé).

---

## Tester

Appelez le numéro Twilio. Vous devez entendre : « Bonjour et bienvenue chez … ».
Passez une commande à voix haute, confirmez → la commande apparaît sur l'écran
**Cuisine** avec la mention « 📞 Commande par téléphone ».

Le journal des appels est consultable en base (`select * from vocal_appels order by cree_le desc;`).

---

## Notes

- **Latence** : le modèle est appelé sans « réflexion » et en effort bas → réponse
  quasi immédiate, indispensable au téléphone.
- **Voix** : voix française naturelle Amazon Polly « Léa » (`Polly.Lea-Neural`),
  fournie par Twilio.
- **Prix** : seuls les prix de **votre carte** sont utilisés ; le total est recalculé
  côté serveur (l'IA ne peut pas inventer de prix).
- **Sécurité** : si `TWILIO_AUTH_TOKEN` est posé, la fonction vérifie la signature
  Twilio et rejette tout appel qui ne vient pas de Twilio. La table `vocal_appels`
  est en RLS verrouillé (accès serveur uniquement).
- **Coûts externes** : numéro + minutes Twilio (quelques € / mois + à la minute) et
  tokens Claude par appel. À votre charge, hors abonnement AdBarth.
