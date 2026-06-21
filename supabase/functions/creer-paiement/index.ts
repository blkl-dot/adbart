// ============================================================================
// AdBarth — Fonction Edge : paiement de l'ABONNEMENT du restaurateur (SumUp)
// ----------------------------------------------------------------------------
// Facture chaque offre à SON prix (le prix est décidé SERVEUR, jamais par le front) :
//   Starter 29,90 € · Pro 49,90 € · Premium 79,90 €
//
// Deux usages :
//  • { plan, card:{...} }  -> crée un checkout SumUp pour le prix du plan, règle
//    avec la carte. Si PAID -> active l'abonnement (comptes: plan/prix/abonnement_fin
//    = +30 j). Si 3-D Secure -> renvoie { url } (le front redirige, puis rappelle
//    cette fonction avec { verify_id } au retour).
//  • { verify_id }  -> relit le checkout chez SumUp (source de vérité) ; si PAID,
//    active l'abonnement (idempotent : on n'active que si pas déjà couvert).
//
// L'abonné est identifié par son JWT (compte = auth.uid()) à la création ; à la
// vérif, l'id du compte est lu dans la référence du checkout (signée par SumUp).
//
// Déploiement (MÊME compte SumUp que Titanium) :
//   supabase functions deploy creer-paiement --no-verify-jwt
//   supabase secrets set SUMUP_API_KEY=sup_sk_xxx SUMUP_MERCHANT_CODE=MC24XV6Z APP_URL=https://adbarth.fr
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fournis automatiquement)
// ============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Prix officiels par plan (source de vérité côté serveur, en €)
const PLANS: Record<string, number> = { starter: 29.90, pro: 49.90, premium: 79.90 };

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("SUMUP_API_KEY");
const MERCHANT = Deno.env.get("SUMUP_MERCHANT_CODE");
const APP_URL = Deno.env.get("APP_URL") || "https://adbarth.fr";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const sb = () => createClient(SB_URL, SERVICE_KEY);

// Active/prolonge l'abonnement : +30 j à partir de la date la plus tardive entre
// l'échéance actuelle et maintenant (pas de perte de jours si renouvellement en avance).
async function activer(compteId: string, plan: string, prix: number) {
  const db = sb();
  const { data: cur } = await db.from("comptes").select("abonnement_fin").eq("id", compteId).single();
  const now = Date.now();
  const base = cur?.abonnement_fin ? Math.max(new Date(cur.abonnement_fin).getTime(), now) : now;
  const fin = new Date(base + 30 * 86400000).toISOString();
  const { error } = await db.from("comptes").update({ plan, prix, abonnement_fin: fin }).eq("id", compteId);
  if (error) throw new Error(error.message);
  return fin;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!API_KEY || !MERCHANT) return json({ error: "Paiement non configuré (secrets SumUp manquants)" }, 501);
    const { plan, card, verify_id, mode } = await req.json().catch(() => ({} as any));

    // ── Cas VÉRIFICATION (retour 3-D Secure / webhook) ──────────────────────
    if (verify_id) {
      const r = await fetch(`https://api.sumup.com/v0.1/checkouts/${verify_id}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const co = await r.json();
      if (!r.ok) return json({ error: "SumUp introuvable", detail: co }, 502);
      if (co.status !== "PAID" && co.status !== "SUCCESSFUL") return json({ ok: false, status: co.status });
      const m = String(co.checkout_reference || "").match(/^adbarth-sub:([^:]+):([^:]+):/);
      if (!m) return json({ error: "référence invalide" }, 400);
      const pl = m[1], uid = m[2], prix = PLANS[pl];
      if (!prix) return json({ error: "plan inconnu" }, 400);
      const fin = await activer(uid, pl, prix);
      return json({ ok: true, status: "PAID", plan: pl, abonnement_fin: fin });
    }

    // ── Cas CRÉATION + PAIEMENT carte ───────────────────────────────────────
    const prix = PLANS[String(plan)];
    if (!prix) return json({ error: "Plan invalide" }, 400);

    // Identifier le restaurateur via son JWT
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Connexion requise." }, 401);
    const { data: u, error: aerr } = await sb().auth.getUser(jwt);
    const uid = u?.user?.id;
    if (aerr || !uid) return json({ error: "Session invalide." }, 401);

    const reference = `adbarth-sub:${plan}:${uid}:${Date.now()}`;
    const createResp = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        checkout_reference: reference,
        amount: prix,
        currency: "EUR",
        merchant_code: MERCHANT,
        description: `Abonnement AdBarth ${plan} — ${prix.toFixed(2)}€/mois`,
        redirect_url: `${APP_URL}/?abo=1`,
      }),
    });
    const checkout = await createResp.json();
    if (!createResp.ok) return json({ error: checkout?.message || "Erreur SumUp (création)", detail: checkout }, 502);

    // Repli sans carte : on renvoie l'id pour un widget/redirection ultérieurs
    if ((mode || "card") !== "card" || !card?.number) {
      return json({ id: checkout.id, plan, amount: prix, merchant_code: MERCHANT });
    }

    // Règlement carte côté serveur
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

    const nextUrl = paid?.next_step?.url || paid?.next_step?.redirect_url;
    if (paid?.status === "PENDING" && nextUrl) return json({ url: nextUrl, id: checkout.id });
    if (paid?.status === "PAID" || paid?.status === "SUCCESSFUL") {
      const fin = await activer(uid, String(plan), prix);
      return json({ status: "PAID", plan, prix, abonnement_fin: fin });
    }
    return json({ error: `Paiement non finalisé (${paid?.status || "inconnu"})`, detail: paid }, 402);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
