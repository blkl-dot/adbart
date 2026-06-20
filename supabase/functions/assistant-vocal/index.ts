// ============================================================================
// AdBarth — Assistant vocal téléphonique (Twilio + Claude)
// ----------------------------------------------------------------------------
// Le client APPELLE le numéro du restaurant. Un assistant vocal IA répond,
// présente la carte, prend la commande en langage naturel (français), puis
// dépose la commande dans la table `commandes` → elle tombe en direct sur
// l'écran cuisine, EXACTEMENT comme une commande du chatbot.
//
// RÉSERVÉ À L'ABONNEMENT « Premium » (le plus cher). Si le restaurant n'est pas
// Premium / son abonnement est expiré, l'assistant le dit poliment et raccroche.
//
// Flux d'un appel (Twilio est sans état → on garde l'historique en base) :
//   1. Twilio POST (webhook) → on identifie le resto via le numéro appelé (To)
//   2. On charge l'historique de l'appel (table vocal_appels, clé = CallSid)
//   3. On envoie au modèle : carte du resto + historique + parole du client
//   4. Le modèle renvoie { reply, done, order } (sortie structurée)
//   5. On répond en TwiML : <Say> la réponse, puis <Gather> (on réécoute) ou
//      <Hangup> si la commande est finalisée → insertion dans `commandes`.
//
// Déploiement :
//   supabase functions deploy assistant-vocal --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (obligatoire)
//   supabase secrets set TWILIO_AUTH_TOKEN=...          (recommandé, vérifie la signature)
//   (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement)
//
// Webhook à coller dans Twilio (Phone Numbers → votre numéro → Voice → A call comes in) :
//   https://<project-ref>.functions.supabase.co/assistant-vocal   (méthode POST)
// ============================================================================

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const MODEL = "claude-opus-4-8";
const VOICE = "Polly.Lea-Neural"; // voix française naturelle (Amazon Polly Léa)
const LANG = "fr-FR";

// ── Utilitaires TwiML ───────────────────────────────────────────────────────
const xmlEscape = (s: string) =>
  String(s ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

const twiml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });

// On dit quelque chose puis on réécoute le client (un tour de plus).
function sayAndListen(text: string, actionUrl: string) {
  return twiml(
    `<Say voice="${VOICE}" language="${LANG}">${xmlEscape(text)}</Say>` +
    `<Gather input="speech" language="${LANG}" speechTimeout="auto" speechModel="phone_call" ` +
    `action="${xmlEscape(actionUrl)}" method="POST">` +
    `<Say voice="${VOICE}" language="${LANG}">Je vous écoute.</Say></Gather>` +
    // Si le client ne dit rien, on relance une fois puis on boucle sur l'action.
    `<Redirect method="POST">${xmlEscape(actionUrl)}</Redirect>`,
  );
}

// On dit quelque chose puis on raccroche (commande finalisée ou refus).
function sayAndHangup(text: string) {
  return twiml(
    `<Say voice="${VOICE}" language="${LANG}">${xmlEscape(text)}</Say><Hangup/>`,
  );
}

// ── Accès base (service_role : contourne le RLS, côté serveur uniquement) ─────
const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function sbSelect(path: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) return [];
  return await r.json().catch(() => []);
}

// Identifie le restaurant à partir du numéro Twilio appelé (config.numeroVocal).
async function findResto(toNumber: string) {
  const digits = (toNumber || "").replace(/[^\d+]/g, "");
  // On lit les comptes Premium et on compare le numéro vocal configuré.
  const rows = await sbSelect(
    `comptes?select=id,resto,plan,abonnement_fin,config,menu,cats&plan=eq.premium`,
  );
  for (const c of rows) {
    const num = String(c?.config?.numeroVocal || "").replace(/[^\d+]/g, "");
    if (num && (num === digits || num.endsWith(digits.slice(-9)) || digits.endsWith(num.slice(-9)))) {
      return c;
    }
  }
  return null;
}

// Charge / sauvegarde l'historique de conversation d'un appel (par CallSid).
async function loadCall(callSid: string): Promise<any[]> {
  const rows = await sbSelect(`vocal_appels?select=history&call_sid=eq.${encodeURIComponent(callSid)}`);
  return Array.isArray(rows?.[0]?.history) ? rows[0].history : [];
}

async function saveCall(callSid: string, compteId: string, resto: string, history: any[], statut: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/vocal_appels?on_conflict=call_sid`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      call_sid: callSid, compte_id: compteId, resto, history, statut, maj_le: new Date().toISOString(),
    }),
  });
}

// ── Carte du restaurant → texte pour le modèle ──────────────────────────────
function menuText(menu: any[], cats: string[]): string {
  const items = (Array.isArray(menu) ? menu : []).filter((i) => i && i.on !== false && i.name);
  if (!items.length) return "(Aucun plat n'est encore configuré sur la carte.)";
  const order = Array.isArray(cats) && cats.length ? cats : [...new Set(items.map((i) => i.cat))];
  const lines: string[] = [];
  for (const cat of order) {
    const sub = items.filter((i) => i.cat === cat);
    if (!sub.length) continue;
    lines.push(`\n### ${cat}`);
    for (const i of sub) {
      const price = Number(String(i.price).replace(",", ".")) || 0;
      const desc = i.desc ? ` — ${i.desc}` : "";
      lines.push(`- ${i.name} : ${price.toFixed(2)}€${desc}`);
    }
  }
  return lines.join("\n");
}

// Prix d'un article par son nom (insensible casse/accents) pour calculer le total.
function priceOf(menu: any[], name: string): number {
  const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const t = norm(name);
  const hit = (menu || []).find((i) => norm(i.name) === t) ||
    (menu || []).find((i) => norm(i.name).includes(t) || t.includes(norm(i.name)));
  return hit ? (Number(String(hit.price).replace(",", ".")) || 0) : 0;
}

// ── Appel au modèle (sortie structurée) ─────────────────────────────────────
const ORDER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string", description: "Ce que l'assistant dit à voix haute au client, en français, naturel et bref." },
    done: { type: "boolean", description: "true UNIQUEMENT quand la commande est confirmée et complète, ou quand l'appel doit se terminer." },
    order: {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", description: "Nom EXACT du plat tel qu'il figure sur la carte." },
              qty: { type: "integer", description: "Quantité (1 ou plus)." },
              note: { type: "string", description: "Précision éventuelle (ex: sans oignon). Vide sinon." },
            },
            required: ["name", "qty", "note"],
          },
        },
        client_note: { type: "string", description: "Note générale du client (ex: à emporter dans 20 min). Vide sinon." },
      },
      required: ["items", "client_note"],
    },
  },
  required: ["reply", "done", "order"],
};

async function askModel(resto: string, menu: string, history: any[]) {
  const system =
    `Tu es l'assistant vocal téléphonique du restaurant « ${resto} ». ` +
    `Un client t'appelle pour passer commande. Tu parles UNIQUEMENT en français, ` +
    `d'un ton chaleureux, poli et concis (tu es à l'oral : phrases courtes, pas de listes à puces, pas d'emoji).\n\n` +
    `RÈGLES :\n` +
    `- Tu ne proposes QUE des plats de la carte ci-dessous. Si un client demande autre chose, dis-le gentiment.\n` +
    `- Récapitule la commande et le prix total avant de confirmer.\n` +
    `- Quand le client confirme, mets done=true et remplis order.items avec les noms EXACTS de la carte et les quantités.\n` +
    `- Tant que la commande n'est pas confirmée, done=false et order.items=[].\n` +
    `- Si le client veut juste des renseignements (horaires, plats), réponds sans rien commander (done=false).\n` +
    `- Si le client dit au revoir / veut raccrocher sans commander, mets done=true et order.items=[].\n` +
    `- Ne donne jamais d'autre prix que ceux de la carte.\n\n` +
    `CARTE DU RESTAURANT :\n${menu}`;

  const body = {
    model: MODEL,
    max_tokens: 700,
    // Pas de "thinking" (réponse immédiate, indispensable au téléphone) + effort bas.
    output_config: { effort: "low", format: { type: "json_schema", schema: ORDER_SCHEMA } },
    system,
    messages: history,
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) throw new Error(data?.error?.message || `Anthropic HTTP ${r.status}`);

  const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    return { reply: text || "Pardon, pouvez-vous répéter ?", done: false, order: { items: [], client_note: "" } };
  }
}

// ── Vérification (optionnelle) de la signature Twilio ───────────────────────
async function twilioSignatureOk(url: string, params: Record<string, string>, signature: string) {
  if (!TWILIO_AUTH_TOKEN) return true; // pas de token configuré → on ne bloque pas (phase de test)
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(TWILIO_AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return b64 === signature;
}

// ── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("AdBarth assistant vocal", { status: 200 });

  const url = new URL(req.url);
  const actionUrl = url.origin + url.pathname; // on revient toujours sur cette même fonction

  // Twilio envoie de l'application/x-www-form-urlencoded
  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  if (form) for (const [k, v] of form.entries()) params[k] = String(v);

  // Vérif signature (si TWILIO_AUTH_TOKEN posé)
  const sigOk = await twilioSignatureOk(actionUrl, params, req.headers.get("X-Twilio-Signature") || "");
  if (!sigOk) return new Response("Forbidden", { status: 403 });

  const callSid = params.CallSid || "sans-sid";
  const to = params.To || "";
  const from = params.From || "";
  const speech = (params.SpeechResult || "").trim();

  try {
    if (!ANTHROPIC_API_KEY) {
      return sayAndHangup("Le service vocal n'est pas encore configuré. Merci de rappeler plus tard.");
    }

    // 1) Identifier le restaurant (Premium + abonnement valide)
    const resto = await findResto(to);
    if (!resto) {
      return sayAndHangup("Bonjour. Ce numéro n'est associé à aucun restaurant actif. Au revoir.");
    }
    const finOk = !resto.abonnement_fin || new Date(resto.abonnement_fin) > new Date();
    if (resto.plan !== "premium" || !finOk) {
      return sayAndHangup(
        "Bonjour. La prise de commande vocale n'est pas active pour ce restaurant pour le moment. Au revoir.",
      );
    }

    const carte = menuText(resto.menu, resto.cats);

    // 2) Charger l'historique de l'appel
    const history = await loadCall(callSid);

    // 3) Premier tour : pas encore de parole → on accueille
    if (!history.length && !speech) {
      const greet = `Bonjour et bienvenue chez ${resto.resto}. Je suis votre assistant pour prendre votre commande. Que souhaitez-vous ?`;
      history.push({ role: "assistant", content: greet });
      await saveCall(callSid, resto.id, resto.resto, history, "en_cours");
      return sayAndListen(greet, actionUrl);
    }

    // 4) Ajouter la parole du client puis interroger le modèle
    if (speech) history.push({ role: "user", content: speech });
    else history.push({ role: "user", content: "(le client n'a rien dit)" });

    const out = await askModel(resto.resto, carte, history);
    const reply = String(out?.reply || "Pardon, pouvez-vous répéter ?");
    history.push({ role: "assistant", content: reply });

    // 5) Commande finalisée ?
    const items = Array.isArray(out?.order?.items) ? out.order.items : [];
    if (out?.done && items.length) {
      // Construire les lignes + total côté serveur (à partir des VRAIS prix de la carte)
      let total = 0;
      const lignes: string[] = [];
      for (const it of items) {
        const qty = Math.max(1, Number(it.qty) || 1);
        const p = priceOf(resto.menu, it.name);
        total += p * qty;
        const note = it.note ? ` (${it.note})` : "";
        lignes.push(`${qty}× ${it.name}${note}`);
      }
      const clientNote = String(out?.order?.client_note || "").trim();
      const ref = "TEL-" + (callSid.slice(-6) || Math.random().toString(36).slice(2, 8)).toUpperCase();

      await fetch(`${SUPABASE_URL}/rest/v1/commandes`, {
        method: "POST",
        headers: { ...sbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({
          compte_id: resto.id,
          ref,
          type: "commande",
          client: `📞 Téléphone ${from || ""}`.trim(),
          items: lignes.slice(0, 40),
          total: `${total.toFixed(2)}€`,
          note: ["📞 Commande par téléphone (assistant vocal IA)", clientNote].filter(Boolean).join(" — "),
          status: "en_cours",
        }),
      });

      await saveCall(callSid, resto.id, resto.resto, history, "commande");
      return sayAndHangup(`${reply} Votre commande est transmise en cuisine. Merci et à bientôt !`);
    }

    // Fin d'appel sans commande
    if (out?.done) {
      await saveCall(callSid, resto.id, resto.resto, history, "termine");
      return sayAndHangup(reply || "Très bien, bonne journée et à bientôt !");
    }

    // 6) On continue la conversation
    await saveCall(callSid, resto.id, resto.resto, history, "en_cours");
    return sayAndListen(reply, actionUrl);
  } catch (e) {
    console.error("assistant-vocal:", e?.message || e);
    return sayAndHangup(
      "Désolé, une erreur technique est survenue. Merci de rappeler dans un instant, ou de passer commande sur notre lien en ligne.",
    );
  }
});
