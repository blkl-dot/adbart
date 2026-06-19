import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

/* ═══════════════════════════════════════════════════════════════════════
   ADBARTH — SYSTÈME DE DESIGN  ·  « Service du soir »
   ───────────────────────────────────────────────────────────────────────
   Concept : un bistro à la nuit tombée, vu côté tech. Des noirs CHAUDS
   (teintés prune/braise) plutôt que le bleu-noir SaaS générique ; la
   flamme orange y est à sa place, comme une bougie sur une table. Deux
   accents seulement, jamais trois : la BRAISE (orange→ambre, l'appétit,
   l'action) et la MENTHE (le « c'est prêt », la confiance, le frais).

   COULEURS
     flame   #FF6B35  signature, CTA, marque        (var R)
     ember   #FFB23E  ambre chaud, prix, accents     (var OR)
     mint    #2BD4A0  succès, « prêt », confiance     (var V)
     ink     #0B0910  fond, braise éteinte
     panel   #181320  surfaces, cartes
     cream   #F2ECE4  texte principal (chaud, pas blanc clinique)
   TYPO
     display : Syne 700-900  — titres, géante, expressive, mémorable
     texte   : DM Sans 400-700 — lecture, dense, neutre
     mono    : Space Mono     — liens, refs, chiffres « machine »
     échelle : 11·12·13·14·16·18·22·28·40·64 + hero clamp(34,8vw,86)
   RYTHME   espacements 4·8·12·16·22·32·48·72   ·  rayons 8·12·16·22·28
   PROFONDEUR  ombres douces + halo de braise (glow) sur les surfaces vives
   MOUVEMENT  courbe maison EASE = cubic-bezier(.16,1,.3,1) ; reveals au
              scroll, compteurs animés, micro-interactions ; tout neutralisé
              sous prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Couleurs (R/OR/V conservés : référencés partout) ──────────────────
const R = "#FF6B35";    // flame
const RH = "#FF8A52";   // flame survol
const OR = "#FFB23E";   // ember
const V = "#2BD4A0";    // mint
const BG = "#0B0910";   // ink
const BG1 = "#100C16";  // section sombre
const BG2 = "#130F1A";  // surface enfoncée / inputs
const PANEL = "#181320";// cartes
const LINE = "#241D2F"; // bordure douce
const LINE2 = "#34293F";// bordure marquée
const TXT = "#F2ECE4";  // cream
const MUT = "#8A8295";  // texte secondaire
const FAINT = "#6B6378";// texte ténu
const EASE = "cubic-bezier(.16,1,.3,1)";
const EMOJIS = ["🍔","🍕","🌮","🌯","🫓","🍗","🌭","🍟","🍝","🥗","🍣","🥙","🍜","🥘","🥩","🍖","🍮","🧁","🍰","🥤","🧃","☕","🍵","🍺","🥂","🍷"];

// Respecte « moins d'animations » du système
const RM = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

// ── Sécurité / anti-abus : limites et nettoyage des entrées ──
const LIMITS = {
  persons: { min: 1, max: 30 },   // réservation : nb de personnes
  qty:     { min: 1, max: 20 },   // quantité par article
  itemsMax: 40,                   // nb max d'articles dans une commande
  text:    120,                   // longueur max d'un champ texte court
  note:    300,                   // longueur max d'une note / commentaire
  price:   { min: 0, max: 1000 }, // prix d'un plat (€)
};
// Force un entier dans une plage [min,max] ; renvoie null si non valide
function clampInt(v, min, max) {
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  if (isNaN(n)) return null;
  return Math.min(max, Math.max(min, n));
}
// Nettoie un texte : retire < > (anti-injection), coupe à la longueur max
function sanitizeText(s, max = LIMITS.text) {
  return String(s || "").replace(/[<>]/g, "").slice(0, max).trim();
}
// Valide un prix : nombre positif, max 1000 €, arrondi au centime ; null si invalide
function validPrice(v) {
  const n = parseFloat(String(v).replace(",", "."));
  if (isNaN(n) || n < LIMITS.price.min || n > LIMITS.price.max) return null;
  return Math.round(n * 100) / 100;
}

// ── Plans (tous incluent : SMS appel manqué + lien + chatbot + cuisine) ──
const PLANS = [
  { key:"starter", name:"Starter", price:29.90, features:["SMS automatique sur appel manqué","Lien de commande envoyé par SMS","Chatbot commande + réservation","Dashboard cuisine temps réel","Jusqu'à 100 SMS/mois"], missing:["SMS illimités","Installation faite par un technicien"] },
  { key:"pro", name:"Pro", price:49.90, popular:true, features:["SMS automatique sur appel manqué","Lien de commande envoyé par SMS","Chatbot commande + réservation","Dashboard cuisine temps réel","SMS illimités"], missing:["Installation faite par un technicien"] },
  { key:"premium", name:"Premium", price:79.90, features:["SMS automatique sur appel manqué","Lien de commande envoyé par SMS","Chatbot commande + réservation","Dashboard cuisine temps réel","SMS illimités","Installation faite par un technicien (panel admin configuré pour vous)"], missing:[] },
];

// ⚠️ Lien de secours (si les fonctions serveur ne sont pas encore déployées)
const SUMUP_LINK = "https://pay.sumup.com/b2c/REMPLACE-MOI";

// Lance le paiement : crée un checkout SumUp côté serveur puis redirige le client
async function payerAbonnement() {
  try {
    const { data, error } = await supabase.functions.invoke("creer-paiement", { body: {} });
    if (error) {
      let detail = error.message || String(error);
      try { const body = await error.context.json(); if (body?.error) detail = typeof body.error === "string" ? body.error : JSON.stringify(body.error); } catch (_) {}
      alert("Erreur paiement : " + detail);
      return;
    }
    if (data?.url) { window.location.href = data.url; return; }
    alert("Réponse inattendue : " + JSON.stringify(data));
  } catch (e) {
    alert("Erreur paiement : " + (e?.message || String(e)));
  }
}

// ── Base de données Supabase (liée au compte connecté) ─
let _orders = [];
let _subs = [];
let _userId = null;
const notify = () => _subs.forEach(f => f([..._orders]));
export const setUserId = id => { _userId = id; };

async function loadOrders() {
  if (!_userId) { _orders = []; notify(); return; }
  const { data, error } = await supabase
    .from("commandes").select("*").eq("compte_id", _userId).order("cree_le", { ascending: false });
  if (!error && data) {
    _orders = data.map(d => ({
      id: d.ref || d.id, _dbid: d.id, type: d.type, client: d.client,
      items: d.items || [], total: d.total, note: d.note || "", status: d.status,
      time: d.cree_le ? new Date(d.cree_le).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) : "",
    }));
    notify();
  }
}

const db = {
  sub: fn => { _subs.push(fn); loadOrders(); return () => { _subs = _subs.filter(s => s !== fn); }; },
  reload: () => loadOrders(),
  add: async o => {
    // Couche défensive : on nettoie et on plafonne TOUT avant d'écrire
    const safe = {
      ...o,
      client: sanitizeText(o.client, 40),
      items: (Array.isArray(o.items) ? o.items : []).slice(0, LIMITS.itemsMax).map(it => sanitizeText(it, 80)),
      total: sanitizeText(o.total, 16),
      note: sanitizeText(o.note, LIMITS.note),
      status: ["en_cours", "pret", "termine"].includes(o.status) ? o.status : "en_cours",
    };
    _orders = [safe, ..._orders]; notify();
    await supabase.from("commandes").insert({ compte_id: _userId, ref: safe.id, type: safe.type, client: safe.client, items: safe.items, total: safe.total, note: safe.note, status: safe.status });
    loadOrders();
  },
  upd: async (id, s) => {
    _orders = _orders.map(o => o.id === id ? { ...o, status: s } : o); notify();
    await supabase.from("commandes").update({ status: s }).eq("ref", id).eq("compte_id", _userId);
  },
  subscribeRealtime: onNew => {
    if (!_userId) return () => {};
    const channel = supabase
      .channel("commandes-" + _userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "commandes", filter: `compte_id=eq.${_userId}` }, () => {
        loadOrders();
        if (onNew) onNew();
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch (e) {} };
  },
};
const uid = () => String(Date.now()).slice(-4);
const now = () => new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });

// ── Lien client « joli », adapté au restaurant ────────────────────────
// "Le Petit Bistrot" -> "le-petit-bistrot". On ajoute un court suffixe tiré de
// l'identifiant pour garantir l'unicité (deux « Bistrot » ne se télescopent pas).
function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
function restoSlug(name, id) {
  const base = slugify(name) || "resto";
  const suf = String(id || "").replace(/-/g, "").slice(0, 4) || "0000";
  return `${base}-${suf}`;
}
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));

// ── CSS global ────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800;900&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: 'DM Sans', sans-serif; background: ${BG}; color: ${TXT}; overflow-x: hidden; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
::selection { background: ${R}; color: #fff; }

/* — keyframes — */
@keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
@keyframes spin { to { transform:rotate(360deg) } }
@keyframes ring { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-14deg)} 60%{transform:rotate(14deg)} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
@keyframes glow { 0%,100%{box-shadow:0 0 20px ${R}35} 50%{box-shadow:0 0 55px ${R}70} }
@keyframes floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
@keyframes shimmer { to { background-position: 200% center } }
@keyframes ripple { 0%{transform:scale(.6);opacity:.7} 100%{transform:scale(2.4);opacity:0} }
@keyframes dropIn { 0%{opacity:0;transform:translateY(-26px) rotate(-3deg)} 60%{opacity:1} 100%{opacity:1;transform:translateY(0) rotate(0)} }
@keyframes slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
@keyframes sheen { 0%{transform:translateX(-120%)} 60%,100%{transform:translateX(220%)} }
@keyframes bob { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-3px) rotate(2deg)} }

/* — utilitaires — */
.fu { animation: fadeUp .42s ${EASE} both; }
.reveal { opacity:0; transform:translateY(26px); transition: opacity .7s ${EASE}, transform .7s ${EASE}; will-change: opacity, transform; }
.reveal.in { opacity:1; transform:none; }
.grad-text { background:linear-gradient(95deg, ${R}, ${OR}); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.lift { transition: transform .35s ${EASE}, border-color .35s ${EASE}, box-shadow .35s ${EASE}, background .35s ${EASE}; }
.glass { background: rgba(24,19,32,.6); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
.sheen { position:relative; overflow:hidden; }
.sheen::after { content:''; position:absolute; top:0; left:0; width:60%; height:100%; background:linear-gradient(100deg, transparent, rgba(255,255,255,.13), transparent); transform:translateX(-120%); }
.sheen:hover::after { animation: sheen .9s ${EASE}; }

input, textarea, select { font-family:'DM Sans', sans-serif; transition: border-color .2s ease, box-shadow .2s ease, background .2s ease; }
input:focus, textarea:focus, select:focus { outline: none; border-color:${R}99 !important; box-shadow:0 0 0 3px ${R}1F; }
button { font-family: 'DM Sans', sans-serif; transition: transform .14s ${EASE}, filter .2s ease, background .2s ease, box-shadow .2s ease, border-color .2s ease; }
button:active { transform: scale(.97); }
a, button, [role=button] { -webkit-tap-highlight-color: transparent; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: ${LINE2}; border-radius: 6px; }
::-webkit-scrollbar-thumb:hover { background: ${R}88; }

/* — grain léger : profondeur sans image — */
.grain::before { content:''; position:fixed; inset:0; z-index:1; pointer-events:none; opacity:.035; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }
  .reveal { opacity:1 !important; transform:none !important; }
}
`;

const I = { width: "100%", background: BG2, border: `1.5px solid ${LINE2}`, borderRadius: 12, color: TXT, fontSize: 14, padding: "13px 15px", fontFamily: "'DM Sans', sans-serif" };

// ── Hooks d'animation ────────────────────────────────────────────────
// Reveal au scroll via IntersectionObserver : renvoie une ref à poser sur l'élément .reveal
function useReveal(opts = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (RM) { el.classList.add("in"); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { el.classList.add("in"); io.unobserve(el); } });
    }, { threshold: opts.threshold ?? 0.18, rootMargin: opts.rootMargin ?? "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
// Compteur animé : anime une valeur 0→n quand l'élément entre à l'écran
function useCountUp(target, dur = 1400) {
  const [val, setVal] = useState(RM ? target : 0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el || RM) return;
    let raf, started = false;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !started) {
        started = true; const t0 = performance.now();
        const tick = (t) => {
          const p = Math.min(1, (t - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(target * eased);
          if (p < 1) raf = requestAnimationFrame(tick); else setVal(target);
        };
        raf = requestAnimationFrame(tick); io.unobserve(el);
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target]);
  return [val, ref];
}
// Enveloppe un bloc dans une révélation au scroll (avec délai optionnel)
function Reveal({ children, delay = 0, style = {}, as: Tag = "div", ...rest }) {
  const ref = useReveal();
  return <Tag ref={ref} className="reveal" style={{ transitionDelay: `${delay}ms`, ...style }} {...rest}>{children}</Tag>;
}

// ═════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════
export default function AdBarth() {
  const [page, setPage] = useState("landing");
  const [plan, setPlan] = useState(null);
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ready, setReady] = useState(false);
  const [publicResto, setPublicResto] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => db.sub(setOrders), []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("r");
    if (rid) { setPublicResto(rid); setPage("chatbot"); setReady(true); return; }
    const justPaid = params.get("paye") === "1";
    if (justPaid) {
      // Nettoie l'URL et re-vérifie l'abonnement après quelques secondes (le temps que SumUp confirme)
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => supabase.auth.getSession().then(({ data }) => { if (data?.session?.user) applySession(data.session.user); }), 4000);
      alert("✅ Merci ! Votre paiement est en cours de validation. Votre accès se débloque dans une minute — rechargez la page si besoin.");
    }
    const isRecovery = window.location.hash.includes("type=recovery") || params.get("type") === "recovery";
    supabase.auth.getSession().then(({ data }) => {
      if (isRecovery) { setPage("reset"); setReady(true); return; }
      if (data?.session?.user) applySession(data.session.user);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { setPage("reset"); setReady(true); return; }
      if (session?.user) applySession(session.user);
      else { setUserId(null); setUser(null); db.reload(); }
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);
  async function applySession(authUser) {
    setUserId(authUser.id);
    const { data } = await supabase.from("comptes").select("*").eq("id", authUser.id).single();
    const u = {
      id: authUser.id,
      email: authUser.email,
      name: data?.nom || authUser.user_metadata?.nom || "",
      resto: data?.resto || authUser.user_metadata?.resto || "Mon restaurant",
      phone: data?.telephone || authUser.user_metadata?.telephone || "",
      plan: data?.plan || authUser.user_metadata?.plan || "starter",
      aboFin: data?.abonnement_fin || null,
    };
    setUser(u); db.reload(); setPage("admin");
  }
  const logout = async () => { await supabase.auth.signOut(); setUser(null); setUserId(null); setPage("login"); };
  const go = p => { setPage(p); window.scrollTo(0, 0); };
  const locked = !!(user && user.aboFin && new Date(user.aboFin).getTime() < Date.now());
  if (!ready) return <><style>{CSS}</style><div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", gap:18, alignItems:"center", justifyContent:"center", background:BG }}><div className="fu"><Logo size={30} /></div><div className="fu" style={{ animationDelay:".15s" }}><Spinner /></div></div></>;
  return (
    <><style>{CSS}</style>
    <div style={{ minHeight:"100vh", background:"#0B0910", color:"#F2ECE4", fontFamily:"'DM Sans',sans-serif" }}>
      {page === "login" && <Login go={go} onLogged={applySession} />}
      {page === "reset" && <Reset go={go} onLogged={applySession} />}
      {page === "landing" && <Landing go={go} />}
      {page === "pricing" && <Pricing go={go} onPick={p => { setPlan(p); go("signup"); }} />}
      {page === "signup" && <Signup go={go} plan={plan} onLogged={applySession} />}
      {page === "admin" && (locked ? <Renew go={go} user={user} onLogout={logout} /> : <Admin user={user} go={go} onLogout={logout} orders={orders} openGuide={() => setShowGuide(true)} />)}
      {page === "simulator" && (locked ? <Renew go={go} user={user} onLogout={logout} /> : <Simulator go={go} user={user} />)}
      {page === "chatbot" && <Chatbot go={go} user={user} restoId={publicResto || user?.id} isPublic={!!publicResto} />}
      {page === "dashboard" && (locked ? <Renew go={go} user={user} onLogout={logout} /> : <Dashboard go={go} orders={orders} user={user} />)}
      {(page === "mentions" || page === "cgv" || page === "confidentialite") && <Legal doc={page} go={go} />}
      {showGuide && <Guide go={go} onClose={() => setShowGuide(false)} />}
    </div></>
  );
}

// ═════════════════════════════════════════════════════════════════════
// LOGIN
// ═════════════════════════════════════════════════════════════════════
function Login({ go, onLogged }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(""); setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setLoading(false);
    if (error) { setErr("Email ou mot de passe incorrect."); return; }
    if (data?.user) onLogged(data.user);
  }
  async function sendReset(e) {
    e.preventDefault(); setErr(""); setMsg("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr("Entrez une adresse email valide."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setLoading(false);
    if (error) { setErr(error.message || "Erreur lors de l'envoi."); return; }
    setMsg("Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte mail.");
  }
  return (
    <div className="grain" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, position:"relative", background:`radial-gradient(ellipse 70% 45% at 50% 0%, ${R}16, transparent 62%)` }}>
      <div className="fu" style={{ marginBottom:28 }}><Logo size={30} /></div>
      <div className="fu" style={{ width:"100%", maxWidth:392, background:PANEL, border:`1px solid ${LINE2}`, borderRadius:22, padding:30, boxShadow:`0 34px 80px -34px ${R}44, 0 1px 0 #ffffff0a inset`, position:"relative", animationDelay:".06s" }}>
        {mode === "login" ? <>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, marginBottom:6, color:"#fff" }}>Connexion</h2>
          <p style={{ fontSize:13, color:"#8A8295", marginBottom:24 }}>Accédez à votre espace restaurateur.</p>
          <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Field l="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@restaurant.fr" style={I} /></Field>
            <Field l="Mot de passe"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" style={I} /></Field>
            {err && <div style={{ color:"#EF4444", fontSize:13, textAlign:"center" }}>{err}</div>}
            <button type="submit" disabled={loading} style={{ padding:"15px", borderRadius:12, background: loading ? "#34293F" : R, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor: loading ? "not-allowed" : "pointer", marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              {loading ? <><Spinner /> Connexion…</> : "Se connecter →"}
            </button>
          </form>
          <p style={{ textAlign:"center", marginTop:14 }}><span onClick={() => { setMode("forgot"); setErr(""); setMsg(""); }} style={{ fontSize:13, color:"#A89FB0", cursor:"pointer" }}>Mot de passe oublié ?</span></p>
          <div style={{ borderTop:"1px solid #241D2F", marginTop:18, paddingTop:18, textAlign:"center" }}>
            <p style={{ fontSize:13, color:"#8A8295" }}>Pas encore de compte ?</p>
            <span onClick={() => go("pricing")} style={{ fontSize:13, color:R, fontWeight:700, cursor:"pointer" }}>Créer un compte →</span>
            <span onClick={() => go("landing")} style={{ display:"block", marginTop:8, fontSize:12, color:"#6B6378", cursor:"pointer" }}>Découvrir AdBarth</span>
          </div>
        </> : <>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, marginBottom:6, color:"#fff" }}>Mot de passe oublié</h2>
          <p style={{ fontSize:13, color:"#8A8295", marginBottom:24 }}>Entrez votre email, nous vous enverrons un lien pour le réinitialiser.</p>
          <form onSubmit={sendReset} style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Field l="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@restaurant.fr" style={I} /></Field>
            {err && <div style={{ color:"#EF4444", fontSize:13, textAlign:"center" }}>{err}</div>}
            {msg && <div style={{ color:V, fontSize:13, textAlign:"center", lineHeight:1.6 }}>{msg}</div>}
            <button type="submit" disabled={loading} style={{ padding:"15px", borderRadius:12, background: loading ? "#34293F" : R, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor: loading ? "not-allowed" : "pointer", marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              {loading ? <><Spinner /> Envoi…</> : "Envoyer le lien →"}
            </button>
          </form>
          <p style={{ textAlign:"center", marginTop:16 }}><span onClick={() => { setMode("login"); setErr(""); setMsg(""); }} style={{ fontSize:13, color:R, fontWeight:700, cursor:"pointer" }}>← Retour à la connexion</span></p>
        </>}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// RÉINITIALISATION DU MOT DE PASSE (lien reçu par email)
// ═════════════════════════════════════════════════════════════════════
function Reset({ go, onLogged }) {
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  useEffect(() => { try { window.history.replaceState({}, "", window.location.pathname); } catch (e) {} }, []);
  async function submit(e) {
    e.preventDefault(); setErr("");
    if (pass.length < 6) { setErr("Mot de passe trop court (6 caractères minimum)."); return; }
    if (pass !== pass2) { setErr("Les mots de passe ne correspondent pas."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) { setLoading(false); setErr(error.message || "Le lien a peut-être expiré. Recommencez."); return; }
    const { data } = await supabase.auth.getUser();
    setLoading(false); setOkMsg("Mot de passe mis à jour ✓");
    if (data?.user) setTimeout(() => onLogged(data.user), 900);
  }
  return (
    <div className="grain" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, position:"relative", background:`radial-gradient(ellipse 70% 45% at 50% 0%, ${R}16, transparent 62%)` }}>
      <div className="fu" style={{ marginBottom:28 }}><Logo size={30} /></div>
      <div className="fu" style={{ width:"100%", maxWidth:392, background:PANEL, border:`1px solid ${LINE2}`, borderRadius:22, padding:30, boxShadow:`0 34px 80px -34px ${R}44, 0 1px 0 #ffffff0a inset`, position:"relative", animationDelay:".06s" }}>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, marginBottom:6, color:"#fff" }}>Nouveau mot de passe</h2>
        <p style={{ fontSize:13, color:"#8A8295", marginBottom:24 }}>Choisissez un nouveau mot de passe pour votre compte.</p>
        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Field l="Nouveau mot de passe"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="•••••••• (6 min)" style={I} /></Field>
          <Field l="Confirmer le mot de passe"><input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="••••••••" style={I} /></Field>
          {err && <div style={{ color:"#EF4444", fontSize:13, textAlign:"center" }}>{err}</div>}
          {okMsg && <div style={{ color:V, fontSize:13, textAlign:"center", fontWeight:700 }}>{okMsg}</div>}
          <button type="submit" disabled={loading || !!okMsg} style={{ padding:"15px", borderRadius:12, background: (loading || okMsg) ? "#34293F" : R, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor: (loading || okMsg) ? "not-allowed" : "pointer", marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {loading ? <><Spinner /> Mise à jour…</> : okMsg ? "Redirection…" : "Mettre à jour →"}
          </button>
        </form>
        <p style={{ textAlign:"center", marginTop:16 }}><span onClick={() => go("login")} style={{ fontSize:13, color:"#A89FB0", cursor:"pointer" }}>← Annuler</span></p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// LANDING
// ═════════════════════════════════════════════════════════════════════
// Le moment signature : un téléphone qui RACONTE le produit, de l'appel
// manqué jusqu'au ticket qui tombe en cuisine. Boucle douce ; sous
// prefers-reduced-motion, on fige sur l'étape « cuisine » (la promesse).
function HeroScene() {
  const [step, setStep] = useState(RM ? 4 : 0); // 0 sonne · 1 manqué · 2 sms · 3 commande · 4 cuisine
  useEffect(() => {
    if (RM) return;
    const durs = [2000, 1300, 2300, 2400, 2700];
    let i = 0, t;
    const run = () => { t = setTimeout(() => { i = (i + 1) % 5; setStep(i); run(); }, durs[i]); };
    run();
    return () => clearTimeout(t);
  }, []);
  const STAGES = ["Il appelle", "Manqué", "SMS + lien", "Il commande", "En cuisine"];
  const accent = step === 4 ? V : step === 1 ? "#EF4444" : R;
  const bubble = (bg, br, extra = {}) => ({ background:bg, border:br, borderRadius:14, padding:"11px 13px", fontSize:12.5, lineHeight:1.6, color:TXT, ...extra });
  return (
    <div style={{ position:"relative", width:"100%", maxWidth:300, margin:"0 auto" }}>
      {/* halos d'ambiance */}
      <div style={{ position:"absolute", inset:"-12% -18%", background:`radial-gradient(circle at 50% 40%, ${accent}26, transparent 62%)`, filter:"blur(8px)", transition:`background .6s ${EASE}`, pointerEvents:"none" }} />
      {/* téléphone */}
      <div style={{ position:"relative", aspectRatio:"9/17.6", background:`linear-gradient(160deg, #1C1626, #120E18)`, borderRadius:38, border:`2px solid ${accent}`, boxShadow:`0 30px 80px -20px ${accent}55, 0 0 0 1px #ffffff08 inset`, padding:13, transition:`border-color .6s ${EASE}, box-shadow .6s ${EASE}`, animation: RM ? "none" : "floaty 6s ease-in-out infinite" }}>
        <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)", width:74, height:18, background:"#0A0710", borderRadius:12, zIndex:3 }} />
        <div style={{ position:"relative", width:"100%", height:"100%", background:BG, borderRadius:27, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {/* barre d'état */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 18px 4px", fontSize:10, fontWeight:700, color:MUT }}>
            <span style={{ fontFamily:"'Space Mono',monospace" }}>20:47</span>
            <span style={{ display:"flex", gap:4, alignItems:"center" }}><span>📶</span><span>🔋</span></span>
          </div>
          <div key={step} className="fu" style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"6px 16px 16px" }}>
            {step === 0 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ position:"relative", width:96, height:96, margin:"0 auto 18px" }}>
                  {!RM && [0,1].map(k => <span key={k} style={{ position:"absolute", inset:0, borderRadius:"50%", border:`2px solid ${R}`, animation:`ripple 1.8s ${EASE} ${k*0.9}s infinite` }} />)}
                  <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:`linear-gradient(135deg,${R},${OR})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:40 }}>📞</div>
                </div>
                <div style={{ fontSize:11, color:MUT, letterSpacing:1, textTransform:"uppercase", fontWeight:700 }}>Appel entrant</div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:"#fff", marginTop:4 }}>Client</div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, color:MUT, marginTop:2 }}>06 12 •• •• 38</div>
                <div style={{ display:"flex", justifyContent:"center", gap:22, marginTop:24 }}>
                  <div style={{ width:46, height:46, borderRadius:"50%", background:"#EF4444", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>📵</div>
                  <div style={{ width:46, height:46, borderRadius:"50%", background:V, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>📞</div>
                </div>
                <div style={{ fontSize:11, color:FAINT, marginTop:18, fontStyle:"italic" }}>…vous êtes en plein coup de feu 🔥</div>
              </div>
            )}
            {step === 1 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:54, marginBottom:14 }}>📵</div>
                <div style={{ display:"inline-block", background:"#EF444418", border:"1px solid #EF444455", color:"#EF4444", borderRadius:100, padding:"5px 16px", fontSize:13, fontWeight:800 }}>Appel manqué</div>
                <div style={{ fontSize:12, color:MUT, marginTop:18, lineHeight:1.6 }}>Sans AdBarth, ce client<br/>serait déjà ailleurs.</div>
                <div style={{ marginTop:16, fontSize:11, color:V, fontWeight:700 }}>Mais AdBarth veille ⚡</div>
              </div>
            )}
            {step === 2 && (
              <div>
                <div style={{ fontSize:10, fontWeight:800, color:R, letterSpacing:1.4, textTransform:"uppercase", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><span>💬</span> SMS · à l'instant</div>
                <div style={bubble(`linear-gradient(160deg, ${PANEL}, #1d1626)`, `1px solid ${R}45`, { borderRadius:"4px 16px 16px 16px" })}>
                  Bonjour 👋 Désolés de n'avoir pas pu répondre&nbsp;! Commandez ou réservez en ligne ici&nbsp;:
                  <div style={{ marginTop:8, fontFamily:"'Space Mono',monospace", fontSize:11.5, color:R, fontWeight:700, textDecoration:"underline", wordBreak:"break-all" }}>adbarth.fr/le-bistrot ↗</div>
                </div>
                <div style={{ display:"flex", justifyContent:"center", marginTop:18 }}>
                  <div style={{ fontSize:11, color:V, fontWeight:700, display:"inline-flex", alignItems:"center", gap:6 }}><span style={{ width:6, height:6, borderRadius:"50%", background:V, animation: RM?"none":"blink 1.2s infinite" }} /> Envoyé en 3 secondes</div>
                </div>
              </div>
            )}
            {step === 3 && (
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                <div style={{ fontSize:10, fontWeight:800, color:R, letterSpacing:1.4, textTransform:"uppercase", display:"flex", alignItems:"center", gap:6 }}><span>🤖</span> Le Bistrot · Chatbot</div>
                <div style={bubble(PANEL, `1px solid ${LINE}`, { borderRadius:"4px 14px 14px 14px", alignSelf:"flex-start", maxWidth:"86%" })}>Que puis-je pour vous ce soir&nbsp;?</div>
                <div style={bubble(R, "none", { borderRadius:"14px 4px 14px 14px", alignSelf:"flex-end", color:"#fff", fontWeight:600 })}>Un burger + une boisson 🍔</div>
                <div style={{ background:BG2, border:`1px solid ${R}40`, borderRadius:12, padding:"10px 12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:TXT, marginBottom:5 }}><span>🍔 Burger maison ×1</span><span style={{ color:OR, fontWeight:700 }}>13,50€</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:TXT, marginBottom:8 }}><span>🥤 Boisson ×1</span><span style={{ color:OR, fontWeight:700 }}>3,30€</span></div>
                  <div style={{ borderTop:`1px solid ${LINE}`, paddingTop:7, display:"flex", justifyContent:"space-between", fontWeight:800, fontSize:13 }}><span>Total</span><span style={{ color:OR }}>16,80€</span></div>
                </div>
                <div style={{ textAlign:"center", fontSize:11, color:V, fontWeight:800, marginTop:2 }}>✓ Commande envoyée</div>
              </div>
            )}
            {step === 4 && (
              <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"center" }}>
                <div style={{ fontSize:10, fontWeight:800, color:V, letterSpacing:1.4, textTransform:"uppercase", marginBottom:12, display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}><span>🍽️</span> Écran cuisine</div>
                <div style={{ background:`linear-gradient(160deg, ${PANEL}, #141a18)`, border:`1.5px solid ${V}66`, borderRadius:16, padding:14, boxShadow:`0 0 30px ${V}30`, animation: RM ? "none" : "dropIn .7s "+EASE+" both" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <span style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, fontSize:14, color:"#fff" }}>CMD-4821</span>
                    <span style={{ fontSize:10, fontWeight:800, color:V, background:`${V}22`, border:`1px solid ${V}55`, borderRadius:20, padding:"2px 9px" }}>NOUVEAU</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12.5, color:"#D2C9D6" }}>
                    <div>▸ 1× Burger maison</div>
                    <div>▸ 1× Boisson</div>
                  </div>
                  <div style={{ borderTop:`1px solid ${LINE}`, marginTop:10, paddingTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontWeight:800, color:OR, fontSize:15 }}>16,80€</span>
                    <span style={{ fontSize:11, color:MUT }}>à l'instant</span>
                  </div>
                </div>
                <div style={{ textAlign:"center", fontSize:12, fontWeight:800, color:V, marginTop:14, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><span style={{ animation: RM?"none":"bob 1s ease-in-out infinite" }}>🔔</span> Nouvelle commande reçue</div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* fil d'étapes sous le téléphone */}
      <div style={{ display:"flex", justifyContent:"center", gap:5, marginTop:18, flexWrap:"wrap" }}>
        {STAGES.map((s, i) => (
          <span key={i} style={{ fontSize:10, fontWeight:700, padding:"4px 9px", borderRadius:20, color: i === step ? "#fff" : FAINT, background: i === step ? accent : "transparent", border:`1px solid ${i === step ? accent : LINE}`, transition:`all .4s ${EASE}` }}>{s}</span>
        ))}
      </div>
    </div>
  );
}

// Compteur animé pour les stats ("85%", "+34%", "3s"…)
function StatCounter({ raw, label }) {
  const m = String(raw).match(/^([^\d-]*)(-?\d+(?:[.,]\d+)?)(.*)$/);
  const prefix = m ? m[1] : "", num = m ? parseFloat(m[2].replace(",", ".")) : 0, suffix = m ? m[3] : "";
  const [val, ref] = useCountUp(num, 1500);
  return (
    <div style={{ flex:1, minWidth:140, padding:"30px 16px", textAlign:"center", borderRight:"1px solid "+LINE }}>
      <div ref={ref} style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(30px,4.6vw,46px)", fontWeight:800, lineHeight:1, marginBottom:8 }} className="grad-text">{prefix}{Math.round(val)}{suffix}</div>
      <div style={{ fontSize:12.5, color:MUT, fontWeight:500, lineHeight:1.45 }}>{label}</div>
    </div>
  );
}

function Landing({ go }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="grain">
      <nav className="glass" style={{ position:"sticky", top:0, zIndex:100, height:scrolled ? 56 : 66, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 5vw", borderBottom:`1px solid ${scrolled ? LINE : "transparent"}`, transition:`all .35s ${EASE}` }}>
        <Logo />
        <div style={{ display:"flex", gap:10 }}>
          <GhostBtn sm onClick={() => go("login")}>Se connecter</GhostBtn>
          <PrimaryBtn sm onClick={() => go("pricing")}>Commencer →</PrimaryBtn>
        </div>
      </nav>
      <section style={{ position:"relative", overflow:"hidden", padding:"clamp(48px,7vw,96px) 5vw clamp(56px,7vw,88px)" }}>
        <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse 70% 50% at 78% 8%, ${R}1E 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 12% 70%, ${V}10 0%, transparent 55%)`, pointerEvents:"none" }} />
        <div style={{ position:"absolute", inset:0, opacity:.1, backgroundImage:`linear-gradient(${LINE2} 1px,transparent 1px),linear-gradient(90deg,${LINE2} 1px,transparent 1px)`, backgroundSize:"58px 58px", maskImage:"radial-gradient(ellipse 80% 70% at 50% 40%,black,transparent)", pointerEvents:"none" }} />
        <div style={{ position:"relative", maxWidth:1140, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))", gap:"clamp(32px,5vw,60px)", alignItems:"center" }}>
          {/* colonne texte */}
          <div style={{ minWidth:0 }}>
            <div className="fu" style={{ display:"inline-flex", alignItems:"center", gap:8, background:`${R}14`, border:`1px solid ${R}40`, borderRadius:100, padding:"6px 16px", fontSize:11, fontWeight:700, color:R, letterSpacing:"1.2px", textTransform:"uppercase", marginBottom:24 }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:R, animation: RM?"none":"blink 1.4s infinite" }} />
              Pour les restaurants indépendants
            </div>
            <h1 className="fu" style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(38px,7vw,76px)", fontWeight:800, lineHeight:1.02, letterSpacing:"-2.5px", color:"#fff", marginBottom:22, animationDelay:".08s" }}>
              L'appel que vous ratez,<br />on le transforme en <span className="grad-text">commande.</span>
            </h1>
            <p className="fu" style={{ fontSize:"clamp(15px,1.6vw,18px)", color:MUT, maxWidth:480, lineHeight:1.7, marginBottom:34, animationDelay:".18s" }}>
              Quand vous ne pouvez pas répondre, AdBarth envoie un SMS au client. Il commande ou réserve via un simple lien — et le ticket tombe <strong style={{ color:TXT }}>directement en cuisine</strong>.
            </p>
            <div className="fu" style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:22, animationDelay:".26s" }}>
              <PrimaryBtn lg onClick={() => go("pricing")}>Récupérer mes appels manqués →</PrimaryBtn>
              <GhostBtn lg onClick={() => go("simulator")}>▶ Voir la démo</GhostBtn>
            </div>
            <div className="fu" style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap", fontSize:13, color:FAINT, animationDelay:".34s" }}>
              <span><strong style={{ color:TXT }}>Dès 29,90€/mois</strong></span>
              <span style={{ color:LINE2 }}>•</span><span>Sans engagement</span>
              <span style={{ color:LINE2 }}>•</span><span>Prêt en 15 min</span>
            </div>
            <p className="fu" style={{ fontSize:13, color:MUT, marginTop:18, animationDelay:".4s" }}>
              Déjà un compte ? <span onClick={() => go("login")} style={{ color:R, fontWeight:700, cursor:"pointer" }}>Se connecter →</span>
            </p>
          </div>
          {/* colonne scène animée */}
          <div className="fu" style={{ animationDelay:".22s", minWidth:0 }}><HeroScene /></div>
        </div>
      </section>
      <div style={{ display:"flex", flexWrap:"wrap", borderTop:`1px solid ${LINE}`, borderBottom:`1px solid ${LINE}`, background:BG1 }}>
        {[
          { n:"85%", l:"des clients ne rappellent jamais" },
          { n:"3s", l:"délai d'envoi du SMS" },
          { n:"+34%",l:"de commandes récupérées" },
          { n:"0%", l:"de commission sur vos ventes" },
        ].map((s, i) => (<StatCounter key={i} raw={s.n} label={s.l} />))}
      </div>
      <Section dark>
        <SectionHead pill="Comment ça marche" title={"4 étapes.\nZéro effort de votre part."} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:18, maxWidth:880, margin:"0 auto" }}>
          {[
            { n:"01", i:"📵", t:"Appel manqué détecté", d:"Un client appelle. Vous êtes occupé. AdBarth détecte l'appel manqué en temps réel, dès la première sonnerie sans réponse." },
            { n:"02", i:"💬", t:"SMS envoyé en 3 secondes", d:`Le client reçoit un SMS avec un lien cliquable : "Nous n'avons pas pu répondre. Cliquez ici pour commander ou réserver 👉 [lien]"` },
            { n:"03", i:"🤖", t:"Le client clique et commande", d:"Le lien ouvre votre chatbot. Le client choisit sur votre menu, réserve une table ou pose une question, en totale autonomie, 24h/24." },
            { n:"04", i:"🍽️", t:"Commande en cuisine", d:"La commande s'affiche instantanément sur votre écran cuisine. Zéro saisie manuelle, zéro appel, zéro erreur." },
          ].map((s, i) => (
            <Reveal key={s.n} delay={i * 80}>
              <HoverCard>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:38, fontWeight:800, color:`${R}26`, marginBottom:10, lineHeight:1 }}>{s.n}</div>
                <div style={{ fontSize:28, marginBottom:10 }}>{s.i}</div>
                <div style={{ fontSize:14.5, fontWeight:700, marginBottom:8, color:TXT }}>{s.t}</div>
                <div style={{ fontSize:13, color:MUT, lineHeight:1.65 }}>{s.d}</div>
              </HoverCard>
            </Reveal>
          ))}
        </div>
      </Section>
      <Section>
        <SectionHead pill="Pourquoi AdBarth" title={"Zéro commission.\nVos clients restent les vôtres."} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))", gap:16, maxWidth:900, margin:"0 auto" }}>
          {[
            { i:"📱", t:"SMS automatique", d:"Envoyé en 3s après chaque appel manqué. Personnalisé à votre restaurant, à votre ton." },
            { i:"🔗", t:"Lien de commande", d:"Le SMS contient un lien cliquable qui ouvre directement votre chatbot de commande." },
            { i:"🤖", t:"Chatbot de commande", d:"Votre vrai menu, vos catégories. Le client commande ou réserve en totale autonomie." },
            { i:"🍽️", t:"Dashboard cuisine", d:"Commandes et réservations arrivent en temps réel sur votre écran cuisine." },
            { i:"💰", t:"0% de commission", d:"Forfait fixe mensuel. Pas 25-30% prélevés sur chaque commande comme Uber Eats." },
            { i:"🔒", t:"Vos données, vos clients", d:"On ne revend jamais vos contacts. Vos clients restent les vôtres, pas ceux d'une plateforme." },
          ].map((w, i) => (
            <Reveal key={w.t} delay={(i % 3) * 80}>
              <HoverCard subtle>
                <div style={{ width:46, height:46, background:`linear-gradient(135deg,${R}28,${OR}14)`, border:`1px solid ${R}30`, borderRadius:13, display:"flex", alignItems:"center", justifyContent:"center", fontSize:21, marginBottom:14 }}>{w.i}</div>
                <div style={{ fontSize:14.5, fontWeight:700, marginBottom:7, color:TXT }}>{w.t}</div>
                <div style={{ fontSize:13, color:MUT, lineHeight:1.6 }}>{w.d}</div>
              </HoverCard>
            </Reveal>
          ))}
        </div>
      </Section>
      <Section dark>
        <SectionHead pill="Comparaison" title={"AdBarth vs plateformes\nde livraison"} />
        <Reveal style={{ maxWidth:600, margin:"0 auto" }}>
        <div style={{ background:PANEL, border:`1px solid ${LINE}`, borderRadius:22, overflow:"hidden", boxShadow:`0 24px 60px -30px ${R}40` }}>
          <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr 1fr", padding:"12px 18px", background:BG2, borderBottom:`1px solid ${LINE}` }}>
            <div style={{ fontSize:11, color:FAINT, fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Critère</div>
            <div style={{ fontSize:11, color:R, fontWeight:800, textAlign:"center", textTransform:"uppercase", letterSpacing:1 }}>AdBarth</div>
            <div style={{ fontSize:11, color:FAINT, fontWeight:700, textAlign:"center", textTransform:"uppercase", letterSpacing:1 }}>Uber Eats</div>
          </div>
          {[
            { l:"Commission par commande", a:"0%", b:"25–30%" },
            { l:"SMS appel manqué", a:"✓", b:"✗" },
            { l:"Chatbot commande propre", a:"✓", b:"✗" },
            { l:"Dashboard cuisine", a:"✓", b:"✗" },
            { l:"Vos clients restent vôtres", a:"✓",b:"✗" },
            { l:"Coût mensuel", a:"Fixe dès 29,90€", b:"Variable + %" },
          ].map((row, i) => (
            <div key={row.l} style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr 1fr", alignItems:"center", padding:"14px 18px", borderBottom: i < 5 ? `1px solid ${LINE}` : "none" }}>
              <div style={{ fontSize:13, color:"#A89FB0" }}>{row.l}</div>
              <div style={{ fontSize:13.5, fontWeight:800, color:V, textAlign:"center", background:`${V}0C` }}>{row.a}</div>
              <div style={{ fontSize:13, fontWeight:600, color:"#EF4444", textAlign:"center", opacity:.85 }}>{row.b}</div>
            </div>
          ))}
        </div>
        </Reveal>
      </Section>
      <Section>
        <SectionHead pill="Témoignages" title="Ce que disent les restaurateurs" />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:18, maxWidth:880, margin:"0 auto" }}>
          {[
            { t:"Pendant le rush du vendredi on ratait 15-20 appels. Maintenant ces clients reçoivent un SMS et commandent en ligne. On a récupéré des commandes qu'on aurait perdues.", n:"Karim B.", r:"Restaurant · Lyon" },
            { t:"J'étais sur Uber Eats, je payais une fortune en commission. AdBarth m'a coûté 49€ le premier mois et j'ai récupéré mes clients directement. Rentable dès la première semaine.", n:"Sarah M.", r:"Fast-food · Paris" },
            { t:"Le dashboard cuisine a changé notre organisation. Les commandes en ligne arrivent au même endroit, mon équipe ne rate plus rien.", n:"Naïm B.", r:"Fast-food · Marseille" },
          ].map((t, i) => (
            <Reveal key={t.n} delay={i * 90}>
              <div className="lift" style={{ background:PANEL, border:`1px solid ${LINE}`, borderRadius:20, padding:26, height:"100%" }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:34, color:`${R}40`, lineHeight:.6, marginBottom:6 }}>“</div>
                <div style={{ color:OR, fontSize:13, letterSpacing:3, marginBottom:14 }}>★★★★★</div>
                <div style={{ fontSize:14, color:"#D2C9D6", lineHeight:1.72, marginBottom:18 }}>{t.t}</div>
                <div style={{ display:"flex", alignItems:"center", gap:11, paddingTop:14, borderTop:`1px solid ${LINE}` }}>
                  <div style={{ width:38, height:38, borderRadius:"50%", background:`linear-gradient(135deg,${R},${OR})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800, color:"#fff", flexShrink:0 }}>{t.n[0]}</div>
                  <div>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>{t.n}</div>
                    <div style={{ fontSize:11.5, color:MUT }}>{t.r}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>
      <section style={{ position:"relative", overflow:"hidden", padding:"clamp(72px,9vw,110px) 5vw", textAlign:"center" }}>
        <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse 60% 80% at 50% 120%, ${R}22, transparent 60%)`, pointerEvents:"none" }} />
        <Reveal style={{ position:"relative", maxWidth:720, margin:"0 auto" }}>
          <div style={{ fontSize:46, marginBottom:18, animation: RM?"none":"floaty 5s ease-in-out infinite" }}>🍳</div>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(30px,5vw,58px)", fontWeight:800, letterSpacing:"-1.8px", lineHeight:1.05, marginBottom:18, color:"#fff" }}>
            Prêt à ne plus rater<br/><span className="grad-text">aucun client&nbsp;?</span>
          </h2>
          <p style={{ color:MUT, fontSize:16, marginBottom:34 }}>Installation en 15 minutes. Sans engagement. Sans commission.</p>
          <PrimaryBtn lg onClick={() => go("pricing")}>Démarrer maintenant →</PrimaryBtn>
        </Reveal>
      </section>
      <footer style={{ borderTop:`1px solid ${LINE}`, padding:"32px 5vw", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16, background:BG1 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <Logo />
          <div style={{ fontSize:12, color:FAINT }}>L'appel manqué qui devient une commande.</div>
        </div>
        <div style={{ fontSize:13, color:FAINT }}>© 2025 AdBarth · Tous droits réservés</div>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
          {[{ l:"Mentions légales", p:"mentions" }, { l:"CGV", p:"cgv" }, { l:"Confidentialité", p:"confidentialite" }].map(x => (<span key={x.p} onClick={() => go(x.p)} style={{ fontSize:13, color:MUT, cursor:"pointer", transition:`color .2s ${EASE}` }} onMouseEnter={e=>e.currentTarget.style.color=R} onMouseLeave={e=>e.currentTarget.style.color=MUT}>{x.l}</span>))}
        </div>
      </footer>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PRICING
// ═════════════════════════════════════════════════════════════════════
function Pricing({ go, onPick }) {
  return (
    <div className="grain" style={{ minHeight:"100vh", paddingBottom:60, background:`radial-gradient(ellipse 60% 40% at 50% 0%, ${R}10, transparent 60%)` }}>
      <StepNav title="Choisissez votre plan" onBack={() => go("landing")} step={1} of={2} />
      <div style={{ padding:"clamp(36px,6vw,56px) 20px 40px", maxWidth:980, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(26px,4vw,44px)", fontWeight:800, letterSpacing:"-1.4px", marginBottom:12 }}>Simple. Transparent. <span className="grad-text">Sans surprise.</span></h2>
          <p style={{ color:MUT, fontSize:15.5, maxWidth:480, margin:"0 auto" }}>Pas de commission sur vos commandes. Pas de frais cachés. Juste un forfait fixe.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(255px,1fr))", gap:20, alignItems:"start" }}>
          {PLANS.map((p, i) => (<Reveal key={p.key} delay={i * 90} style={{ height:"100%" }}><PlanCard p={p} onPick={onPick} /></Reveal>))}
        </div>
        <p style={{ textAlign:"center", fontSize:13, color:MUT, marginTop:30 }}>
          Déjà un compte ? <span onClick={() => go("login")} style={{ color:R, fontWeight:700, cursor:"pointer" }}>Se connecter →</span>
        </p>
      </div>
    </div>
  );
}
function PlanCard({ p, onPick }) {
  const [hov, setHov] = useState(false);
  return (
    <div className="lift" onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ height:"100%", background: p.popular ? `linear-gradient(170deg, #1d1626, ${PANEL})` : PANEL, border:`1.5px solid ${p.popular ? R : hov ? R+"55" : LINE}`, borderRadius:24, padding:30, position:"relative", transform: hov ? "translateY(-6px)" : "none", boxShadow: p.popular ? `0 24px 60px -26px ${R}77` : hov ? `0 18px 44px -26px ${R}55` : "none" }}>
      {p.popular && (<div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", background:`linear-gradient(135deg,${R},${OR})`, color:"#fff", padding:"5px 18px", borderRadius:100, fontSize:11, fontWeight:800, whiteSpace:"nowrap", boxShadow:`0 8px 20px -6px ${R}88` }}>⭐ Le plus choisi</div>)}
      <div style={{ fontSize:12, fontWeight:700, color: p.popular ? R : MUT, textTransform:"uppercase", letterSpacing:1.2, marginBottom:12 }}>{p.name}</div>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:50, fontWeight:800, color:"#fff", lineHeight:1, marginBottom:4 }}>
        <sup style={{ fontSize:21, verticalAlign:"top", marginTop:9, display:"inline-block", color:MUT }}>€</sup>{p.price.toFixed(2).replace(".", ",")}
      </div>
      <div style={{ fontSize:13, color:MUT, marginBottom:24 }}>par mois · sans engagement</div>
      <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:11, marginBottom:26 }}>
        {p.features.map(f => (<li key={f} style={{ fontSize:13, color:TXT, display:"flex", gap:10, alignItems:"flex-start", lineHeight:1.45 }}><span style={{ color:V, fontWeight:800, flexShrink:0 }}>✓</span>{f}</li>))}
        {p.missing.map(f => (<li key={f} style={{ fontSize:13, color:FAINT, display:"flex", gap:10, alignItems:"flex-start", lineHeight:1.45 }}><span style={{ flexShrink:0 }}>—</span>{f}</li>))}
      </ul>
      <button onClick={() => onPick(p)} className="sheen" style={{ width:"100%", padding:"15px", borderRadius:13, background: p.popular ? `linear-gradient(135deg,${R},${OR})` : "transparent", color: p.popular ? "#fff" : TXT, border: p.popular ? "none" : `1.5px solid ${hov ? R+"77" : LINE2}`, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer", boxShadow: p.popular ? `0 8px 22px -10px ${R}88` : "none" }}>Choisir ce plan →</button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SIGNUP
// ═════════════════════════════════════════════════════════════════════
function Signup({ go, plan, onLogged }) {
  const [f, setF] = useState({ name:"", email:"", phone:"", resto:"", pass:"", pass2:"" });
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const chosenPlan = plan || PLANS[1];
  async function submit(e) {
    e.preventDefault();
    if (!f.name || !f.email || !f.resto || !f.pass) { setErr("Remplissez tous les champs obligatoires."); return; }
    if (f.pass !== f.pass2) { setErr("Les mots de passe ne correspondent pas."); return; }
    if (f.pass.length < 6) { setErr("Mot de passe trop court (6 caractères minimum)."); return; }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email);
    if (!emailOk) { setErr("Adresse email invalide."); return; }
    if (!consent) { setErr("Vous devez accepter les CGV et la politique de confidentialité."); return; }
    setErr(""); setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(), password: f.pass,
      options: { data: { nom: sanitizeText(f.name, 60), resto: sanitizeText(f.resto, 60), telephone: sanitizeText(f.phone, 20), plan: chosenPlan.key } },
    });
    setLoading(false);
    if (error) {
      if ((error.message || "").toLowerCase().includes("already")) { setErr("Cet email a déjà un compte. Connectez-vous plutôt."); }
      else { setErr(error.message || "Erreur lors de l'inscription."); }
      return;
    }
    if (data?.user) {
      await supabase.from("comptes").update({ plan: chosenPlan.key, prix: Math.round(chosenPlan.price) }).eq("id", data.user.id);
      if (data.session) { onLogged(data.user); }
      else { setErr("Compte créé ! Vérifiez votre email pour confirmer, puis connectez-vous."); }
    }
  }
  return (
    <div className="grain" style={{ minHeight:"100vh", paddingBottom:60, background:`radial-gradient(ellipse 60% 36% at 50% 0%, ${R}10, transparent 60%)` }}>
      <StepNav title="Créer votre compte" onBack={() => go("pricing")} step={2} of={2} />
      <div style={{ padding:"clamp(28px,5vw,40px) 20px", maxWidth:460, margin:"0 auto" }}>
        <div className="fu" style={{ background:`linear-gradient(135deg, ${R}14, ${PANEL})`, border:`1px solid ${R}40`, borderRadius:16, padding:"16px 20px", marginBottom:22, display:"flex", justifyContent:"space-between", alignItems:"center", boxShadow:`0 18px 44px -28px ${R}66` }}>
          <div>
            <div style={{ fontSize:11.5, color:MUT, fontWeight:700, textTransform:"uppercase", letterSpacing:.8 }}>Plan sélectionné</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:21, fontWeight:800, color:R, marginTop:3 }}>{chosenPlan.name}</div>
          </div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:25, fontWeight:800 }}>{chosenPlan.price.toFixed(2).replace(".", ",")}€<span style={{ fontSize:12, color:MUT, fontWeight:600 }}>/mois</span></div>
        </div>
        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:13 }}>
          <Field l="Prénom & Nom *"><input value={f.name} onChange={e => setF(v => ({ ...v, name:e.target.value }))} placeholder="Jean Dupont" style={I} /></Field>
          <Field l="Adresse email *"><input type="email" value={f.email} onChange={e => setF(v => ({ ...v, email:e.target.value }))} placeholder="jean@monrestaurant.fr" style={I} /></Field>
          <Field l="Téléphone (optionnel)"><input value={f.phone} onChange={e => setF(v => ({ ...v, phone:e.target.value }))} placeholder="+33 6 00 11 22 33" style={I} /></Field>
          <Field l="Nom de votre restaurant *"><input value={f.resto} onChange={e => setF(v => ({ ...v, resto:e.target.value }))} placeholder="Le Petit Bistrot" style={I} /></Field>
          <Field l="Mot de passe *"><input type="password" value={f.pass} onChange={e => setF(v => ({ ...v, pass:e.target.value }))} placeholder="•••••••• (6 min)" style={I} /></Field>
          <Field l="Confirmer le mot de passe *"><input type="password" value={f.pass2} onChange={e => setF(v => ({ ...v, pass2:e.target.value }))} placeholder="••••••••" style={I} /></Field>
          <label style={{ display:"flex", gap:11, alignItems:"flex-start", cursor:"pointer", fontSize:12.5, color:MUT, lineHeight:1.6, marginTop:2 }}>
            <span onClick={() => setConsent(c => !c)} style={{ flexShrink:0, width:22, height:22, borderRadius:7, border:`1.5px solid ${consent ? R : LINE2}`, background: consent ? R : "transparent", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:14, fontWeight:900, transition:`all .18s ${EASE}`, marginTop:1 }}>{consent ? "✓" : ""}</span>
            <span onClick={() => setConsent(c => !c)}>J'accepte les <span onClick={e => { e.stopPropagation(); go("cgv"); }} style={{ color:"#A89FB0", textDecoration:"underline" }}>CGV</span> et la <span onClick={e => { e.stopPropagation(); go("confidentialite"); }} style={{ color:"#A89FB0", textDecoration:"underline" }}>politique de confidentialité</span>.</span>
          </label>
          {err && <div style={{ color: err.startsWith("Compte créé") ? V : "#EF4444", fontSize:13, textAlign:"center", padding:"6px 0" }}>{err}</div>}
          <button type="submit" disabled={loading} style={{ padding:"15px", borderRadius:12, background: loading ? "#34293F" : R, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor: loading ? "not-allowed" : "pointer", marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {loading ? <><Spinner /> Création…</> : "Créer mon compte →"}
          </button>
          <p style={{ textAlign:"center", fontSize:12 }}><span onClick={() => go("login")} style={{ color:R, fontWeight:700, cursor:"pointer" }}>Déjà un compte ? Se connecter</span></p>
        </form>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// ADMIN
// ═════════════════════════════════════════════════════════════════════
function Admin({ user, go, onLogout, orders = [], openGuide }) {
  const planName = (PLANS.find(p => p.key === user?.plan) || PLANS[0]).name;
  const planPrice = (PLANS.find(p => p.key === user?.plan) || PLANS[0]).price;
  const [tab, setTab] = useState("infos");
  const [cfg, setCfg] = useState({
    name: user?.resto || "", phone: user?.phone || "", address: "",
    hours1: "12:00 – 14:30", hours2: "19:00 – 23:30", color: R, active: true, onlyHours: false,
    sms: "Bonjour ! {nom} n'a pas pu répondre à votre appel. Commandez ou réservez en ligne 👉 {lien}",
    welcome: "Bonjour ! 👋 Bienvenue chez {nom}. Que puis-je faire pour vous ?",
    link: (typeof window !== "undefined" && user?.id) ? `${window.location.origin}/?r=${user.id}` : "https://adbarth.fr",
  });
  const [menu, setMenu] = useState([]);
  const [cats, setCats] = useState(["Entrées", "Plats", "Desserts", "Boissons"]);
  const [form, setForm] = useState({ cat:"", name:"", price:"", emoji:"🍔", desc:"", ingredients:"" });
  const [editId, setEditId] = useState(null);
  const [newCat, setNewCat] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const [showEm, setShowEm] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      const { data } = await supabase.from("comptes").select("config, menu, cats, resto").eq("id", user.id).single();
      if (!alive || !data) return;
      const loaded = data.config || {};
      const name = loaded.name || data.resto || user.resto || "";
      const slug = restoSlug(name, user.id);
      const origin = typeof window !== "undefined" ? window.location.origin : "https://adbarth.fr";
      const link = `${origin}/?r=${slug}`;
      setCfg(c => ({ ...c, ...loaded, slug, link }));
      if (Array.isArray(data.menu)) setMenu(data.menu);
      if (Array.isArray(data.cats) && data.cats.length) setCats(data.cats);
      // Le slug est stocké dans la config (donc visible par la vitrine publique) :
      // on l'enregistre tout de suite s'il manque, pour que le lien marche sans sauvegarde manuelle.
      if (loaded.slug !== slug) { try { await supabase.from("comptes").update({ config: { ...loaded, slug, link } }).eq("id", user.id); } catch (e) {} }
    })();
    return () => { alive = false; };
  }, []);
  // Ouvre le guide d'utilisation automatiquement à la toute première connexion
  useEffect(() => {
    try { if (openGuide && !localStorage.getItem("adbarth_guide_seen")) { openGuide(); localStorage.setItem("adbarth_guide_seen", "1"); } } catch (e) {}
  }, []);
  const accent = cfg.color;
  const publicLink = (typeof window !== "undefined" && user?.id) ? `${window.location.origin}/?r=${cfg.slug || user.id}` : "";
  const aboFin = user?.aboFin ? new Date(user.aboFin) : null;
  const daysLeft = aboFin ? Math.ceil((aboFin.getTime() - Date.now()) / 86400000) : null;
  useEffect(() => { if (tab === "stats") db.reload(); }, [tab]);
  const cmdList = orders.filter(o => o.type === "commande");
  const resList = orders.filter(o => o.type === "reservation");
  const ca = cmdList.reduce((s, o) => s + (parseFloat(String(o.total).replace(/[^\d.,]/g, "").replace(",", ".")) || 0), 0);
  async function save() {
    try {
      if (user?.id) {
        // Le lien client suit le nom du restaurant
        const slug = restoSlug(cfg.name || user.resto, user.id);
        const origin = typeof window !== "undefined" ? window.location.origin : "https://adbarth.fr";
        const cfg2 = { ...cfg, slug, link: `${origin}/?r=${slug}` };
        setCfg(cfg2);
        await supabase.from("comptes").update({ config: cfg2, menu, cats }).eq("id", user.id);
      }
      setSaved(true); setToast("✓ Modifications enregistrées");
    } catch (e) {
      setToast("⚠️ Échec de l'enregistrement");
    }
    setTimeout(() => { setSaved(false); setToast(""); }, 2600);
  }
  function addItem() {
    if (!form.name || !form.price || !form.cat) return;
    const price = validPrice(form.price);
    if (price === null) { setToast("⚠️ Prix invalide (entre 0 et 1000 €)"); setTimeout(() => setToast(""), 2800); return; }
    const ingredients = String(form.ingredients || "").split(",").map(s => sanitizeText(s, 30)).filter(Boolean).slice(0, 12);
    const clean = { ...form, name: sanitizeText(form.name, 60), desc: sanitizeText(form.desc, LIMITS.text), price: String(price), ingredients };
    if (editId !== null) { setMenu(m => m.map(i => i.id === editId ? { ...clean, id:editId, on:true } : i)); setEditId(null); }
    else { setMenu(m => [...m, { ...clean, id: uid(), on:true }]); }
    setForm({ cat:form.cat, name:"", price:"", emoji:"🍔", desc:"", ingredients:"" });
  }
  function startEdit(item) {
    setForm({ cat:item.cat, name:item.name, price:item.price, emoji:item.emoji, desc:item.desc, ingredients: Array.isArray(item.ingredients) ? item.ingredients.join(", ") : "" });
    setEditId(item.id); setTab("menu");
    setTimeout(() => document.getElementById("mform")?.scrollIntoView({ behavior:"smooth" }), 120);
  }
  const grouped = cats.reduce((acc, cat) => { const items = menu.filter(i => i.cat === cat); if (items.length) acc[cat] = items; return acc; }, {});
  const TABS = [
    { k:"infos", i:"🏪", l:"Restaurant" }, { k:"sms", i:"💬", l:"SMS" },
    { k:"chatbot", i:"🤖", l:"Chatbot" }, { k:"menu", i:"🍽️", l:"Menu" }, { k:"stats", i:"📊", l:"Stats" },
  ];
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:"100%", margin:"0 auto" }}>
      {toast && (<div className="fu" style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:V, color:"#fff", padding:"10px 24px", borderRadius:22, fontSize:13, fontWeight:700, zIndex:300, maxWidth:"90%", textAlign:"center" }}>{toast}</div>)}
      <div className="glass" style={{ borderBottom:`1px solid ${LINE}`, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:20, gap:12, flexWrap:"wrap" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Logo size={16} />
            <span style={{ fontSize:10, fontWeight:700, color:MUT, background:LINE, border:`1px solid ${LINE2}`, borderRadius:20, padding:"2px 10px", letterSpacing:.5 }}>ADMIN</span>
            <span style={{ fontSize:10, fontWeight:800, color:R, background:`${R}18`, border:`1px solid ${R}45`, borderRadius:20, padding:"2px 10px" }}>{planName}</span>
          </div>
          <div style={{ fontSize:11, color:MUT, marginTop:3 }}>{cfg.name || user?.resto}</div>
        </div>
        <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" }}>
          <AdminBtn color={OR} onClick={() => openGuide && openGuide()}>❓ Guide</AdminBtn>
          <AdminBtn color={R} onClick={() => go("simulator")}>📞 Test</AdminBtn>
          <AdminBtn color={V} onClick={() => go("chatbot")}>💬 Chatbot</AdminBtn>
          <AdminBtn color="#3B82F6" onClick={() => go("dashboard")}>🍽️ Cuisine</AdminBtn>
          <AdminBtn color="#A89FB0" onClick={onLogout}>⏻ Déco</AdminBtn>
          <ToggleSwitch value={cfg.active} onChange={v => setCfg(c => ({ ...c, active:v }))} accent={V} />
        </div>
      </div>
      <div style={{ background:`linear-gradient(135deg,${accent}18,${accent}06)`, borderBottom:`1px solid ${accent}30`, padding:"12px 18px", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:22 }}>🎉</span>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:accent }}>Bienvenue, {user?.name?.split(" ")[0] || "cher restaurateur"} !</div>
          <div style={{ fontSize:12, color:"#A89FB0", marginTop:1 }}>Commencez par renseigner les infos de votre restaurant, puis ajoutez votre menu.</div>
        </div>
      </div>
      {daysLeft !== null && daysLeft <= 5 && (
        <div style={{ background:`${OR}18`, borderBottom:`1px solid ${OR}50`, padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, fontWeight:700, color:OR }}>⏳ Votre abonnement expire dans {daysLeft <= 0 ? "moins d'un jour" : `${daysLeft} jour${daysLeft > 1 ? "s" : ""}`}.</span>
          <button type="button" onClick={payerAbonnement} style={{ padding:"7px 14px", borderRadius:20, background:R, color:"#fff", fontSize:12, fontWeight:700, border:"none", cursor:"pointer", fontFamily:"inherit" }}>Renouveler →</button>
        </div>
      )}
      <div style={{ display:"flex", background:BG, borderBottom:`1px solid ${LINE}`, overflowX:"auto", position:"sticky", top:0, zIndex:15 }}>
        {TABS.map(t => { const on = tab === t.k; return (<button key={t.k} onClick={() => setTab(t.k)} style={{ flex:1, minWidth:62, padding:"11px 4px 9px", background: on ? `${accent}12` : "none", border:"none", borderBottom: on ? `2px solid ${accent}` : "2px solid transparent", color: on ? accent : MUT, fontSize:10, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:`all .25s ${EASE}` }}><span style={{ fontSize:17, filter: on ? "none" : "grayscale(.4) opacity(.8)" }}>{t.i}</span>{t.l}</button>); })}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"18px 16px", display:"flex", flexDirection:"column", gap:16, width:"100%", maxWidth:880, margin:"0 auto" }}>
        {tab === "infos" && <>
          <STitle>Informations du restaurant</STitle>
          <Card>
            <Field l="Nom du restaurant"><input value={cfg.name} onChange={e => setCfg(c => ({ ...c, name:e.target.value }))} placeholder="Le Petit Bistrot" style={I} /></Field>
            <Field l="Téléphone"><input value={cfg.phone} onChange={e => setCfg(c => ({ ...c, phone:e.target.value }))} placeholder="+33 6 00 00 00 00" style={I} /></Field>
            <Field l="Adresse"><input value={cfg.address} onChange={e => setCfg(c => ({ ...c, address:e.target.value }))} placeholder="12 rue de la Paix, 75002 Paris" style={I} /></Field>
          </Card>
          <Card>
            <Field l="Horaires service du midi"><input value={cfg.hours1} onChange={e => setCfg(c => ({ ...c, hours1:e.target.value }))} style={I} /></Field>
            <Field l="Horaires service du soir"><input value={cfg.hours2} onChange={e => setCfg(c => ({ ...c, hours2:e.target.value }))} style={I} /></Field>
            <Field l="Lien chatbot (généré automatiquement)"><input value={cfg.link} onChange={e => setCfg(c => ({ ...c, link:e.target.value }))} style={I} /></Field>
          </Card>
          <Card>
            <Field l="Couleur principale de votre restaurant">
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <input type="color" value={cfg.color} onChange={e => setCfg(c => ({ ...c, color:e.target.value }))} style={{ width:50, height:50, border:"none", background:"none", cursor:"pointer", borderRadius:10, padding:0 }} />
                <span style={{ fontSize:14, fontWeight:600, fontFamily:"monospace", color:"#F2ECE4" }}>{cfg.color}</span>
                <div style={{ flex:1, height:38, borderRadius:10, background:cfg.color, boxShadow:`0 4px 18px ${cfg.color}60` }} />
              </div>
            </Field>
          </Card>
          <Card>
            <div style={{ fontSize:13, fontWeight:700, color:accent, marginBottom:4 }}>🔗 Votre lien client personnalisé</div>
            <p style={{ fontSize:12, color:"#8A8295", lineHeight:1.6 }}>À envoyer par SMS. Il porte le nom de votre restaurant — vos clients l'ouvrent sans compte et commandent directement. Il se met à jour automatiquement si vous renommez votre restaurant.</p>
            <div style={{ background:"#130F1A", border:"1px solid #34293F", borderRadius:10, padding:"10px 12px", fontSize:12, color:"#F2ECE4", wordBreak:"break-all", fontFamily:"monospace" }}>{publicLink || "Connectez-vous pour générer votre lien"}</div>
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(publicLink); setToast("✓ Lien copié"); setTimeout(() => setToast(""), 2000); } catch (e) { setToast("Copie impossible, sélectionnez le lien"); setTimeout(() => setToast(""), 2500); } }} style={{ flex:1, padding:"11px", borderRadius:10, background:accent, color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>📋 Copier le lien</button>
              <button type="button" onClick={() => publicLink && window.open(publicLink, "_blank")} style={{ padding:"11px 16px", borderRadius:10, background:"#241D2F", color:"#F2ECE4", border:"1px solid #34293F", fontWeight:700, fontSize:13, cursor:"pointer" }}>Ouvrir ↗</button>
            </div>
          </Card>
          <SaveBtn saved={saved} onClick={save} accent={accent} />
        </>}
        {tab === "sms" && <>
          <STitle>Configuration SMS automatique</STitle>
          <Card>
            <div style={{ fontSize:11, fontWeight:700, color:V, letterSpacing:1, marginBottom:8 }}>VARIABLES DISPONIBLES</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
              {["{nom}", "{lien}", "{horaires}"].map(v => (<span key={v} style={{ background:"#241D2F", border:"1px solid #34293F", borderRadius:8, padding:"4px 10px", fontSize:12, color:accent, fontWeight:700, fontFamily:"monospace" }}>{v}</span>))}
            </div>
            <p style={{ fontSize:12, color:"#6B6378" }}>{"{lien}"} = lien cliquable qui ouvre votre chatbot</p>
          </Card>
          <Card>
            <Field l="Message SMS envoyé au client"><textarea value={cfg.sms} onChange={e => setCfg(c => ({ ...c, sms:e.target.value }))} rows={4} maxLength={320} style={{ ...I, resize:"none", lineHeight:1.7 }} /></Field>
          </Card>
          <Card>
            <div style={{ fontSize:11, fontWeight:700, color:"#8A8295", letterSpacing:1, marginBottom:12 }}>APERÇU SMS REÇU PAR LE CLIENT</div>
            <div style={{ background:"#130F1A", borderRadius:"16px 16px 16px 4px", padding:"14px 16px", fontSize:14, lineHeight:1.8, border:"1px solid #241D2F", wordBreak:"break-word", color:"#F2ECE4" }}>
              {cfg.sms.replace("{nom}", cfg.name || "Votre resto").replace("{horaires}", `${cfg.hours1} / ${cfg.hours2}`).split("{lien}").map((part, i, arr) => i < arr.length - 1 ? <span key={i}>{part}<span style={{ color:accent, textDecoration:"underline", fontWeight:700 }}>{cfg.link}</span></span> : <span key={i}>{part}</span>)}
            </div>
          </Card>
          <Card><Toggle label="Envoyer uniquement pendant les heures d'ouverture" sub={`${cfg.hours1} et ${cfg.hours2}`} value={cfg.onlyHours} onChange={v => setCfg(c => ({ ...c, onlyHours:v }))} accent={accent} /></Card>
          <SaveBtn saved={saved} onClick={save} accent={accent} />
        </>}
        {tab === "chatbot" && <>
          <STitle>Configuration du chatbot client</STitle>
          <Card>
            <Field l="Message d'accueil"><textarea value={cfg.welcome} onChange={e => setCfg(c => ({ ...c, welcome:e.target.value }))} rows={3} maxLength={200} style={{ ...I, resize:"none", lineHeight:1.7 }} /></Field>
          </Card>
          <Card>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>Fonctionnalités activées</div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <Toggle label="🍔 Prise de commande à emporter" value={true} accent={V} />
              <Toggle label="📅 Réservation de table" value={true} accent={V} />
              <Toggle label="❓ Réponses automatiques aux questions" value={true} accent={V} />
            </div>
          </Card>
          <SaveBtn saved={saved} onClick={save} accent={accent} />
        </>}
        {tab === "menu" && <>
          <STitle>Gestion du menu</STitle>
          <Card>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Catégories</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
              {cats.map(cat => (<span key={cat} style={{ background:"#241D2F", border:`1px solid ${accent}45`, borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:700, color:accent, display:"flex", alignItems:"center", gap:6 }}>{cat} <span onClick={() => setCats(cs => cs.filter(x => x !== cat))} style={{ cursor:"pointer", color:"#8A8295", fontWeight:900, fontSize:15, lineHeight:1 }}>×</span></span>))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nouvelle catégorie…" onKeyDown={e => { if (e.key === "Enter" && newCat.trim()) { setCats(c => [...c, newCat.trim()]); setNewCat(""); } }} style={{ ...I, flex:1 }} />
              <button onClick={() => { if (newCat.trim()) { setCats(c => [...c, newCat.trim()]); setNewCat(""); } }} style={{ padding:"10px 18px", borderRadius:10, background:accent, color:"#fff", border:"none", fontWeight:700, fontSize:16, cursor:"pointer" }}>+</button>
            </div>
          </Card>
          <Card id="mform">
            <div style={{ fontSize:13, fontWeight:700, color:accent, marginBottom:10 }}>{editId !== null ? "✏️ Modifier l'article" : "➕ Ajouter un article"}</div>
            <Field l="Emoji">
              <div>
                <button type="button" onClick={() => setShowEm(v => !v)} style={{ background:"#130F1A", border:"1.5px solid #34293F", borderRadius:10, padding:"9px 14px", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", gap:8, color:"#F2ECE4" }}>{form.emoji} <span style={{ fontSize:12, color:"#8A8295" }}>Changer ▾</span></button>
                {showEm && (<div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:10, background:"#130F1A", border:"1px solid #34293F", borderRadius:12, padding:12, maxHeight:150, overflowY:"auto" }}>{EMOJIS.map(em => (<button key={em} type="button" onClick={() => { setForm(f => ({ ...f, emoji:em })); setShowEm(false); }} style={{ fontSize:22, background:"none", border:"none", cursor:"pointer", padding:5, borderRadius:8 }}>{em}</button>))}</div>)}
              </div>
            </Field>
            <Field l="Catégorie">
              <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat:e.target.value }))} style={I}><option value="">Choisir une catégorie…</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>
            </Field>
            <Field l="Nom du plat"><input value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder="ex: Magret de canard" maxLength={60} style={I} /></Field>
            <Field l="Prix (€)"><input value={form.price} onChange={e => setForm(f => ({ ...f, price:e.target.value }))} placeholder="ex: 18.50" type="number" step="0.01" min="0" max="1000" style={I} /></Field>
            <Field l="Description (optionnel)"><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc:e.target.value }))} placeholder="ex: Pommes sarladaises" maxLength={120} style={I} /></Field>
            <Field l="Ingrédients modifiables (optionnel)">
              <input value={form.ingredients} onChange={e => setForm(f => ({ ...f, ingredients:e.target.value }))} placeholder="ex: cornichon, oignon, sauce, cheddar" maxLength={200} style={I} />
              <p style={{ fontSize:11, color:"#6B6378", marginTop:5, lineHeight:1.5 }}>Séparés par des virgules. Le client pourra dire « sans cornichon » dans le chatbot. Laissez vide si le plat n'est pas personnalisable.</p>
            </Field>
            <div style={{ display:"flex", gap:10 }}>
              <button type="button" onClick={addItem} style={{ flex:1, padding:"12px", borderRadius:12, background:accent, color:"#fff", border:"none", fontWeight:700, fontSize:14, cursor:"pointer" }}>{editId !== null ? "✓ Mettre à jour" : "➕ Ajouter au menu"}</button>
              {editId !== null && (<button type="button" onClick={() => { setEditId(null); setForm({ cat:"", name:"", price:"", emoji:"🍔", desc:"", ingredients:"" }); }} style={{ padding:"12px 14px", borderRadius:12, background:"#241D2F", color:"#A89FB0", border:"1px solid #34293F", fontWeight:700, fontSize:13, cursor:"pointer" }}>Annuler</button>)}
            </div>
          </Card>
          {menu.length === 0 && (<div style={{ textAlign:"center", color:"#6B6378", padding:"32px 0" }}><div style={{ fontSize:36, marginBottom:10 }}>🍽️</div><div style={{ fontSize:14 }}>Votre menu est vide.<br />Ajoutez votre premier plat ci-dessus.</div></div>)}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div style={{ fontSize:10, fontWeight:700, color:"#8A8295", textTransform:"uppercase", letterSpacing:1.5, marginBottom:10, paddingLeft:4 }}>{cat} · {items.length} article{items.length > 1 ? "s" : ""}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {items.map(item => (
                  <div key={item.id} className="fu" style={{ background: item.on ? "#181320" : "#0E0B14", border:`1px solid ${item.on ? "#34293F" : "#241D2F"}`, borderRadius:14, padding:14, display:"flex", alignItems:"center", gap:12, opacity: item.on ? 1 : .45 }}>
                    <span style={{ fontSize:26, flexShrink:0 }}>{item.emoji}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#F2ECE4" }}>{item.name}</div>
                      {item.desc && <div style={{ fontSize:11, color:"#8A8295", marginTop:2 }}>{item.desc}</div>}
                      {Array.isArray(item.ingredients) && item.ingredients.length > 0 && <div style={{ fontSize:10.5, color:V, marginTop:2, fontWeight:600 }}>✨ {item.ingredients.length} ingrédient{item.ingredients.length > 1 ? "s" : ""} modifiable{item.ingredients.length > 1 ? "s" : ""}</div>}
                      <div style={{ fontSize:13, fontWeight:800, color:OR, marginTop:5 }}>{item.price}€</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                      <button type="button" onClick={() => setMenu(m => m.map(i => i.id === item.id ? { ...i, on:!i.on } : i))} style={{ padding:"5px 10px", borderRadius:8, fontSize:10, fontWeight:700, background: item.on ? `${V}20` : "#8A829520", border:`1px solid ${item.on ? V+"45" : "#8A829545"}`, color: item.on ? V : "#A89FB0", cursor:"pointer" }}>{item.on ? "Actif" : "Caché"}</button>
                      <button type="button" onClick={() => startEdit(item)} style={{ padding:"5px 10px", borderRadius:8, fontSize:10, fontWeight:700, background:"#241D2F", border:"1px solid #34293F", color:"#F2ECE4", cursor:"pointer" }}>✏️ Éditer</button>
                      <button type="button" onClick={() => setMenu(m => m.filter(i => i.id !== item.id))} style={{ padding:"5px 10px", borderRadius:8, fontSize:10, fontWeight:700, background:"#EF444420", border:"1px solid #EF444440", color:"#EF4444", cursor:"pointer" }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <SaveBtn saved={saved} onClick={save} accent={accent} />
        </>}
        {tab === "stats" && <>
          <STitle>Statistiques du mois</STitle>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[{ l:"Commandes", v:String(cmdList.length), i:"🍔" },{ l:"Réservations", v:String(resList.length), i:"📅" },{ l:"CA commandes", v:`${ca.toFixed(2).replace(".", ",")}€`, i:"💰" },{ l:"Total reçus", v:String(orders.length), i:"📈" },{ l:"SMS envoyés", v:"—", i:"💬" },{ l:"Clics chatbot", v:"—", i:"👆" }].map(s => (<div key={s.l} className="lift" style={{ background:`linear-gradient(160deg, ${PANEL}, ${BG2})`, border:`1px solid ${LINE}`, borderRadius:18, padding:"20px 16px" }}><div style={{ fontSize:23, marginBottom:10 }}>{s.i}</div><div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color:accent, lineHeight:1 }}>{s.v}</div><div style={{ fontSize:11.5, color:MUT, marginTop:8, fontWeight:600 }}>{s.l}</div></div>))}
          </div>
          <p style={{ fontSize:11, color:"#6B6378", textAlign:"center", lineHeight:1.6 }}>« SMS envoyés » et « Clics » s'afficheront quand le vrai système SMS sera branché.</p>
          <div style={{ background:"#181320", border:"1px solid #241D2F", borderRadius:16, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:16, fontWeight:800 }}>Plan {planName}</div><div style={{ fontSize:12, color: daysLeft !== null && daysLeft <= 5 ? OR : "#8A8295", marginTop:3 }}>{aboFin ? `Actif jusqu'au ${aboFin.toLocaleDateString("fr-FR")} · ${daysLeft <= 0 ? "expiré" : daysLeft + " jour" + (daysLeft > 1 ? "s" : "") + " restant" + (daysLeft > 1 ? "s" : "")}` : "Abonnement mensuel"}</div></div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:900, color:accent }}>{planPrice.toFixed(2).replace(".", ",")}€<span style={{ fontSize:12, color:"#8A8295", fontWeight:600 }}>/mois</span></div>
            </div>
            <button type="button" onClick={payerAbonnement} style={{ display:"block", width:"100%", textAlign:"center", marginTop:14, padding:"11px", borderRadius:10, background: daysLeft !== null && daysLeft <= 5 ? R : "#241D2F", color:"#fff", fontWeight:700, fontSize:13, border: daysLeft !== null && daysLeft <= 5 ? "none" : "1px solid #34293F", cursor:"pointer", fontFamily:"inherit" }}>💳 Renouveler avec SumUp</button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SIMULATEUR — appel manqué → SMS avec lien → chatbot
// ═════════════════════════════════════════════════════════════════════
function Simulator({ go, user }) {
  const [phase, setPhase] = useState("idle");
  function start() { setPhase("ringing"); setTimeout(() => setPhase("missed"), 2600); setTimeout(() => setPhase("sms"), 4400); }
  const steps = [
    { l:"Appel entrant détecté", done:["ringing","missed","sms"].includes(phase) },
    { l:"Aucune réponse → appel manqué", done:["missed","sms"].includes(phase) },
    { l:"SMS avec lien envoyé en 3s", done:phase === "sms" },
  ];
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" }}>
      <TopBar title="Simulateur" sub="Testez le flux client complet" onBack={() => go(user ? "admin" : "landing")} />
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:22 }}>
        <div style={{ width:184, height:310, background:"linear-gradient(160deg, #1C1626, #120E18)", borderRadius:40, border:`2px solid ${phase === "ringing" ? R : phase === "missed" ? "#EF4444" : phase === "sms" ? V : LINE2}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, position:"relative", overflow:"hidden", boxShadow: phase==="ringing" ? `0 0 50px -8px ${R}88` : `0 24px 60px -28px #000`, animation: phase === "ringing" && !RM ? "glow 1s ease-in-out infinite" : "none", transition:`border-color .4s ${EASE}` }}>
          {phase === "ringing" && !RM && <div style={{ position:"absolute", inset:0, background:`radial-gradient(circle,${R}1E 0%,transparent 70%)`, animation:"pulse .7s ease-in-out infinite" }} />}
          <div style={{ fontSize:58, animation: phase === "ringing" && !RM ? "ring .42s ease-in-out infinite" : "none" }}>{phase === "idle" ? "📵" : phase === "ringing" ? "📱" : phase === "missed" ? "📵" : "💬"}</div>
          <div style={{ fontSize:13, textAlign:"center", padding:"0 20px", lineHeight:1.7 }}>
            {phase === "idle" && <span style={{ color:MUT }}>Prêt à simuler</span>}
            {phase === "ringing" && <span style={{ color:R, fontWeight:700, whiteSpace:"pre-line" }}>{"Appel entrant…\n+33 6 00 11 22 33"}</span>}
            {phase === "missed" && <span style={{ color:"#EF4444", fontWeight:700 }}>Appel manqué</span>}
            {phase === "sms" && <span style={{ color:V, fontWeight:700 }}>SMS envoyé ✓</span>}
          </div>
        </div>
        <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:10 }}>
          {steps.map((s, i) => (<div key={i} style={{ display:"flex", alignItems:"center", gap:12, background: s.done ? `${V}0E` : "#181320", border:`1px solid ${s.done ? V+"45" : "#241D2F"}`, borderRadius:12, padding:"12px 16px" }}><span style={{ fontSize:18 }}>{s.done ? "✅" : "⬜"}</span><span style={{ fontSize:14, fontWeight:600, color: s.done ? V : "#8A8295" }}>{s.l}</span></div>))}
        </div>
        {phase === "sms" && (<div className="fu" style={{ width:"100%", background:"#181320", border:`1px solid ${V}40`, borderRadius:16, padding:16 }}><div style={{ fontSize:10, fontWeight:700, color:V, letterSpacing:1.2, marginBottom:10 }}>SMS REÇU PAR LE CLIENT</div><div style={{ background:"#130F1A", borderRadius:"16px 16px 16px 4px", padding:"13px 16px", fontSize:14, lineHeight:1.8, color:"#F2ECE4", border:"1px solid #241D2F" }}>Bonjour ! Nous n'avons pas pu répondre à votre appel. Cliquez ici pour commander ou réserver 👉 <span onClick={() => go("chatbot")} style={{ color:R, textDecoration:"underline", cursor:"pointer", fontWeight:700 }}>Ouvrir le chatbot →</span></div></div>)}
        {phase === "idle" && <PrimaryBtn lg full onClick={start}>📞 Simuler un appel manqué</PrimaryBtn>}
        {phase === "sms" && (<><PrimaryBtn lg full onClick={() => go("chatbot")}>💬 Cliquer sur le lien (voir le chatbot) →</PrimaryBtn><GhostBtn full onClick={() => setPhase("idle")}>Recommencer</GhostBtn></>)}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// CHATBOT CLIENT
// ═════════════════════════════════════════════════════════════════════
function Chatbot({ go, user, restoId, isPublic }) {
  const [menu, setMenu] = useState([]);
  const [cats, setCats] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const restoName = cfg?.name || user?.resto || "notre restaurant";

  const [flow, setFlow] = useState("welcome");
  const [selCat, setSelCat] = useState(null);
  const [cart, setCart] = useState([]); // {lineId,id,name,emoji,price,qty,custom}
  const [resv, setResv] = useState({});
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const ref = useRef(null);
  // Personnalisation d'un plat (« sans cornichon », « bien cuit »…)
  const [customizing, setCustomizing] = useState(null); // l'article en cours de personnalisation
  const [removed, setRemoved] = useState([]);            // ingrédients retirés
  const [extra, setExtra] = useState("");                // demande libre du client

  function bot(t, d = 420) { setTimeout(() => setMsgs(p => [...p, { r:"bot", t }]), d); }
  function usr(t) { setMsgs(p => [...p, { r:"usr", t }]); }

  // Charge le menu et les réglages du restaurant (vue publique, sans connexion)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!restoId) { setLoadingMenu(false); return; }
      // restoId peut être un identifiant (aperçu restaurateur) ou un slug (lien client)
      let req = supabase.from("public_restaurants").select("id, resto, menu, cats, config");
      req = isUuid(restoId) ? req.eq("id", restoId) : req.eq("config->>slug", restoId);
      const { data } = await req.maybeSingle();
      if (!alive) return;
      // Les commandes du client iront vers le restaurant réellement résolu (identifiant)
      if (isPublic && data?.id) setUserId(data.id);
      if (Array.isArray(data?.menu)) setMenu(data.menu.filter(i => i.on !== false));
      if (Array.isArray(data?.cats)) setCats(data.cats);
      const conf = data?.config || {};
      if (!conf.name && data?.resto) conf.name = data.resto;
      setCfg(conf);
      setLoadingMenu(false);
    })();
    return () => { alive = false; };
  }, []);

  // Message d'accueil une fois le menu chargé
  useEffect(() => {
    if (loadingMenu) return;
    const base = cfg?.welcome ? cfg.welcome.replace(/{nom}/g, restoName) : `Bonjour ! 👋 Bienvenue chez ${restoName}.`;
    bot(`${base}\n\nJe peux :\n🍔 Prendre votre commande\n📅 Réserver une table\n❓ Répondre à vos questions\n\nQue souhaitez-vous ?`, 300);
  }, [loadingMenu]);

  useEffect(() => ref.current?.scrollIntoView({ behavior:"smooth" }), [msgs, cart, flow]);

  // Catégories qui ont au moins un article actif
  const catsWithItems = (cats.length ? cats : [...new Set(menu.map(i => i.cat))]).filter(c => menu.some(i => i.cat === c));

  // ── Panier (quantité plafonnée entre 1 et 20) ──
  function priceNum(p) { return parseFloat(String(p).replace(",", ".")) || 0; }
  // Ajoute un article avec sa personnalisation ; deux fois le même plat avec la
  // même demande → on cumule la quantité ; sinon → deux lignes distinctes.
  function addToCart(item, custom = "", qty = 1) {
    const add = Math.max(1, Math.min(LIMITS.qty.max, qty));
    const sig = item.id + "|" + custom;
    setCart(cur => {
      const ex = cur.find(c => c.sig === sig);
      if (ex) return cur.map(c => c.sig === sig ? { ...c, qty: Math.min(LIMITS.qty.max, c.qty + add) } : c);
      return [...cur, { lineId: item.id + "-" + uid(), sig, id:item.id, name:item.name, emoji:item.emoji, price:priceNum(item.price), qty:add, custom }];
    });
  }
  function changeQty(lineId, delta) {
    setCart(cur => cur.flatMap(c => {
      if (c.lineId !== lineId) return [c];
      const q = Math.min(LIMITS.qty.max, c.qty + delta);
      return q < 1 ? [] : [{ ...c, qty:q }];
    }));
  }
  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);

  // ── Personnalisation d'un plat ──
  const ingList = item => Array.isArray(item?.ingredients) ? item.ingredients.filter(Boolean) : [];
  function openCustomizer(item) { setCustomizing(item); setRemoved([]); setExtra(""); }
  function toggleRemoved(ing) { setRemoved(r => r.includes(ing) ? r.filter(x => x !== ing) : [...r, ing]); }
  // Construit l'étiquette lisible : « sans cornichon · sans oignon · bien cuit »
  function buildCustom() {
    const parts = removed.map(r => "sans " + r);
    const note = sanitizeText(extra, 80);
    if (note) parts.push(note);
    return parts.join(" · ");
  }
  function confirmCustom() {
    if (!customizing) return;
    addToCart(customizing, buildCustom());
    const label = buildCustom();
    bot(label ? `C'est noté : ${customizing.name} (${label}) ✍️` : `${customizing.emoji} ${customizing.name}, parfait choix ! Ajouté 👌`, 200);
    setCustomizing(null); setRemoved([]); setExtra("");
  }

  const QR = {
    welcome: ["🍔 Commander", "📅 Réserver une table", "❓ Infos & horaires"],
    intent: ["🍔 Commander", "📅 Réserver une table", "❓ Infos & horaires"],
    resv_confirm: ["✅ Confirmer", "✏️ Modifier"],
    order_confirm: ["✅ Confirmer", "✏️ Modifier"],
    faq: ["Horaires ?", "Livraison ?", "Allergènes ?", "↩ Retour"],
  };

  function q(t) { usr(t); proc(t); }
  function send() { const t = input.trim(); if (!t) return; setInput(""); usr(t); proc(t); }

  function pickCat(cat) { usr(cat); setSelCat(cat); setFlow("order_items"); bot(`Voici notre sélection 👇`, 250); }

  function startRecap() {
    if (cart.length === 0) return;
    setFlow("order_confirm");
    const lines = cart.map(c => `${c.qty}× ${c.name}${c.custom ? "  (" + c.custom + ")" : ""}`).join("\n");
    bot(`Voici votre commande :\n\n${lines}\n\n💰 Total : ${cartTotal.toFixed(2)}€\n\nJe confirme ?`, 300);
  }

  // ── Compréhension du langage naturel (sans serveur, tout côté navigateur) ──
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const NUMWORDS = [["un",1],["une",1],["deux",2],["trois",3],["quatre",4],["cinq",5],["six",6],["sept",7],["huit",8],["neuf",9],["dix",10],["onze",11],["douze",12],["couple",2],["paire",2]];
  // Un nombre écrit en chiffres OU en lettres dans la phrase (ou null)
  function numIn(s) {
    const n = norm(s); const d = n.match(/(\d{1,3})/); if (d) return parseInt(d[1], 10);
    for (const [w, v] of NUMWORDS) if (new RegExp("\\b" + w + "\\b").test(n)) return v;
    return null;
  }
  function qtyIn(s) { const n = numIn(s); return n ? Math.max(1, Math.min(LIMITS.qty.max, n)) : 1; }
  const isYes = t => /\b(oui|ouais|ouai|yep|yes|ok|okay|dac|d'?accord|carrement|parfait|nickel|impeccable|confirme|valide|c'?est bon|ca marche|ça marche|go|vas-?y|allez|👍|✅)\b/.test(t);
  const isNo  = t => /\b(non|nan|no|nope|pas (ca|ça)|plutot|plutôt|modif|change|attend|annul|✏)\b/.test(t);

  // Repère un plat du menu cité en clair (nom complet, ou mot significatif)
  function findMenuItem(s) {
    const tt = norm(s);
    return menu.find(i => tt.includes(norm(i.name))) ||
           menu.find(i => { const w = norm(i.name).split(/\s+/).filter(x => x.length > 2)[0]; return w && tt.includes(w); });
  }
  // Ingrédients à retirer cités après « sans … »
  function sansIn(s) {
    const out = []; const re = /\bsans\s+([a-zàâäéèêëîïôöùûüç'’ -]{2,24})/g; let m;
    while ((m = re.exec(norm(s)))) {
      const ing = m[1].replace(/\b(svp|s'?il vous plait|merci|aussi|le|la|les|du|de la|de|d'?)\b/g, " ").replace(/\s+/g, " ").trim();
      if (ing) out.push("sans " + ing);
    }
    return out.join(" · ");
  }
  // Analyse une phrase de commande → [{item, qty, custom}], plusieurs plats gérés
  function parseOrder(text) {
    const chunks = norm(text).split(/\bet\b|,|\+|\bpuis\b|;|\bainsi que\b/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const ch of chunks) {
      const item = findMenuItem(ch); const sans = sansIn(ch);
      if (item) out.push({ item, qty: qtyIn(ch), custom: sans });
      else if (sans && out.length) { out[out.length - 1].custom = [out[out.length - 1].custom, sans].filter(Boolean).join(" · "); } // « …et sans oignon » se rattache au plat précédent
    }
    if (!out.length) { const item = findMenuItem(text); if (item) out.push({ item, qty: qtyIn(text), custom: sansIn(text) }); }
    return out;
  }
  // Ajoute au panier ce qui a été compris dans la phrase ; renvoie false si rien trouvé
  function addOrderFromText(text, lead) {
    const parsed = parseOrder(text);
    if (!parsed.length) return false;
    // Un seul plat, personnalisable, sans précision → on propose les options (plus humain)
    if (parsed.length === 1 && parsed[0].qty === 1 && !parsed[0].custom && ingList(parsed[0].item).length > 0) {
      const it = parsed[0].item; setSelCat(it.cat); setFlow("order_items");
      bot(pick([`Excellent choix, le ${it.name} ! Je vous le prépare comment ? 😋`, `Ah, le ${it.name}, très bon choix ! Une préférence ?`]), 360);
      setTimeout(() => openCustomizer(it), 420);
      return true;
    }
    parsed.forEach(p => addToCart(p.item, p.custom, p.qty));
    const desc = parsed.map(p => `${p.qty}× ${p.item.name}${p.custom ? " (" + p.custom + ")" : ""}`).join(", ");
    setSelCat(parsed[parsed.length - 1].item.cat); setFlow("order_items");
    bot(`${lead ? lead + " " : "C'est noté ✍️ "}${desc} — ajouté au panier.\nAutre chose, ou je valide ? (dites « valider » ✅)`, 360);
    return true;
  }
  // Répond à une question courante (horaires, adresse, prix…) ou renvoie null
  function answerFaq(t) {
    const h1 = cfg?.hours1 || "12:00 – 14:30", h2 = cfg?.hours2 || "19:00 – 23:30";
    if (/\b(horaire|ouvert|ouvre|ferme|ferme|heure|quand)\b/.test(t)) return `🕐 Nos horaires : midi ${h1}, soir ${h2}.`;
    if (/\b(adresse|ou (etes|se trouve|est)|ou vous|localis|situe|venir|plan|itinerair)\b/.test(t)) return cfg?.address ? `📍 Nous sommes au ${cfg.address}.` : "📍 Appelez-nous pour l'adresse exacte 🙏";
    if (/\b(telephone|numero|appeler|joindre|contact|portable)\b/.test(t)) return cfg?.phone ? `📞 Notre numéro : ${cfg.phone}.` : "📞 Vous pouvez passer commande directement ici 🙂";
    if (/\b(livr|livraison|livrer|domicile|deliveroo|uber)\b/.test(t)) return "🛵 Pas de livraison pour l'instant — mais la commande à emporter est dispo ici !";
    if (/\b(emporter|emporte|a emporter|sur place|take ?away|click)\b/.test(t)) return "🥡 C'est à emporter : commandez ici, puis venez récupérer 👍";
    if (/\b(allerg|gluten|vegan|vegetarien|vegetar|halal|porc|sans porc|lactose|noix|arachide)\b/.test(t)) return "⚠️ Pour une allergie ou un régime, indiquez-le dans la commande (option « sans » ou demande libre) — on en tient compte.";
    if (/\b(paie|payer|carte|espece|cb|ticket ?resto|liquide|sumup)\b/.test(t)) return "💳 Le paiement se fait au restaurant, au moment de récupérer la commande.";
    if (/\b(prix|tarif|combien|coute|coute|cher)\b/.test(t)) { const it = findMenuItem(t); if (it) return `💶 Le ${it.name} est à ${priceNum(it.price).toFixed(2)}€.`; return "💶 Tous les prix sont indiqués sur le menu, par catégorie 👇"; }
    return null;
  }

  function proc(txt) {
    const t = norm(txt);

    // ── Commandes universelles (n'importe quand) ──
    if (/\b(recommenc|on recommence|reset|repart|tout (effac|annul|recommenc)|efface tout|reinitialis)\b/.test(t)) {
      setCart([]); setResv({}); setSelCat(null); setCustomizing(null); setFlow("intent");
      bot("C'est reparti de zéro 🔄 Vous voulez commander, réserver, ou une info ?", 300); return;
    }

    // ── Confirmation de commande ──
    if (flow === "order_confirm") {
      if (isYes(t)) { confirmOrder(); return; }
      if (isNo(t) || t.includes("modif")) { setFlow("order_items"); bot("D'accord, ajustez votre panier 👇", 300); return; }
      if (addOrderFromText(txt, "Et avec ça :")) return; // le client rajoute un plat pendant la confirmation
      bot("Je valide la commande ? Répondez « oui » ✅ ou « modifier » ✏️", 350); return;
    }

    // ── Réservation : étapes ──
    if (flow === "resv_persons") {
      const n = numIn(txt);
      if (n !== null && n > LIMITS.persons.max) { bot(`Pour un groupe de plus de ${LIMITS.persons.max} personnes, appelez-nous directement 🙏`, 450); return; }
      if (n && n >= LIMITS.persons.min) { setResv(r => ({ ...r, persons:n })); setFlow("resv_date"); bot(`Parfait, table pour ${n} 👍\nPour quelle date ? (ex : ce soir, demain, samedi…)`, 500); }
      else { bot("Combien de personnes serez-vous ? (ex : 2, 4…)", 400); }
      return;
    }
    if (flow === "resv_date") { setResv(r => ({ ...r, date:sanitizeText(txt, 40) })); setFlow("resv_time"); bot("Très bien ! À quelle heure souhaitez-vous venir ?", 500); return; }
    if (flow === "resv_time") { setResv(r => ({ ...r, time:sanitizeText(txt, 30) })); setFlow("resv_note"); bot("Une note ? (allergie, occasion spéciale…) Sinon tapez « non ».", 500); return; }
    if (flow === "resv_note") {
      const note = /\b(non|nan|rien|aucun)\b/.test(t) ? "" : sanitizeText(txt, LIMITS.note);
      const r2 = { ...resv, note }; setResv(r2); setFlow("resv_confirm");
      setTimeout(() => bot(`Récapitulatif :\n\n📅 ${r2.date} à ${r2.time}\n👥 ${r2.persons} personne${r2.persons > 1 ? "s" : ""}${r2.note ? "\n📝 " + r2.note : ""}\n\nTout est correct ?`, 500), 0);
      return;
    }
    if (flow === "resv_confirm") {
      if (isYes(t)) { confirmResv(); return; }
      if (isNo(t)) { setResv({}); setFlow("resv_persons"); bot("Pas de souci ! Reprenons : pour combien de personnes ?", 400); return; }
      bot("Je confirme la réservation ? « oui » ✅ ou « modifier » ✏️", 350); return;
    }

    // ── FAQ (ou question posée n'importe quand) ──
    if (flow === "faq") {
      if (/\b(retour|menu|commander|reserv|↩)\b/.test(t)) { setFlow("intent"); bot("D'accord ! Commander 🍔, réserver 📅, ou une autre question ?", 400); return; }
      bot(answerFaq(t) || "Bonne question ! Pour ce point précis, le mieux est de nous appeler 😊 Autre chose ?", 400); return;
    }

    // ── Accueil / commande en cours / intention libre ──
    if (/^(bonjour|bonsoir|salut|coucou|hello|hey|yo|bjr|cc|wesh)\b/.test(t)) {
      bot(pick(["Bonsoir ! 😊 Ravi de vous accueillir. Commander, réserver, ou une info ?", "Bonjour ! 👋 Avec plaisir — une commande, une réservation, ou une question ?"]), 380); return;
    }
    if (/\b(merci|nickel|super|génial|top|cool)\b/.test(t) && !findMenuItem(t)) { bot(pick(["Avec grand plaisir ! 😊 Autre chose ?", "Je vous en prie ! 🙏"]), 350); return; }
    if (/\b(au revoir|bye|a bientot|bonne (journee|soiree))\b/.test(t)) { bot("Merci et à très bientôt ! 👋", 350); return; }

    // Validation / panier
    if (cart.length && /\b(valid|c'?est tout|cest tout|termin|fini|finir|j'?ai fini|rien d'?autre|c'?est bon|ca ira|ça ira|paye|commander maintenant)\b/.test(t)) { startRecap(); return; }
    if (cart.length && /\b(panier|recap|récap|resume|ma commande)\b/.test(t)) { startRecap(); return; }

    // Réservation explicite (et pas un plat nommé)
    if (/\b(reserv|réserv|table|booking|une place|reserver)\b/.test(t) && !findMenuItem(t)) { setFlow("resv_persons"); bot("Avec plaisir ! Pour combien de personnes ? 👥", 450); return; }

    // Question type FAQ posée directement
    const fa = answerFaq(t);
    if (fa) { bot(fa, 400); return; }

    // Commande comprise depuis le texte (plusieurs plats, quantités, « sans … »)
    if (menu.length && addOrderFromText(txt, null)) return;

    // Intention de commander sans nommer de plat
    if (/\b(command|manger|faim|emporter|prendre|envie|menu|carte|plat|a boire|boire)\b/.test(t)) {
      if (menu.length === 0) { bot("Le menu n'est pas encore en ligne — appelez-nous, on s'occupe de vous 🙏", 450); return; }
      setFlow("order_cat"); bot(pick(["Avec plaisir ! On commence par quoi ? 👇", "Bien sûr ! Choisissez une catégorie pour voir nos plats 👇"]), 400); return;
    }

    // Dernier recours : on propose, on ne bloque jamais
    bot(pick([
      "Je veux être sûr de bien comprendre 🙂 Vous souhaitez : 🍔 commander, 📅 réserver, ou ❓ une info ? Vous pouvez aussi écrire directement, ex : « 2 burgers sans oignon ».",
      "Pas de souci — dites-moi simplement ce que vous voulez manger (ex : « un menu et une boisson »), réserver une table, ou poser une question 😊",
    ]), 420);
  }
  function confirmOrder() {
    const items = cart.map(c => `${c.qty}× ${c.name}${c.custom ? " (" + c.custom + ")" : ""}`);
    db.add({ id:"CMD-"+uid(), client:"Client (chatbot)", type:"commande", items, total:`${cartTotal.toFixed(2)}€`, time:now(), status:"en_cours", note:"" });
    setDone(true); setFlow("done");
    bot(`🎉 Commande confirmée !\n\n${items.join("\n")}\n\n💰 Total : ${cartTotal.toFixed(2)}€\n\nMerci ! 🙏`, 400);
    setCart([]);
  }
  function confirmResv() {
    db.add({ id:"RES-"+uid(), client:"Client (chatbot)", type:"reservation", items:[`Table pour ${resv.persons} personne${resv.persons > 1 ? "s" : ""}`, `${resv.date} à ${resv.time}`], total:"—", time:now(), status:"en_cours", note:resv.note || "" });
    setDone(true); setFlow("done");
    bot(`🎉 Réservation confirmée !\n\n📅 ${resv.date} à ${resv.time}\n👥 ${resv.persons} personne${resv.persons > 1 ? "s" : ""}${resv.note ? "\n📝 " + resv.note : ""}\n\nÀ très bientôt ! 🙏`, 500);
  }

  const curQR = QR[flow] || [];
  const inOrder = flow === "order_cat" || flow === "order_items";
  const items = selCat ? menu.filter(i => i.cat === selCat) : [];

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", borderLeft:`1px solid ${LINE}`, borderRight:`1px solid ${LINE}` }}>
      <TopBar title={`🍽️ ${restoName}`} sub="Commandes & Réservations" onBack={() => go(user ? "admin" : "landing")} dot={V} />
      <div style={{ flex:1, overflowY:"auto", padding:"16px 14px 8px", display:"flex", flexDirection:"column", gap:13, background:`radial-gradient(ellipse 90% 30% at 50% 0%, ${R}0A, transparent 60%)` }}>
        {msgs.map((m, i) => (<div key={i} className="fu" style={{ display:"flex", justifyContent: m.r === "usr" ? "flex-end" : "flex-start", gap:8 }}>{m.r === "bot" && <div style={{ width:34, height:34, background:`linear-gradient(135deg,${R},${OR})`, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0, alignSelf:"flex-end", boxShadow:`0 4px 12px -4px ${R}88` }}>🤖</div>}<div style={{ maxWidth:"80%", background: m.r === "usr" ? `linear-gradient(135deg,${R},${OR})` : PANEL, border: m.r === "bot" ? `1px solid ${LINE2}` : "none", borderRadius: m.r === "usr" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding:"12px 15px", fontSize:14, lineHeight:1.7, color:"#fff", fontWeight: m.r === "usr" ? 600 : 400, whiteSpace:"pre-wrap", wordBreak:"break-word", boxShadow: m.r === "usr" ? `0 6px 16px -8px ${R}88` : "none" }}>{m.t}</div></div>))}

        {/* Choix des catégories */}
        {inOrder && (
          <div className="fu" style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {catsWithItems.map(c => (
              <button key={c} type="button" onClick={() => { setSelCat(c); if (flow === "order_cat") pickCat(c); }} style={{ padding:"8px 14px", borderRadius:22, background: selCat === c ? R : "#181320", border:`1.5px solid ${selCat === c ? R : R+"40"}`, color: selCat === c ? "#fff" : R, fontSize:13, fontWeight:700, cursor:"pointer" }}>{c}</button>
            ))}
          </div>
        )}

        {/* Articles de la catégorie sélectionnée */}
        {flow === "order_items" && selCat && (
          <div className="fu" style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {items.map(it => (
              <div key={it.id} style={{ display:"flex", alignItems:"center", gap:12, background:"#181320", border:"1px solid #34293F", borderRadius:14, padding:"10px 14px" }}>
                <span style={{ fontSize:24 }}>{it.emoji}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#F2ECE4" }}>{it.name}</div>
                  {it.desc && <div style={{ fontSize:11, color:"#8A8295", marginTop:1 }}>{it.desc}</div>}
                  {ingList(it).length > 0 && <div style={{ fontSize:10.5, color:V, marginTop:2, fontWeight:600 }}>✨ personnalisable</div>}
                  <div style={{ fontSize:13, fontWeight:800, color:OR, marginTop:3 }}>{priceNum(it.price).toFixed(2)}€</div>
                </div>
                <button type="button" onClick={() => openCustomizer(it)} style={{ padding:"8px 14px", borderRadius:10, background:R, color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>＋ Ajouter</button>
              </div>
            ))}
          </div>
        )}

        {/* Personnalisation du plat : « complet » ou « sans tel ingrédient » + demande libre */}
        {customizing && (
          <div className="fu" style={{ background:`linear-gradient(165deg, #1d1626, ${PANEL})`, border:`1.5px solid ${R}66`, borderRadius:16, padding:"15px 16px", boxShadow:`0 18px 44px -26px ${R}88` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <span style={{ fontSize:26 }}>{customizing.emoji}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:800, color:"#fff" }}>{customizing.name}</div>
                <div style={{ fontSize:12, color:OR, fontWeight:700 }}>{priceNum(customizing.price).toFixed(2)}€</div>
              </div>
              <button type="button" onClick={() => setCustomizing(null)} style={{ background:LINE, border:`1px solid ${LINE2}`, color:MUT, width:30, height:30, borderRadius:9, cursor:"pointer", fontSize:14 }}>✕</button>
            </div>
            <div style={{ fontSize:13, color:MUT, margin:"6px 0 12px", lineHeight:1.5 }}>Comment le souhaitez-vous ? 😋</div>
            {ingList(customizing).length > 0 ? (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:V, letterSpacing:.6, marginBottom:8 }}>RETIRER UN INGRÉDIENT ?</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                  {ingList(customizing).map(ing => { const off = removed.includes(ing); return (
                    <button key={ing} type="button" onClick={() => toggleRemoved(ing)} style={{ padding:"7px 13px", borderRadius:22, fontSize:12.5, fontWeight:700, cursor:"pointer", background: off ? "#EF444420" : `${V}12`, border:`1.5px solid ${off ? "#EF4444" : V+"40"}`, color: off ? "#EF4444" : V, textDecoration: off ? "line-through" : "none", fontFamily:"inherit" }}>{off ? "🚫 sans " : ""}{ing}</button>
                  ); })}
                </div>
              </>
            ) : (
              <div style={{ fontSize:12.5, color:"#8A8295", marginBottom:12, lineHeight:1.6 }}>Une demande particulière ? Indiquez-la ci-dessous (sinon ce sera « complet », préparé comme d'habitude 👍).</div>
            )}
            <input value={extra} onChange={e => setExtra(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmCustom()} placeholder="Ex : sans sauce, bien cuit, allergie aux noix…" maxLength={80} style={{ width:"100%", background:BG2, border:`1.5px solid ${LINE2}`, borderRadius:11, color:TXT, fontSize:13.5, padding:"11px 13px", fontFamily:"inherit" }} />
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              {ingList(customizing).length > 0 && removed.length === 0 && !extra && (
                <button type="button" onClick={confirmCustom} style={{ flex:1, padding:"12px", borderRadius:12, background:`${V}18`, color:V, border:`1px solid ${V}55`, fontWeight:800, fontSize:13.5, cursor:"pointer", fontFamily:"inherit" }}>👍 Complet</button>
              )}
              <button type="button" onClick={confirmCustom} style={{ flex:2, padding:"12px", borderRadius:12, background:R, color:"#fff", border:"none", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>Ajouter au panier →</button>
            </div>
          </div>
        )}

        {/* Panier */}
        {inOrder && cart.length > 0 && (
          <div className="fu" style={{ background:"#181320", border:`1px solid ${R}45`, borderRadius:14, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:R, letterSpacing:1, marginBottom:10 }}>🛒 VOTRE PANIER</div>
            {cart.map(c => (
              <div key={c.lineId} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:8 }}>
                <div style={{ fontSize:13, color:"#F2ECE4", flex:1, minWidth:0 }}>
                  {c.emoji} {c.name}
                  {c.custom && <div style={{ fontSize:11, color:OR, marginTop:1, fontStyle:"italic" }}>↳ {c.custom}</div>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button type="button" onClick={() => changeQty(c.lineId, -1)} style={{ width:26, height:26, borderRadius:7, background:"#241D2F", border:"1px solid #34293F", color:"#F2ECE4", fontSize:16, cursor:"pointer", lineHeight:1 }}>−</button>
                  <span style={{ fontSize:14, fontWeight:700, minWidth:18, textAlign:"center" }}>{c.qty}</span>
                  <button type="button" onClick={() => changeQty(c.lineId, 1)} disabled={c.qty >= LIMITS.qty.max} style={{ width:26, height:26, borderRadius:7, background: c.qty >= LIMITS.qty.max ? "#241D2F" : R, border:"none", color:"#fff", fontSize:16, cursor: c.qty >= LIMITS.qty.max ? "not-allowed" : "pointer", lineHeight:1 }}>＋</button>
                  <span style={{ fontSize:13, fontWeight:800, color:OR, minWidth:54, textAlign:"right" }}>{(c.price * c.qty).toFixed(2)}€</span>
                </div>
              </div>
            ))}
            <div style={{ borderTop:"1px solid #34293F", marginTop:8, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:800, fontSize:15 }}>
              <span>Total</span><span style={{ color:OR }}>{cartTotal.toFixed(2)}€</span>
            </div>
            <button type="button" onClick={startRecap} style={{ width:"100%", marginTop:12, padding:"12px", borderRadius:12, background:V, color:"#fff", border:"none", fontWeight:800, fontSize:14, cursor:"pointer" }}>Valider la commande →</button>
            <p style={{ fontSize:11, color:"#6B6378", textAlign:"center", marginTop:8 }}>Maximum {LIMITS.qty.max} par article</p>
          </div>
        )}

        {done && (<div className="fu" style={{ background:`${V}10`, border:`1px solid ${V}45`, borderRadius:14, padding:16, textAlign:"center" }}><div style={{ fontSize:14, fontWeight:700, color:V, marginBottom: isPublic ? 0 : 12 }}>🎉 Transmis au restaurant !</div>{!isPublic && <button type="button" onClick={() => go("dashboard")} style={{ padding:"10px 24px", borderRadius:22, background:V, color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Voir dans le dashboard →</button>}</div>)}
        <div ref={ref} />
      </div>
      {curQR.length > 0 && !done && (<div style={{ padding:"10px 14px", display:"flex", gap:8, overflowX:"auto", borderTop:`1px solid ${LINE}`, background:BG }}>{curQR.map(r => (<button key={r} type="button" onClick={() => q(r)} className="lift" style={{ flexShrink:0, padding:"9px 16px", borderRadius:22, background:`${R}12`, border:`1px solid ${R}55`, color:R, fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit" }}>{r}</button>))}</div>)}
      {isPublic && <p style={{ fontSize:10, color:"#6B6378", textAlign:"center", padding:"6px 16px 0", background:"#0B0910" }}>En validant une commande, vous acceptez le traitement de vos informations pour la gérer. <span onClick={() => go("confidentialite")} style={{ color:"#A89FB0", textDecoration:"underline", cursor:"pointer" }}>Confidentialité</span></p>}
      <div style={{ padding:"10px 14px 24px", background:"#0B0910", borderTop:"1px solid #241D2F", display:"flex", gap:10, alignItems:"center" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Écrivez votre message…" maxLength={200} style={{ flex:1, background:"#181320", border:"1.5px solid #34293F", borderRadius:14, color:"#F2ECE4", fontSize:14, padding:"12px 14px", fontFamily:"inherit" }} />
        <button type="button" onClick={send} disabled={!input.trim()} style={{ width:46, height:46, borderRadius:13, flexShrink:0, background: input.trim() ? R : "#34293F", border:"none", cursor: input.trim() ? "pointer" : "not-allowed", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#fff" }}>➤</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// DASHBOARD CUISINE
// ═════════════════════════════════════════════════════════════════════
// ── Sonneries (synthétisées, aucun fichier audio requis) ──
const SOUNDS = [
  { key: "bip", label: "🔔 Bip simple" },
  { key: "double", label: "🔔 Double bip" },
  { key: "carillon", label: "🎵 Carillon" },
  { key: "cloche", label: "🛎️ Cloche" },
  { key: "alarme", label: "🚨 Alarme" },
];
function playSound(ctx, key) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const tone = (freq, start, dur, type = "sine", vol = 0.3) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = type; o.frequency.value = freq;
    const s = t0 + start;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    o.start(s); o.stop(s + dur + 0.03);
  };
  if (key === "bip") tone(880, 0, 0.4);
  else if (key === "carillon") { tone(659, 0, 0.35); tone(784, 0.18, 0.35); tone(988, 0.36, 0.55); }
  else if (key === "cloche") { tone(1318, 0, 1.1); tone(2637, 0, 0.55, "sine", 0.12); }
  else if (key === "alarme") { [0, 0.16, 0.32, 0.48].forEach(t => tone(1000, t, 0.12, "square", 0.25)); }
  else { tone(880, 0, 0.32); tone(1100, 0.22, 0.36); } // double (défaut)
}

function Dashboard({ go, orders, user }) {
  const [filter, setFilter] = useState("en_cours");
  const [soundOn, setSoundOn] = useState(() => { try { return localStorage.getItem("adbarth_sound_on") !== "0"; } catch (e) { return true; } });
  const [soundType, setSoundType] = useState(() => { try { return localStorage.getItem("adbarth_sound") || "double"; } catch (e) { return "double"; } });
  const [flash, setFlash] = useState(false);
  const soundRef = useRef(soundOn);
  const typeRef = useRef(soundType);
  const audioRef = useRef(null);
  useEffect(() => { soundRef.current = soundOn; try { localStorage.setItem("adbarth_sound_on", soundOn ? "1" : "0"); } catch (e) {} }, [soundOn]);
  useEffect(() => { typeRef.current = soundType; try { localStorage.setItem("adbarth_sound", soundType); } catch (e) {} }, [soundType]);

  function ensureAudio() {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioRef.current.state === "suspended") audioRef.current.resume();
    } catch (e) {}
  }
  function beep() { try { ensureAudio(); playSound(audioRef.current, typeRef.current); } catch (e) {} }

  // Alerte (bip + bandeau) dès qu'une NOUVELLE commande apparaît dans la liste
  const seenRef = useRef(null);
  useEffect(() => {
    const ids = new Set(orders.map(o => o.id));
    if (seenRef.current === null) { seenRef.current = ids; return; } // 1er chargement : pas de bip
    let isNew = false;
    ids.forEach(id => { if (!seenRef.current.has(id)) isNew = true; });
    seenRef.current = ids;
    if (isNew) { if (soundRef.current) beep(); setFlash(true); setTimeout(() => setFlash(false), 3500); }
  }, [orders]);

  // Rafraîchit en continu : temps réel (instantané si activé) + sondage de secours toutes les 5s
  useEffect(() => {
    const off = db.subscribeRealtime(() => {});
    const timer = setInterval(() => db.reload(), 5000);
    return () => { off(); clearInterval(timer); };
  }, []);

  // Débloque le son du navigateur dès le premier contact (sans changer l'interrupteur)
  useEffect(() => {
    const unlock = () => { ensureAudio(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  const list = orders.filter(o => filter === "all" ? true : o.status === filter);
  const nb = orders.filter(o => o.status === "en_cours").length;
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:"100%", margin:"0 auto" }}>
      <TopBar title="Commandes en cours" onBack={() => go("admin")} badge={nb} />
      {flash && (<div className="fu" style={{ background:`linear-gradient(90deg, ${V}10, ${V}26, ${V}10)`, borderBottom:`1px solid ${V}66`, padding:"13px 16px", textAlign:"center", fontSize:16, fontWeight:800, color:V, letterSpacing:".3px", boxShadow:`0 6px 24px -8px ${V}55` }}><span style={{ animation: RM?"none":"bob 1s ease-in-out infinite", display:"inline-block" }}>🔔</span> Nouvelle commande reçue !</div>)}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"8px 14px", background:"#0B0910", borderBottom:"1px solid #241D2F", flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:"#8A8295", display:"flex", alignItems:"center", gap:6 }}><span style={{ width:7, height:7, borderRadius:"50%", background:V, display:"inline-block", animation:"blink 1.6s infinite" }} />En direct</span>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <select value={soundType} onChange={e => { const v = e.target.value; setSoundType(v); ensureAudio(); playSound(audioRef.current, v); }} style={{ padding:"7px 10px", borderRadius:20, background:"#181320", border:"1px solid #34293F", color:"#F2ECE4", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {SOUNDS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button type="button" onClick={() => { ensureAudio(); beep(); }} style={{ padding:"6px 12px", borderRadius:20, background:"#241D2F", border:"1px solid #34293F", color:"#F2ECE4", fontSize:12, fontWeight:700, cursor:"pointer" }}>🔊 Tester</button>
          <button type="button" onClick={() => { ensureAudio(); setSoundOn(s => !s); }} style={{ padding:"6px 12px", borderRadius:20, background: soundOn ? `${V}18` : "#241D2F", border:`1px solid ${soundOn ? V+"55" : "#34293F"}`, color: soundOn ? V : "#A89FB0", fontSize:12, fontWeight:700, cursor:"pointer" }}>{soundOn ? "🔔 Activé" : "🔕 Coupé"}</button>
        </div>
      </div>
      <div style={{ display:"flex", background:"#0B0910", borderBottom:"1px solid #241D2F", padding:"0 12px" }}>
        {[{ k:"en_cours", l:"⏳ En cours" }, { k:"pret", l:"✅ Prêt" }, { k:"all", l:"📋 Tout" }].map(t => (<button key={t.k} type="button" onClick={() => setFilter(t.k)} style={{ flex:1, padding:"12px 4px", background:"none", border:"none", borderBottom: filter === t.k ? `2px solid ${R}` : "2px solid transparent", color: filter === t.k ? R : "#8A8295", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{t.l}</button>))}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:18, display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:16, alignContent:"start" }}>
        {list.length === 0 && (<div style={{ gridColumn:"1/-1", textAlign:"center", color:FAINT, marginTop:70 }}><div style={{ fontSize:52, marginBottom:16, animation: RM?"none":"floaty 5s ease-in-out infinite" }}>🍽️</div><div style={{ fontSize:16 }}>Aucune commande ici pour le moment.</div><div style={{ fontSize:13, color:MUT, marginTop:6 }}>Les nouvelles commandes apparaîtront ici en temps réel.</div></div>)}
        {list.map((o, i) => <OrderCard key={o.id} o={o} i={i} />)}
      </div>
    </div>
  );
}

function OrderCard({ o, i }) {
  const [status, setStatus] = useState(o.status);
  function upd(s) { setStatus(s); db.upd(o.id, s); }
  const isPret = status === "pret";
  const isCmd = o.type === "commande";
  return (
    <div className="fu" style={{ background:PANEL, border:`1.5px solid ${isPret ? V+"66" : isCmd ? R+"55" : "#3B82F655"}`, borderRadius:20, overflow:"hidden", boxShadow: isPret ? `0 0 0 1px ${V}22, 0 14px 34px -22px ${V}66` : `0 14px 34px -24px #000`, height:"100%", display:"flex", flexDirection:"column" }}>
      <div style={{ background: isPret ? `${V}1A` : isCmd ? `${R}14` : "#3B82F614", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${LINE}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}><span style={{ fontSize:26 }}>{isCmd ? "🍔" : "📅"}</span><div><div style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, fontSize:18, color:"#fff", letterSpacing:"-.5px" }}>{o.id}</div><div style={{ fontSize:12, color:MUT, marginTop:2 }}>{o.client} · {o.time}</div></div></div>
        <div style={{ fontSize:11, fontWeight:800, padding:"5px 13px", borderRadius:20, background: isPret ? `${V}28` : `${R}1A`, border:`1px solid ${isPret ? V+"66" : R+"45"}`, color: isPret ? V : R, textTransform:"uppercase", letterSpacing:.5 }}>{isPret ? "✓ Prêt" : "En cours"}</div>
      </div>
      <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:8, flex:1 }}>
        {o.items.map((it, j) => (<div key={j} style={{ display:"flex", alignItems:"center", gap:10, fontSize:16, fontWeight:600, color:TXT, lineHeight:1.35 }}><span style={{ color:R, fontSize:13, flexShrink:0 }}>▸</span>{it}</div>))}
        {o.note && <div style={{ marginTop:6, fontSize:13, color:OR, background:`${OR}12`, border:`1px solid ${OR}30`, borderRadius:10, padding:"8px 12px" }}>📝 {o.note}</div>}
      </div>
      <div style={{ padding:"12px 18px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, borderTop:`1px solid ${LINE}` }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:24, color:OR }}>{o.total}</div>
        <div style={{ display:"flex", gap:8 }}>
          {!isPret && status !== "termine" && (<button type="button" onClick={() => upd("pret")} style={{ padding:"11px 22px", borderRadius:12, background:V, color:"#0B0910", border:"none", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit", boxShadow:`0 8px 20px -10px ${V}aa` }}>✓ Marquer prêt</button>)}
          {isPret && (<button type="button" onClick={() => upd("termine")} style={{ padding:"11px 22px", borderRadius:12, background:LINE, color:MUT, border:`1px solid ${LINE2}`, fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>Terminer</button>)}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PAGES LÉGALES (modèles à compléter)
// ═════════════════════════════════════════════════════════════════════
const LEGAL_DOCS = {
  mentions: {
    title: "Mentions légales",
    sections: [
      { h: "Éditeur du site", p: "Le site AdBarth est édité par [NOM DE LA SOCIÉTÉ], [FORME JURIDIQUE] au capital de [MONTANT] €, dont le siège social est situé [ADRESSE COMPLÈTE].\nImmatriculée au RCS de [VILLE] sous le numéro [SIREN].\nN° de TVA intracommunautaire : [N° TVA].\nE-mail : [EMAIL] — Téléphone : [TÉLÉPHONE]." },
      { h: "Directeur de la publication", p: "[PRÉNOM NOM], en qualité de [FONCTION]." },
      { h: "Hébergement", p: "Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.\nLes données sont stockées via Supabase, Inc., sur une infrastructure située dans l'Union européenne (région eu-central-1)." },
      { h: "Propriété intellectuelle", p: "L'ensemble des contenus du site (textes, marques, logos, interface) est protégé. Toute reproduction sans autorisation est interdite." },
      { h: "Contact", p: "Pour toute question : [EMAIL]." },
    ],
  },
  cgv: {
    title: "Conditions Générales de Vente",
    sections: [
      { h: "Article 1 — Objet", p: "Les présentes conditions régissent l'abonnement au service AdBarth, proposé par [NOM DE LA SOCIÉTÉ] aux professionnels du secteur de la restauration." },
      { h: "Article 2 — Service", p: "AdBarth fournit : l'envoi d'un SMS automatique sur appel manqué, un lien de commande, un chatbot de commande et de réservation, et un tableau de bord de cuisine." },
      { h: "Article 3 — Tarifs", p: "Starter : 29,90 € / mois. Pro : 49,90 € / mois. Premium : 79,90 € / mois. Prix indiqués [HT / TTC — à préciser]. Sans engagement de durée." },
      { h: "Article 4 — Paiement", p: "L'abonnement est payable mensuellement d'avance par [moyen de paiement]. Tout mois commencé est dû." },
      { h: "Article 5 — Durée et résiliation", p: "L'abonnement est mensuel, sans engagement. Il peut être résilié à tout moment ; la résiliation prend effet à la fin de la période en cours." },
      { h: "Article 6 — Droit de rétractation", p: "Le service étant destiné à des professionnels dans le cadre de leur activité, le droit de rétractation de 14 jours applicable aux consommateurs ne s'applique pas, sauf accord particulier." },
      { h: "Article 7 — Responsabilité", p: "AdBarth s'engage à fournir le service avec diligence. Sa responsabilité ne saurait être engagée en cas d'interruption indépendante de sa volonté (panne d'un service tiers, opérateur télécom, etc.)." },
      { h: "Article 8 — Données personnelles", p: "Le traitement des données est décrit dans la Politique de confidentialité." },
      { h: "Article 9 — Droit applicable", p: "Les présentes sont soumises au droit français. À défaut d'accord amiable, tout litige relève des tribunaux compétents de [VILLE]." },
    ],
  },
  confidentialite: {
    title: "Politique de confidentialité",
    sections: [
      { h: "Rôles", p: "Chaque restaurant client est responsable du traitement des données de ses propres clients. [NOM DE LA SOCIÉTÉ] agit en tant que sous-traitant technique, au sens du RGPD." },
      { h: "Données collectées", p: "Comptes restaurateurs : nom, e-mail, téléphone, nom du restaurant.\nClients finaux (via le chatbot) : numéro de téléphone et détails de la commande ou de la réservation." },
      { h: "Finalités", p: "Gérer les comptes, envoyer le SMS suite à un appel manqué, traiter les commandes et réservations, et afficher les commandes en cuisine." },
      { h: "Base légale", p: "Exécution du service et intérêt légitime. Toute prospection commerciale par SMS nécessite le consentement préalable du client." },
      { h: "SMS", p: "Le SMS est envoyé en réponse à un appel du client vers le restaurant. Les numéros ne sont pas utilisés à des fins publicitaires sans consentement explicite." },
      { h: "Durée de conservation", p: "Les commandes et réservations sont conservées 12 mois, puis supprimées. Les coordonnées des clients finaux ne sont pas conservées au-delà de cette durée sans consentement. Les données du compte restaurateur sont conservées tant que l'abonnement est actif, puis pendant la durée légale applicable." },
      { h: "Destinataires", p: "Les données sont accessibles au seul restaurant concerné et aux sous-traitants techniques strictement nécessaires (hébergement : Vercel ; base de données et authentification : Supabase, infrastructure située dans l'Union européenne). Aucune donnée n'est revendue ni cédée à des tiers à des fins publicitaires." },
      { h: "Sécurité des données", p: "Les accès à la base sont protégés par des règles de sécurité au niveau de chaque ligne (RLS) : un restaurateur n'accède qu'à son propre compte et à ses propres commandes, jamais à ceux d'un autre restaurant. Les échanges sont chiffrés (HTTPS), les mots de passe sont hachés (jamais stockés en clair), et l'accès anonyme se limite à la vitrine publique d'un restaurant (menu, horaires) et au dépôt d'une commande." },
      { h: "Vos droits", p: "Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition. Pour les exercer, écrivez à [EMAIL] ; une réponse vous sera apportée dans un délai d'un mois." },
      { h: "Réclamation", p: "Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr)." },
      { h: "Cookies", p: "Le site n'utilise que les technologies strictement nécessaires à son fonctionnement (cookie d'authentification de votre session). Aucun cookie publicitaire ni traceur tiers n'est déposé : aucune bannière de consentement n'est donc requise." },
    ],
  },
};
function Legal({ doc, go }) {
  const d = LEGAL_DOCS[doc] || LEGAL_DOCS.mentions;
  const needsFilling = d.sections.some(s => /\[[^\]]+\]/.test(s.p));
  return (
    <div style={{ minHeight:"100vh", maxWidth:760, margin:"0 auto" }}>
      <TopBar title={d.title} onBack={() => go("landing")} />
      <div style={{ padding:"24px 20px 60px" }}>
        {needsFilling && (
        <div style={{ background:`${OR}12`, border:`1px solid ${OR}40`, borderRadius:12, padding:14, marginBottom:24, fontSize:13, color:"#F2ECE4", lineHeight:1.6 }}>
          ⚠️ Avant mise en ligne : remplacez les champs entre crochets […] par vos informations réelles (raison sociale, SIREN, e-mail de contact…) et faites relire ce document par un professionnel.
        </div>)}
        {d.sections.map((s, i) => (
          <div key={i} style={{ marginBottom:20, paddingLeft:16, borderLeft:`2px solid ${LINE2}` }}>
            {s.h && <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:800, color:"#fff", marginBottom:8 }}>{s.h}</h3>}
            <p style={{ fontSize:14, color:"#D2C9D6", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{s.p}</p>
          </div>
        ))}
        <p style={{ fontSize:12, color:"#6B6378", marginTop:30 }}>Dernière mise à jour : [à compléter].</p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// GUIDE D'UTILISATION  ·  s'ouvre seul à la 1re connexion + bouton « ❓ Guide »
// ═════════════════════════════════════════════════════════════════════
const GUIDE_STEPS = [
  { i:"🏪", t:"Configurez votre restaurant", d:"Onglet « Restaurant » : nom, téléphone, adresse, horaires et la couleur de votre marque — c'est elle qui habille votre chatbot." },
  { i:"🍽️", t:"Composez votre menu", d:"Créez vos catégories puis ajoutez vos plats (nom, prix, emoji). Un clic suffit pour activer ou masquer un plat selon le service." },
  { i:"💬", t:"Personnalisez SMS & chatbot", d:"Onglets « SMS » et « Chatbot » : réglez le message envoyé sur appel manqué et le mot d'accueil. L'aperçu se met à jour en direct." },
  { i:"🔗", t:"Partagez votre lien client", d:"Onglet « Restaurant » → copiez votre lien unique. Envoyez-le par SMS, transformez-le en QR code sur vos tables, ou mettez-le sur vos réseaux." },
  { i:"🍳", t:"Recevez en cuisine", d:"Ouvrez « Cuisine » : chaque commande tombe en temps réel avec une sonnerie. Marquez « prêt » d'un geste, votre équipe ne rate plus rien." },
];
function Guide({ go, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);
  const link = (label, fn) => (
    <span onClick={fn} style={{ fontSize:13, color:"#A89FB0", cursor:"pointer", textDecoration:"underline", textUnderlineOffset:3 }}
      onMouseEnter={e => e.currentTarget.style.color = R} onMouseLeave={e => e.currentTarget.style.color = "#A89FB0"}>{label}</span>
  );
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:500, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"max(16px, 4vh) 16px", overflowY:"auto", background:"rgba(7,5,10,.72)", backdropFilter:"blur(7px)", WebkitBackdropFilter:"blur(7px)" }}>
      <div className="fu" style={{ position:"relative", width:"100%", maxWidth:560, background:PANEL, border:`1px solid ${LINE2}`, borderRadius:24, boxShadow:`0 40px 90px -34px ${R}66, 0 1px 0 #ffffff0a inset`, overflow:"hidden" }}>
        {/* en-tête */}
        <div style={{ position:"relative", padding:"26px 26px 20px", background:`radial-gradient(ellipse 90% 120% at 18% 0%, ${R}26, transparent 60%), radial-gradient(ellipse 80% 120% at 100% 0%, ${V}12, transparent 55%)`, borderBottom:`1px solid ${LINE}` }}>
          <button type="button" onClick={onClose} title="Fermer" style={{ position:"absolute", top:16, right:16, width:34, height:34, borderRadius:10, background:LINE, border:`1px solid ${LINE2}`, color:TXT, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          <div style={{ fontSize:11, fontWeight:800, color:R, letterSpacing:1.6, textTransform:"uppercase", marginBottom:10 }}>Guide de démarrage</div>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(23px,5vw,30px)", fontWeight:900, lineHeight:1.08, color:"#fff", letterSpacing:"-1px" }}>
            Opérationnel en <span className="grad-text">15 minutes.</span>
          </h2>
          <p style={{ fontSize:13.5, color:MUT, marginTop:8, lineHeight:1.6 }}>5 étapes pour transformer chaque appel manqué en commande. Suivez-les dans l'ordre, ou revenez quand vous voulez via le bouton <b style={{ color:OR }}>❓ Guide</b>.</p>
        </div>
        {/* étapes */}
        <div style={{ padding:"18px 22px 6px", display:"flex", flexDirection:"column", gap:12 }}>
          {GUIDE_STEPS.map((s, i) => (
            <div key={s.t} className="fu" style={{ display:"flex", gap:14, alignItems:"flex-start", animationDelay:`${i * 60}ms`, background:BG2, border:`1px solid ${LINE}`, borderRadius:16, padding:"14px 16px" }}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <div style={{ width:44, height:44, borderRadius:13, background:`linear-gradient(135deg,${R}26,${OR}12)`, border:`1px solid ${R}35`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:21 }}>{s.i}</div>
                <span style={{ position:"absolute", top:-7, left:-7, width:22, height:22, borderRadius:"50%", background:`linear-gradient(135deg,${R},${OR})`, color:"#fff", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 4px 10px -3px ${R}99` }}>{i + 1}</span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14.5, fontWeight:700, color:TXT, marginBottom:3 }}>{s.t}</div>
                <div style={{ fontSize:13, color:MUT, lineHeight:1.6 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        {/* astuce */}
        <div style={{ margin:"6px 22px 0", background:`${V}10`, border:`1px solid ${V}3A`, borderRadius:14, padding:"12px 15px", display:"flex", gap:11, alignItems:"flex-start" }}>
          <span style={{ fontSize:18 }}>⚡</span>
          <div style={{ fontSize:13, color:"#CFE9DF", lineHeight:1.6 }}>
            <b style={{ color:V }}>Astuce :</b> testez tout de suite ! Le bouton <b>📞 Test</b> simule un appel manqué → SMS → commande, jusqu'au ticket qui tombe en cuisine.
          </div>
        </div>
        {/* pied */}
        <div style={{ padding:"18px 22px 22px", display:"flex", flexDirection:"column", gap:14 }}>
          <PrimaryBtn lg full onClick={onClose}>C'est parti 🚀</PrimaryBtn>
          <div style={{ display:"flex", gap:18, justifyContent:"center", flexWrap:"wrap" }}>
            {link("📞 Tester le parcours", () => { onClose(); go("simulator"); })}
            {link("🔒 Confidentialité", () => { onClose(); go("confidentialite"); })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// RENOUVELLEMENT D'ABONNEMENT (SumUp)
// ═════════════════════════════════════════════════════════════════════
function Renew({ go, user, onLogout }) {
  const plan = PLANS.find(p => p.key === user?.plan) || PLANS[0];
  return (
    <div className="grain" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, position:"relative", background:`radial-gradient(ellipse 70% 45% at 50% 0%, ${R}18, transparent 62%)` }}>
      <div className="fu" style={{ display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", gap:16, maxWidth:430, width:"100%" }}>
        <Logo size={28} />
        <div style={{ fontSize:54, marginTop:4, animation: RM?"none":"floaty 5s ease-in-out infinite" }}>🔓</div>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:"#fff", letterSpacing:"-.6px" }}>Activez votre abonnement</h2>
        <p style={{ fontSize:14.5, color:"#A89FB0", lineHeight:1.7 }}>Activez votre abonnement <strong style={{ color:R }}>{plan.name}</strong> pour accéder à votre tableau de bord et recevoir vos commandes en cuisine.</p>
        <div style={{ background:`linear-gradient(135deg, ${R}16, ${PANEL})`, border:`1px solid ${R}45`, borderRadius:18, padding:"22px", width:"100%", boxShadow:`0 24px 60px -30px ${R}77` }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:38, fontWeight:800, color:"#fff" }}>{plan.price.toFixed(2).replace(".", ",")}€<span style={{ fontSize:14, color:MUT, fontWeight:600 }}>/mois</span></div>
          <div style={{ fontSize:12.5, color:MUT, marginTop:4 }}>sans engagement · résiliable à tout moment</div>
        </div>
        <button type="button" onClick={payerAbonnement} className="sheen" style={{ width:"100%", padding:"16px", borderRadius:14, background:`linear-gradient(135deg,${R},${OR})`, color:"#fff", fontWeight:800, fontSize:15.5, border:"none", cursor:"pointer", fontFamily:"inherit", boxShadow:`0 12px 30px -10px ${R}99` }}>💳 Payer avec SumUp</button>
        <p style={{ fontSize:12, color:FAINT, lineHeight:1.6 }}>Après votre paiement, votre accès est activé automatiquement. En cas de souci, contactez-nous.</p>
        <button type="button" onClick={onLogout} style={{ background:"none", border:"none", color:MUT, fontSize:13, cursor:"pointer", textDecoration:"underline", fontFamily:"inherit" }}>Se déconnecter</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// COMPOSANTS UI PARTAGÉS
// ═════════════════════════════════════════════════════════════════════
function Logo({ size = 18 }) {
  return <div style={{ fontFamily:"'Syne',sans-serif", fontSize:size, fontWeight:900, letterSpacing:"-0.5px", color:"#fff", userSelect:"none" }}>Ad<span style={{ color:R }}>Barth</span></div>;
}
function PrimaryBtn({ children, onClick, lg, sm, full, type = "button", style:st = {} }) {
  const [hov, setHov] = useState(false);
  return (<button type={type} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} className="sheen" style={{ padding: lg ? "16px 32px" : sm ? "9px 17px" : "12px 23px", borderRadius:13, background: `linear-gradient(135deg, ${R}, ${OR})`, color:"#fff", border:"none", fontFamily:"'DM Sans',sans-serif", fontSize: lg ? 15 : sm ? 12.5 : 14, fontWeight:800, letterSpacing:".2px", cursor:"pointer", width: full ? "100%" : "auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7, boxShadow: hov ? `0 12px 30px -8px ${R}88, 0 0 0 1px ${R}55 inset` : `0 6px 18px -8px ${R}66`, transform: hov ? "translateY(-2px)" : "none", ...st }}>{children}</button>);
}
function GhostBtn({ children, onClick, lg, sm, full, type = "button" }) {
  const [hov, setHov] = useState(false);
  return (<button type={type} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ padding: lg ? "16px 28px" : sm ? "9px 17px" : "12px 22px", borderRadius:13, background: hov ? "rgba(255,255,255,.06)" : "transparent", color: hov ? "#fff" : TXT, border:`1.5px solid ${hov ? R+"77" : LINE2}`, fontFamily:"'DM Sans',sans-serif", fontSize: lg ? 15 : sm ? 12.5 : 14, fontWeight:700, cursor:"pointer", width: full ? "100%" : "auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7, transform: hov ? "translateY(-2px)" : "none" }}>{children}</button>);
}
function AdminBtn({ children, onClick, color = R }) {
  return (<button type="button" onClick={onClick} style={{ padding:"6px 11px", borderRadius:8, background:`${color}18`, border:`1px solid ${color}40`, color, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{children}</button>);
}
function StepNav({ title, onBack, step, of }) {
  return (<div className="glass" style={{ borderBottom:`1px solid ${LINE}`, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:20 }}><button type="button" onClick={onBack} style={{ background:LINE, border:`1px solid ${LINE2}`, color:TXT, width:38, height:38, borderRadius:11, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>←</button><div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:15, color:TXT }}>{title}</div><div style={{ fontSize:11, color:MUT, marginTop:1 }}>Étape {step} sur {of}</div></div><div style={{ display:"flex", gap:5 }}>{Array.from({ length:of }, (_, i) => (<div key={i} style={{ height:7, borderRadius:4, background: i < step ? `linear-gradient(90deg,${R},${OR})` : LINE2, width: i < step ? 24 : 7, transition:`all .4s ${EASE}` }}/>))}</div></div>);
}
function TopBar({ title, sub, onBack, dot, badge }) {
  return (<div className="glass" style={{ padding:"13px 16px", borderBottom:`1px solid ${LINE}`, display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}><button type="button" onClick={onBack} style={{ background:LINE, border:`1px solid ${LINE2}`, color:TXT, width:38, height:38, borderRadius:11, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>←</button><div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:15, display:"flex", alignItems:"center", gap:8, color:TXT }}>{title}{badge > 0 && <span style={{ background:R, color:"#fff", borderRadius:20, padding:"1px 9px", fontSize:11, fontWeight:800 }}>{badge}</span>}</div>{sub && (<div style={{ fontSize:12, color:MUT, marginTop:1, display:"flex", alignItems:"center", gap:5 }}>{dot && <span style={{ width:7, height:7, borderRadius:"50%", background:dot, display:"inline-block" }} />}{sub}</div>)}</div><Logo size={15} /></div>);
}
function Section({ children, dark }) {
  return (<section style={{ padding:"clamp(56px,8vw,84px) 5vw", background: dark ? BG1 : BG, borderTop:`1px solid ${LINE}` }}>{children}</section>);
}
function SectionHead({ pill, title }) {
  return (<Reveal style={{ textAlign:"center", marginBottom:48 }}><div style={{ display:"inline-block", fontSize:11, fontWeight:700, color:R, letterSpacing:"1.6px", textTransform:"uppercase", marginBottom:14, background:`${R}12`, border:`1px solid ${R}30`, borderRadius:100, padding:"5px 14px" }}>{pill}</div><h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(24px,3.8vw,44px)", fontWeight:800, letterSpacing:"-1.2px", lineHeight:1.08, color:"#fff", whiteSpace:"pre-line" }}>{title}</h2></Reveal>);
}
function HoverCard({ children, subtle }) {
  const [hov, setHov] = useState(false);
  return (<div className="lift" style={{ background: subtle ? PANEL : BG2, border:`1px solid ${hov ? R+"55" : LINE}`, borderRadius:18, padding:22, height:"100%", transform: hov ? "translateY(-5px)" : "none", boxShadow: hov ? `0 18px 40px -22px ${R}77` : "none", cursor:"default" }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>{children}</div>);
}
function Card({ children, id }) {
  return <div id={id} style={{ background:"#181320", border:"1px solid #241D2F", borderRadius:16, padding:18, display:"flex", flexDirection:"column", gap:14 }}>{children}</div>;
}
function Field({ l, children }) {
  return (<div style={{ display:"flex", flexDirection:"column", gap:6 }}><label style={{ fontSize:11, fontWeight:700, color:"#8A8295", textTransform:"uppercase", letterSpacing:".9px" }}>{l}</label>{children}</div>);
}
function STitle({ children }) {
  return <div style={{ fontSize:18, fontWeight:800, color:"#F2ECE4", letterSpacing:"-0.3px" }}>{children}</div>;
}
function Toggle({ label, sub, value, onChange, accent = V }) {
  return (<div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}><div><div style={{ fontSize:14, fontWeight:600, color:"#F2ECE4" }}>{label}</div>{sub && <div style={{ fontSize:12, color:"#8A8295", marginTop:2 }}>{sub}</div>}</div><div onClick={() => onChange && onChange(!value)} style={{ width:44, height:24, borderRadius:12, background: value ? accent : "#34293F", position:"relative", cursor:"pointer", flexShrink:0 }}><div style={{ position:"absolute", top:3, left: value ? 22 : 3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s" }} /></div></div>);
}
function ToggleSwitch({ value, onChange, accent = V }) {
  return (<div onClick={() => onChange(!value)} style={{ width:40, height:22, borderRadius:11, background: value ? accent : "#34293F", position:"relative", cursor:"pointer", flexShrink:0 }}><div style={{ position:"absolute", top:2, left: value ? 19 : 2, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s" }} /></div>);
}
function SaveBtn({ saved, onClick, accent = R }) {
  return (<button type="button" onClick={onClick} style={{ padding:"15px", borderRadius:14, background: saved ? V : accent, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>{saved ? "✓ Sauvegardé !" : "Sauvegarder les modifications"}</button>);
}
function Spinner() {
  return <div style={{ width:18, height:18, border:"2px solid #fff4", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite" }} />;
}
