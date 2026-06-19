// ============================================================================
// AdBarth — Fonction Edge : paiement EN LIGNE d'une commande client (SumUp)
// ----------------------------------------------------------------------------
// Appelée par le chatbot quand le client choisit « 💳 Payer en ligne ».
// Reçoit { montant (centimes), ref, resto, total } et renvoie { url } : la page
// de paiement SumUp vers laquelle le client est redirigé.
//
// ⚠️ MODÈLE À ADAPTER À VOTRE COMPTE SUMUP.
//   Le plus simple : copiez votre fonction « creer-paiement » (abonnement) qui
//   marche déjà, et remplacez le montant fixe par `montant` reçu ici.
//
// Déploiement :
//   supabase functions deploy creer-paiement-commande --no-verify-jwt
//   supabase secrets set SUMUP_API_KEY=sup_sk_xxx SUMUP_MERCHANT_CODE=MXXXXX APP_URL=https://votre-site.vercel.app
// ============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { montant, ref, resto, total } = await req.json().catch(() => ({}));
    const cents = Math.round(Number(montant) || 0);
    if (!cents || cents < 50) return json({ error: "Montant invalide" }, 400);

    const API_KEY = Deno.env.get("SUMUP_API_KEY");
    const MERCHANT = Deno.env.get("SUMUP_MERCHANT_CODE");
    const APP_URL = Deno.env.get("APP_URL") || "https://adbarth.fr";
    if (!API_KEY || !MERCHANT) return json({ error: "Paiement en ligne non configuré (secrets SumUp manquants)" }, 501);

    // 1) Créer un checkout SumUp pour le montant de la commande
    const resp = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        checkout_reference: ref || `cmd-${Date.now()}`,
        amount: cents / 100,
        currency: "EUR",
        merchant_code: MERCHANT,
        description: `Commande ${ref || ""} — ${total || (cents / 100).toFixed(2)}€`,
        redirect_url: `${APP_URL}/?r=${encodeURIComponent(resto || "")}&paye=1`,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return json({ error: data?.message || "Erreur SumUp", detail: data }, 502);

    // 2) Renvoyer l'URL de paiement hébergée (selon votre intégration SumUp).
    //    Adaptez ce champ à ce que renvoie VOTRE fonction d'abonnement qui marche.
    const url = data.hosted_checkout_url || data.checkout_url || data.url ||
      `https://pay.sumup.com/b2c/${data.id}`;
    return json({ url, id: data.id });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
