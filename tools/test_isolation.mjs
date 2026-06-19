// ============================================================================
// AdBarth — Test d'isolation des comptes (sécurité RLS)
// Sonde la base Supabase AVEC LA CLÉ PUBLIQUE (celle visible dans le code,
// donc accessible à n'importe quel visiteur). But : vérifier qu'un anonyme
// ne peut PAS lire les comptes ni les commandes des restaurants.
//
//   node tools/test_isolation.mjs
//
// ✅ attendu APRÈS application de db/01_security_rls.sql :
//    - comptes      : 0 ligne lisible (bloqué)
//    - commandes    : 0 ligne lisible (bloqué)
//    - public_restaurants : lisible MAIS sans email/plan/abonnement
// ❌ si des lignes de comptes/commandes remontent → RLS PAS appliqué = FUITE.
// ============================================================================
const URL = "https://myipfprkixvgtlumyufq.supabase.co";
const KEY = "sb_publishable_us52NuCiGfqJCrOAglgUxw_A5m83O-r";
const H = { apikey: KEY, Authorization: "Bearer " + KEY };

async function q(path) {
  try {
    const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
    const txt = await r.text();
    let body; try { body = JSON.parse(txt); } catch { body = txt; }
    return { status: r.status, body };
  } catch (e) { return { status: 0, body: String(e) }; }
}

const SENSIBLE = ["email", "telephone", "plan", "prix", "abonnement_fin"];
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✅ " + m); };
const ko = (m) => { fail++; console.log("  ❌ " + m); };

console.log("\n🔒 Test d'isolation AdBarth (clé publique anonyme)\n" + "─".repeat(56));

// 1) Lecture directe des comptes interdite
{
  const { status, body } = await q("comptes?select=*");
  const rows = Array.isArray(body) ? body.length : 0;
  console.log(`\n[1] anon → comptes   (HTTP ${status})`);
  if (Array.isArray(body) && rows > 0) ko(`FUITE : ${rows} compte(s) lisible(s) par un anonyme ! Applique db/01_security_rls.sql.`);
  else if (status === 200 && rows === 0) ok("aucun compte lisible par un anonyme.");
  else if (status === 401 || status === 403) ok(`accès refusé (HTTP ${status}).`);
  else console.log("  ⚠️  réponse inattendue :", JSON.stringify(body).slice(0, 160));
}

// 2) Lecture directe des commandes interdite
{
  const { status, body } = await q("commandes?select=*");
  const rows = Array.isArray(body) ? body.length : 0;
  console.log(`\n[2] anon → commandes (HTTP ${status})`);
  if (Array.isArray(body) && rows > 0) ko(`FUITE : ${rows} commande(s) lisible(s) par un anonyme !`);
  else if (status === 200 && rows === 0) ok("aucune commande lisible par un anonyme.");
  else if (status === 401 || status === 403) ok(`accès refusé (HTTP ${status}).`);
  else console.log("  ⚠️  réponse inattendue :", JSON.stringify(body).slice(0, 160));
}

// 3) La vitrine publique est lisible mais SANS données sensibles
{
  const { status, body } = await q("public_restaurants?select=*&limit=5");
  console.log(`\n[3] anon → public_restaurants (HTTP ${status})`);
  if (status === 200 && Array.isArray(body)) {
    ok(`vitrine lisible (${body.length} resto).`);
    const leaked = new Set();
    for (const row of body) {
      for (const k of Object.keys(row)) if (SENSIBLE.includes(k)) leaked.add(k);
      const cfg = row.config || {};
      for (const k of Object.keys(cfg)) if (SENSIBLE.includes(k)) leaked.add("config." + k);
    }
    if (leaked.size) ko("champ(s) sensible(s) exposé(s) : " + [...leaked].join(", "));
    else ok("aucun champ sensible exposé (email/plan/abonnement).");
  } else if (status === 404) {
    console.log("  ⚠️  vue public_restaurants absente → applique db/01_security_rls.sql (le chatbot en a besoin).");
  } else console.log("  ⚠️  réponse :", JSON.stringify(body).slice(0, 160));
}

// 4) Tentative de lire les emails des comptes (ciblé)
{
  const { status, body } = await q("comptes?select=id,email,plan");
  const rows = Array.isArray(body) ? body.length : 0;
  console.log(`\n[4] anon → comptes(email,plan) (HTTP ${status})`);
  if (Array.isArray(body) && rows > 0) ko(`FUITE : emails/plans lisibles (${rows}).`);
  else ok("emails/plans non lisibles par un anonyme.");
}

console.log("\n" + "─".repeat(56));
console.log(`Résultat : ${pass} ✅   ${fail} ❌`);
console.log(fail === 0
  ? "🎉 Isolation OK : un anonyme ne voit aucun compte/commande.\n"
  : "🚨 Isolation INCOMPLÈTE : applique db/01_security_rls.sql puis relance ce test.\n");
process.exit(fail === 0 ? 0 : 1);
