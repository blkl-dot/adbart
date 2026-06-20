// ============================================================================
// AdBarth — Fonction Edge : paiement EN LIGNE d'une commande client (SumUp)
// ----------------------------------------------------------------------------
// Deux modes, appelés par le chatbot après la commande :
//
//  • mode "card"  (DÉFAUT — paiement DIRECT sur AdBarth, le client ne quitte pas
//    le site). Reçoit { montant, ref, resto, total, card:{number,expiry_month,
//    expiry_year,cvv,name} }. Crée un checkout SumUp PUIS le règle avec la carte.
//    Renvoie { status:"PAID" } si l'encaissement réussit, ou { url } si une
//    authentification 3-D Secure hébergée est nécessaire, ou { error }.
//
//  • mode "checkout" (repli historique). Renvoie { url } : page SumUp hébergée
//    vers laquelle rediriger le client.
//
// ⚠️ Collecter le numéro de carte sur votre propre formulaire vous place en
//    périmètre PCI-DSS (SAQ A-EP/D selon votre hébergeur). Pour rester en SAQ A,
//    privilégiez le mode "checkout" (page hébergée). Le front gère les deux.
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
    const { mode, montant, ref, resto, total, card } = await req.json().catch(() => ({}));
    const cents = Math.round(Number(montant) || 0);
    if (!cents || cents < 50) return json({ error: "Montant invalide" }, 400);

    const API_KEY = Deno.env.get("SUMUP_API_KEY");
    const MERCHANT = Deno.env.get("SUMUP_MERCHANT_CODE");
    const APP_URL = Deno.env.get("APP_URL") || "https://adbarth.fr";
    if (!API_KEY || !MERCHANT) return json({ error: "Paiement en ligne non configuré (secrets SumUp manquants)" }, 501);

    const amount = cents / 100;
    const reference = ref || `cmd-${Date.now()}`;
    const redirect = `${APP_URL}/?r=${encodeURIComponent(resto || "")}&paye=1`;

    // 1) Créer un checkout SumUp pour le montant de la commande
    const createResp = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        checkout_reference: reference,
        amount,
        currency: "EUR",
        merchant_code: MERCHANT,
        description: `Commande ${reference} — ${total || amount.toFixed(2)}€`,
        redirect_url: redirect,
      }),
    });
    const checkout = await createResp.json();
    if (!createResp.ok) return json({ error: checkout?.message || "Erreur SumUp (création)", detail: checkout }, 502);

    // 2a) Mode CARTE : on règle le checkout côté serveur avec la carte du client.
    if ((mode || "card") === "card" && card?.number) {
      const payResp = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkout.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_type: "card",
          card: {
            name: String(card.name || "").slice(0, 60),
            number: String(card.number || "").replace(/\D/g, ""),
            expiry_month: String(card.expiry_month || "").padStart(2, "0"),
            expiry_year: String(card.expiry_year || ""),
            cvv: String(card.cvv || "").replace(/\D/g, ""),
          },
        }),
      });
      const paid = await payResp.json();
      if (!payResp.ok) return json({ error: paid?.message || "Paiement refusé", detail: paid }, 402);

      // 3-D Secure : SumUp renvoie une étape suivante avec une URL de redirection.
      const nextUrl = paid?.next_step?.url || paid?.next_step?.redirect_url;
      if (paid?.status === "PENDING" && nextUrl) return json({ url: nextUrl, id: checkout.id });
      if (paid?.status === "PAID" || paid?.status === "SUCCESSFUL")
        return json({ status: "PAID", id: checkout.id });
      return json({ error: `Paiement non finalisé (${paid?.status || "inconnu"})`, detail: paid }, 402);
    }

    // 2b) Mode CHECKOUT (repli) : on renvoie l'URL de la page hébergée SumUp.
    const url = checkout.hosted_checkout_url || checkout.checkout_url || checkout.url ||
      `https://pay.sumup.com/b2c/${checkout.id}`;
    return json({ url, id: checkout.id });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
