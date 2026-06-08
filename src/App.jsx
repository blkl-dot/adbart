import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

// ── Couleurs ──────────────────────────────────────────────────────────
const R = "#FF6B35";
const OR = "#F5A623";
const V = "#22C55E";
const EMOJIS = ["🍔","🍕","🌮","🌯","🫓","🍗","🌭","🍟","🍝","🥗","🍣","🥙","🍜","🥘","🥩","🍖","🍮","🧁","🍰","🥤","🧃","☕","🍵","🍺","🥂","🍷"];

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
    const { data } = await supabase.functions.invoke("creer-paiement", { body: {} });
    if (data?.url) { window.location.href = data.url; return; }
  } catch (e) { /* fonction non déployée → on tente le lien de secours */ }
  if (SUMUP_LINK && !SUMUP_LINK.includes("REMPLACE")) window.open(SUMUP_LINK, "_blank");
  else alert("Le paiement n'est pas encore configuré. Réessaie dans un instant.");
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

// ── CSS global ────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: 'DM Sans', sans-serif; background: #09090F; color: #E8EAF0; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
@keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
@keyframes spin { to { transform:rotate(360deg) } }
@keyframes ring { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-14deg)} 60%{transform:rotate(14deg)} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
@keyframes glow { 0%,100%{box-shadow:0 0 20px #FF6B3535} 50%{box-shadow:0 0 55px #FF6B3570} }
.fu { animation: fadeUp .38s ease both; }
input:focus, textarea:focus, select:focus { outline: none; }
button { font-family: 'DM Sans', sans-serif; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: #252836; border-radius: 4px; }
`;

const I = { width: "100%", background: "#0E0F17", border: "1.5px solid #252836", borderRadius: 11, color: "#E8EAF0", fontSize: 14, padding: "12px 14px", fontFamily: "'DM Sans', sans-serif" };

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
  useEffect(() => db.sub(setOrders), []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("r");
    if (rid) { setPublicResto(rid); setUserId(rid); setPage("chatbot"); setReady(true); return; }
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
  if (!ready) return <><style>{CSS}</style><div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#09090F" }}><Spinner /></div></>;
  return (
    <><style>{CSS}</style>
    <div style={{ minHeight:"100vh", background:"#09090F", color:"#E8EAF0", fontFamily:"'DM Sans',sans-serif" }}>
      {page === "login" && <Login go={go} onLogged={applySession} />}
      {page === "reset" && <Reset go={go} onLogged={applySession} />}
      {page === "landing" && <Landing go={go} />}
      {page === "pricing" && <Pricing go={go} onPick={p => { setPlan(p); go("signup"); }} />}
      {page === "signup" && <Signup go={go} plan={plan} onLogged={applySession} />}
      {page === "admin" && (locked ? <Renew go={go} user={user} onLogout={logout} /> : <Admin user={user} go={go} onLogout={logout} orders={orders} />)}
      {page === "simulator" && (locked ? <Renew go={go} user={user} onLogout={logout} /> : <Simulator go={go} user={user} />)}
      {page === "chatbot" && <Chatbot go={go} user={user} restoId={publicResto || user?.id} isPublic={!!publicResto} />}
      {page === "dashboard" && (locked ? <Renew go={go} user={user} onLogout={logout} /> : <Dashboard go={go} orders={orders} user={user} />)}
      {(page === "mentions" || page === "cgv" || page === "confidentialite") && <Legal doc={page} go={go} />}
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
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ marginBottom:30 }}><Logo size={28} /></div>
      <div style={{ width:"100%", maxWidth:380, background:"#111420", border:"1px solid #181824", borderRadius:20, padding:28 }}>
        {mode === "login" ? <>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, marginBottom:6, color:"#fff" }}>Connexion</h2>
          <p style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>Accédez à votre espace restaurateur.</p>
          <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Field l="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@restaurant.fr" style={I} /></Field>
            <Field l="Mot de passe"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" style={I} /></Field>
            {err && <div style={{ color:"#EF4444", fontSize:13, textAlign:"center" }}>{err}</div>}
            <button type="submit" disabled={loading} style={{ padding:"15px", borderRadius:12, background: loading ? "#252836" : R, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor: loading ? "not-allowed" : "pointer", marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              {loading ? <><Spinner /> Connexion…</> : "Se connecter →"}
            </button>
          </form>
          <p style={{ textAlign:"center", marginTop:14 }}><span onClick={() => { setMode("forgot"); setErr(""); setMsg(""); }} style={{ fontSize:13, color:"#9CA3AF", cursor:"pointer" }}>Mot de passe oublié ?</span></p>
          <div style={{ borderTop:"1px solid #181824", marginTop:18, paddingTop:18, textAlign:"center" }}>
            <p style={{ fontSize:13, color:"#6B7280" }}>Pas encore de compte ?</p>
            <span onClick={() => go("pricing")} style={{ fontSize:13, color:R, fontWeight:700, cursor:"pointer" }}>Créer un compte →</span>
            <span onClick={() => go("landing")} style={{ display:"block", marginTop:8, fontSize:12, color:"#555B6E", cursor:"pointer" }}>Découvrir AdBarth</span>
          </div>
        </> : <>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, marginBottom:6, color:"#fff" }}>Mot de passe oublié</h2>
          <p style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>Entrez votre email, nous vous enverrons un lien pour le réinitialiser.</p>
          <form onSubmit={sendReset} style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Field l="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@restaurant.fr" style={I} /></Field>
            {err && <div style={{ color:"#EF4444", fontSize:13, textAlign:"center" }}>{err}</div>}
            {msg && <div style={{ color:V, fontSize:13, textAlign:"center", lineHeight:1.6 }}>{msg}</div>}
            <button type="submit" disabled={loading} style={{ padding:"15px", borderRadius:12, background: loading ? "#252836" : R, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor: loading ? "not-allowed" : "pointer", marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
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
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ marginBottom:30 }}><Logo size={28} /></div>
      <div style={{ width:"100%", maxWidth:380, background:"#111420", border:"1px solid #181824", borderRadius:20, padding:28 }}>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, marginBottom:6, color:"#fff" }}>Nouveau mot de passe</h2>
        <p style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>Choisissez un nouveau mot de passe pour votre compte.</p>
        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Field l="Nouveau mot de passe"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="•••••••• (6 min)" style={I} /></Field>
          <Field l="Confirmer le mot de passe"><input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="••••••••" style={I} /></Field>
          {err && <div style={{ color:"#EF4444", fontSize:13, textAlign:"center" }}>{err}</div>}
          {okMsg && <div style={{ color:V, fontSize:13, textAlign:"center", fontWeight:700 }}>{okMsg}</div>}
          <button type="submit" disabled={loading || !!okMsg} style={{ padding:"15px", borderRadius:12, background: (loading || okMsg) ? "#252836" : R, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor: (loading || okMsg) ? "not-allowed" : "pointer", marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {loading ? <><Spinner /> Mise à jour…</> : okMsg ? "Redirection…" : "Mettre à jour →"}
          </button>
        </form>
        <p style={{ textAlign:"center", marginTop:16 }}><span onClick={() => go("login")} style={{ fontSize:13, color:"#9CA3AF", cursor:"pointer" }}>← Annuler</span></p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// LANDING
// ═════════════════════════════════════════════════════════════════════
function Landing({ go }) {
  return (
    <div>
      <nav style={{ position:"sticky", top:0, zIndex:100, height:62, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 5vw", background:"rgba(9,9,15,.94)", backdropFilter:"blur(20px)", borderBottom:"1px solid #181824" }}>
        <Logo />
        <div style={{ display:"flex", gap:10 }}>
          <GhostBtn sm onClick={() => go("login")}>Se connecter</GhostBtn>
          <PrimaryBtn sm onClick={() => go("pricing")}>Commencer →</PrimaryBtn>
        </div>
      </nav>
      <section style={{ minHeight:"92vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"90px 20px 70px", textAlign:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse 80% 55% at 50% -5%, ${R}1C 0%, transparent 65%)`, pointerEvents:"none" }} />
        <div style={{ position:"absolute", inset:0, opacity:.12, backgroundImage:`linear-gradient(#1E2030 1px,transparent 1px),linear-gradient(90deg,#1E2030 1px,transparent 1px)`, backgroundSize:"54px 54px", maskImage:"radial-gradient(ellipse 72% 62% at 50% 50%,black,transparent)" }} />
        <div className="fu" style={{ display:"inline-flex", alignItems:"center", gap:8, background:`${R}18`, border:`1px solid ${R}45`, borderRadius:100, padding:"6px 18px", fontSize:11, fontWeight:700, color:R, letterSpacing:"1.3px", textTransform:"uppercase", marginBottom:28 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:R, animation:"blink 1.4s infinite" }} />
          Nouveau · Spécial Restaurants
        </div>
        <h1 className="fu" style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(30px,5.5vw,68px)", fontWeight:900, lineHeight:1.05, letterSpacing:"-2px", color:"#fff", maxWidth:760, marginBottom:24, animationDelay:".1s" }}>
          Pendant que vous cuisinez,<br />
          <span style={{ color:R }}>vos clients partent ailleurs.</span>
        </h1>
        <p className="fu" style={{ fontSize:"clamp(14px,1.8vw,18px)", color:"#6B7280", maxWidth:500, lineHeight:1.75, marginBottom:40, animationDelay:".2s" }}>
          AdBarth envoie un SMS automatique à chaque appel manqué. Le client clique sur le lien, commande ou réserve — et la commande arrive directement en cuisine.
        </p>
        <div className="fu" style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center", marginBottom:20, animationDelay:".3s" }}>
          <PrimaryBtn lg onClick={() => go("pricing")}>Récupérer mes appels manqués →</PrimaryBtn>
          <GhostBtn lg onClick={() => go("simulator")}>📞 Voir la démo</GhostBtn>
        </div>
        <p className="fu" style={{ fontSize:13, color:"#555B6E", animationDelay:".4s" }}>
          <strong style={{ color:"#E8EAF0" }}>À partir de 29,90€/mois</strong> · Sans engagement · Installation en 15 min
        </p>
        <p className="fu" style={{ fontSize:13, color:"#9CA3AF", animationDelay:".45s", marginTop:14 }}>
          Déjà un compte ? <span onClick={() => go("login")} style={{ color:R, fontWeight:700, cursor:"pointer" }}>Se connecter →</span>
        </p>
        <div className="fu" style={{ display:"flex", alignItems:"center", flexWrap:"wrap", justifyContent:"center", marginTop:60, animationDelay:".5s" }}>
          {[
            { i:"📵", l:"Appel manqué" },
            { i:"💬", l:"SMS + lien" },
            { i:"🤖", l:"Client commande" },
            { i:"🍽️", l:"Arrive en cuisine" },
          ].map((s, idx) => (
            <div key={idx} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, padding:"14px 20px", background: idx % 2 === 1 ? `${R}12` : "#111420", border:`1px solid ${idx % 2 === 1 ? R+"45" : "#181824"}`, borderRadius:14, minWidth:90 }}>
                <span style={{ fontSize:24 }}>{s.i}</span>
                <span style={{ fontSize:10, fontWeight:700, color: idx % 2 === 1 ? R : "#6B7280", textAlign:"center", lineHeight:1.3 }}>{s.l}</span>
              </div>
              {idx < 3 && <span style={{ color:R, fontSize:16, padding:"0 5px", opacity:.65 }}>→</span>}
            </div>
          ))}
        </div>
      </section>
      <div style={{ display:"flex", flexWrap:"wrap", borderTop:"1px solid #181824", borderBottom:"1px solid #181824" }}>
        {[
          { n:"85%", l:"des clients ne rappellent jamais" },
          { n:"3s", l:"délai d'envoi du SMS" },
          { n:"+34%",l:"de commandes récupérées" },
          { n:"0%", l:"de commission sur vos ventes" },
        ].map((s, i) => (
          <div key={i} style={{ flex:1, minWidth:130, padding:"22px 14px", textAlign:"center", borderRight: i < 3 ? "1px solid #181824" : "none" }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:900, color:R, lineHeight:1, marginBottom:6 }}>{s.n}</div>
            <div style={{ fontSize:12, color:"#6B7280", fontWeight:600, lineHeight:1.4 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <Section dark>
        <SectionHead pill="Comment ça marche" title={"4 étapes.\nZéro effort de votre part."} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:18, maxWidth:880, margin:"0 auto" }}>
          {[
            { n:"01", i:"📵", t:"Appel manqué détecté", d:"Un client appelle. Vous êtes occupé. AdBarth détecte l'appel manqué en temps réel, dès la première sonnerie sans réponse." },
            { n:"02", i:"💬", t:"SMS envoyé en 3 secondes", d:`Le client reçoit un SMS avec un lien cliquable : "Nous n'avons pas pu répondre. Cliquez ici pour commander ou réserver 👉 [lien]"` },
            { n:"03", i:"🤖", t:"Le client clique et commande", d:"Le lien ouvre votre chatbot. Le client choisit sur votre menu, réserve une table ou pose une question, en totale autonomie, 24h/24." },
            { n:"04", i:"🍽️", t:"Commande en cuisine", d:"La commande s'affiche instantanément sur votre écran cuisine. Zéro saisie manuelle, zéro appel, zéro erreur." },
          ].map(s => (
            <HoverCard key={s.n}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:36, fontWeight:900, color:`${R}1C`, marginBottom:10, lineHeight:1 }}>{s.n}</div>
              <div style={{ fontSize:26, marginBottom:10 }}>{s.i}</div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:8, color:"#E8EAF0" }}>{s.t}</div>
              <div style={{ fontSize:13, color:"#6B7280", lineHeight:1.65 }}>{s.d}</div>
            </HoverCard>
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
          ].map(w => (
            <HoverCard key={w.t} subtle>
              <div style={{ width:44, height:44, background:`${R}18`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, marginBottom:14 }}>{w.i}</div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:7, color:"#E8EAF0" }}>{w.t}</div>
              <div style={{ fontSize:13, color:"#6B7280", lineHeight:1.6 }}>{w.d}</div>
            </HoverCard>
          ))}
        </div>
      </Section>
      <Section dark>
        <SectionHead pill="Comparaison" title={"AdBarth vs plateformes\nde livraison"} />
        <div style={{ maxWidth:580, margin:"0 auto", background:"#111420", border:"1px solid #181824", borderRadius:20, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", padding:"10px 18px", background:"#0E0F17", borderBottom:"1px solid #181824" }}>
            <div style={{ fontSize:11, color:"#555B6E", fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Critère</div>
            <div style={{ fontSize:11, color:R, fontWeight:800, textAlign:"center", textTransform:"uppercase", letterSpacing:1 }}>AdBarth</div>
            <div style={{ fontSize:11, color:"#555B6E", fontWeight:700, textAlign:"center", textTransform:"uppercase", letterSpacing:1 }}>Uber Eats</div>
          </div>
          {[
            { l:"Commission par commande", a:"0%", b:"25–30%" },
            { l:"SMS appel manqué", a:"✓", b:"✗" },
            { l:"Chatbot commande propre", a:"✓", b:"✗" },
            { l:"Dashboard cuisine", a:"✓", b:"✗" },
            { l:"Vos clients restent vôtres", a:"✓",b:"✗" },
            { l:"Coût mensuel", a:"Fixe dès 29,90€", b:"Variable + %" },
          ].map((row, i) => (
            <div key={row.l} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", padding:"13px 18px", borderBottom: i < 5 ? "1px solid #181824" : "none", background: i % 2 === 1 ? "#0E0F17" : "transparent" }}>
              <div style={{ fontSize:13, color:"#9CA3AF" }}>{row.l}</div>
              <div style={{ fontSize:13, fontWeight:800, color:V, textAlign:"center" }}>{row.a}</div>
              <div style={{ fontSize:13, fontWeight:600, color:"#EF4444", textAlign:"center" }}>{row.b}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section>
        <SectionHead pill="Témoignages" title="Ce que disent les restaurateurs" />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:18, maxWidth:880, margin:"0 auto" }}>
          {[
            { t:"Pendant le rush du vendredi on ratait 15-20 appels. Maintenant ces clients reçoivent un SMS et commandent en ligne. On a récupéré des commandes qu'on aurait perdues.", n:"Karim B.", r:"Restaurant · Lyon" },
            { t:"J'étais sur Uber Eats, je payais une fortune en commission. AdBarth m'a coûté 49€ le premier mois et j'ai récupéré mes clients directement. Rentable dès la première semaine.", n:"Sarah M.", r:"Fast-food · Paris" },
            { t:"Le dashboard cuisine a changé notre organisation. Les commandes en ligne arrivent au même endroit, mon équipe ne rate plus rien.", n:"Naïm B.", r:"Fast-food · Marseille" },
          ].map(t => (
            <div key={t.n} style={{ background:"#111420", border:"1px solid #181824", borderRadius:18, padding:24 }}>
              <div style={{ color:OR, fontSize:14, letterSpacing:3, marginBottom:14 }}>★★★★★</div>
              <div style={{ fontSize:14, color:"#C8CAD4", lineHeight:1.7, marginBottom:16, fontStyle:"italic" }}>« {t.t} »</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${R},${OR})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff", flexShrink:0 }}>{t.n[0]}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{t.n}</div>
                  <div style={{ fontSize:11, color:"#6B7280" }}>{t.r}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <section style={{ padding:"90px 5vw", textAlign:"center", background:`linear-gradient(180deg, #09090F 0%, ${R}0A 50%, #09090F 100%)` }}>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(26px,4.5vw,54px)", fontWeight:900, letterSpacing:"-1.5px", marginBottom:16, maxWidth:680, margin:"0 auto 16px" }}>
          Prêt à ne plus rater aucun client ?
        </h2>
        <p style={{ color:"#6B7280", fontSize:16, marginBottom:36 }}>Installation en 15 minutes. Sans engagement.</p>
        <PrimaryBtn lg onClick={() => go("pricing")}>Démarrer maintenant →</PrimaryBtn>
      </section>
      <footer style={{ borderTop:"1px solid #181824", padding:"26px 5vw", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:14 }}>
        <Logo />
        <div style={{ fontSize:13, color:"#555B6E" }}>© 2025 AdBarth · Tous droits réservés</div>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
          {[{ l:"Mentions légales", p:"mentions" }, { l:"CGV", p:"cgv" }, { l:"Confidentialité", p:"confidentialite" }].map(x => (<span key={x.p} onClick={() => go(x.p)} style={{ fontSize:13, color:"#555B6E", cursor:"pointer" }}>{x.l}</span>))}
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
    <div style={{ minHeight:"100vh", paddingBottom:60 }}>
      <StepNav title="Choisissez votre plan" onBack={() => go("landing")} step={1} of={2} />
      <div style={{ padding:"40px 20px", maxWidth:960, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(22px,3.5vw,40px)", fontWeight:900, letterSpacing:"-1px", marginBottom:12 }}>Simple. Transparent. Sans surprise.</h2>
          <p style={{ color:"#6B7280", fontSize:15 }}>Pas de commission sur vos commandes. Pas de frais cachés. Juste un forfait fixe.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(255px,1fr))", gap:20 }}>
          {PLANS.map(p => (
            <div key={p.key} style={{ background:"#111420", border:`1.5px solid ${p.popular ? R : "#181824"}`, borderRadius:22, padding:28, position:"relative", boxShadow: p.popular ? `0 0 55px ${R}1C` : "none" }}>
              {p.popular && (<div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", background:R, color:"#fff", padding:"4px 18px", borderRadius:100, fontSize:11, fontWeight:800, whiteSpace:"nowrap" }}>⭐ Le plus choisi</div>)}
              <div style={{ fontSize:12, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>{p.name}</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:46, fontWeight:900, color:"#fff", lineHeight:1, marginBottom:4 }}>
                <sup style={{ fontSize:20, verticalAlign:"top", marginTop:8, display:"inline-block" }}>€</sup>{p.price.toFixed(2).replace(".", ",")}
              </div>
              <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>par mois · sans engagement</div>
              <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:10, marginBottom:26 }}>
                {p.features.map(f => (<li key={f} style={{ fontSize:13, color:"#E8EAF0", display:"flex", gap:9, alignItems:"flex-start" }}><span style={{ color:V, fontWeight:800, flexShrink:0 }}>✓</span>{f}</li>))}
                {p.missing.map(f => (<li key={f} style={{ fontSize:13, color:"#555B6E", display:"flex", gap:9, alignItems:"flex-start" }}><span style={{ flexShrink:0 }}>—</span>{f}</li>))}
              </ul>
              <button onClick={() => onPick(p)} style={{ width:"100%", padding:"14px", borderRadius:12, background: p.popular ? R : "transparent", color: p.popular ? "#fff" : "#E8EAF0", border: p.popular ? "none" : "1.5px solid #252836", fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer" }}>Choisir ce plan →</button>
            </div>
          ))}
        </div>
        <p style={{ textAlign:"center", fontSize:13, color:"#9CA3AF", marginTop:30 }}>
          Déjà un compte ? <span onClick={() => go("login")} style={{ color:R, fontWeight:700, cursor:"pointer" }}>Se connecter →</span>
        </p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SIGNUP
// ═════════════════════════════════════════════════════════════════════
function Signup({ go, plan, onLogged }) {
  const [f, setF] = useState({ name:"", email:"", phone:"", resto:"", pass:"", pass2:"" });
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
    <div style={{ minHeight:"100vh", paddingBottom:60 }}>
      <StepNav title="Créer votre compte" onBack={() => go("pricing")} step={2} of={2} />
      <div style={{ padding:"32px 20px", maxWidth:450, margin:"0 auto" }}>
        <div style={{ background:"#111420", border:"1px solid #181824", borderRadius:14, padding:"14px 18px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:12, color:"#6B7280", fontWeight:700 }}>Plan sélectionné</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:900, color:R, marginTop:2 }}>{chosenPlan.name}</div>
          </div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900 }}>{chosenPlan.price.toFixed(2).replace(".", ",")}€<span style={{ fontSize:12, color:"#6B7280", fontWeight:600 }}>/mois</span></div>
        </div>
        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:13 }}>
          <Field l="Prénom & Nom *"><input value={f.name} onChange={e => setF(v => ({ ...v, name:e.target.value }))} placeholder="Jean Dupont" style={I} /></Field>
          <Field l="Adresse email *"><input type="email" value={f.email} onChange={e => setF(v => ({ ...v, email:e.target.value }))} placeholder="jean@monrestaurant.fr" style={I} /></Field>
          <Field l="Téléphone (optionnel)"><input value={f.phone} onChange={e => setF(v => ({ ...v, phone:e.target.value }))} placeholder="+33 6 00 11 22 33" style={I} /></Field>
          <Field l="Nom de votre restaurant *"><input value={f.resto} onChange={e => setF(v => ({ ...v, resto:e.target.value }))} placeholder="Le Petit Bistrot" style={I} /></Field>
          <Field l="Mot de passe *"><input type="password" value={f.pass} onChange={e => setF(v => ({ ...v, pass:e.target.value }))} placeholder="•••••••• (6 min)" style={I} /></Field>
          <Field l="Confirmer le mot de passe *"><input type="password" value={f.pass2} onChange={e => setF(v => ({ ...v, pass2:e.target.value }))} placeholder="••••••••" style={I} /></Field>
          {err && <div style={{ color: err.startsWith("Compte créé") ? V : "#EF4444", fontSize:13, textAlign:"center", padding:"6px 0" }}>{err}</div>}
          <button type="submit" disabled={loading} style={{ padding:"15px", borderRadius:12, background: loading ? "#252836" : R, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor: loading ? "not-allowed" : "pointer", marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
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
function Admin({ user, go, onLogout, orders = [] }) {
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
  const [form, setForm] = useState({ cat:"", name:"", price:"", emoji:"🍔", desc:"" });
  const [editId, setEditId] = useState(null);
  const [newCat, setNewCat] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const [showEm, setShowEm] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      const { data } = await supabase.from("comptes").select("config, menu, cats").eq("id", user.id).single();
      if (!alive || !data) return;
      if (data.config) setCfg(c => ({ ...c, ...data.config }));
      if (Array.isArray(data.menu)) setMenu(data.menu);
      if (Array.isArray(data.cats) && data.cats.length) setCats(data.cats);
    })();
    return () => { alive = false; };
  }, []);
  const accent = cfg.color;
  const publicLink = (typeof window !== "undefined" && user?.id) ? `${window.location.origin}/?r=${user.id}` : "";
  const aboFin = user?.aboFin ? new Date(user.aboFin) : null;
  const daysLeft = aboFin ? Math.ceil((aboFin.getTime() - Date.now()) / 86400000) : null;
  useEffect(() => { if (tab === "stats") db.reload(); }, [tab]);
  const cmdList = orders.filter(o => o.type === "commande");
  const resList = orders.filter(o => o.type === "reservation");
  const ca = cmdList.reduce((s, o) => s + (parseFloat(String(o.total).replace(/[^\d.,]/g, "").replace(",", ".")) || 0), 0);
  async function save() {
    try {
      if (user?.id) await supabase.from("comptes").update({ config: cfg, menu, cats }).eq("id", user.id);
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
    const clean = { ...form, name: sanitizeText(form.name, 60), desc: sanitizeText(form.desc, LIMITS.text), price: String(price) };
    if (editId !== null) { setMenu(m => m.map(i => i.id === editId ? { ...clean, id:editId, on:true } : i)); setEditId(null); }
    else { setMenu(m => [...m, { ...clean, id: uid(), on:true }]); }
    setForm({ cat:form.cat, name:"", price:"", emoji:"🍔", desc:"" });
  }
  function startEdit(item) {
    setForm({ cat:item.cat, name:item.name, price:item.price, emoji:item.emoji, desc:item.desc });
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
      <div style={{ background:"#111420", borderBottom:"1px solid #181824", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:20 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Logo size={16} />
            <span style={{ fontSize:10, fontWeight:700, color:"#6B7280", background:"#181824", border:"1px solid #252836", borderRadius:20, padding:"2px 10px", letterSpacing:.5 }}>ADMIN</span>
            <span style={{ fontSize:10, fontWeight:800, color:R, background:`${R}18`, border:`1px solid ${R}45`, borderRadius:20, padding:"2px 10px" }}>{planName}</span>
          </div>
          <div style={{ fontSize:11, color:"#6B7280", marginTop:2 }}>{cfg.name || user?.resto}</div>
        </div>
        <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" }}>
          <AdminBtn color={R} onClick={() => go("simulator")}>📞 Test</AdminBtn>
          <AdminBtn color={V} onClick={() => go("chatbot")}>💬 Chatbot</AdminBtn>
          <AdminBtn color="#3B82F6" onClick={() => go("dashboard")}>🍽️ Cuisine</AdminBtn>
          <AdminBtn color="#9CA3AF" onClick={onLogout}>⏻ Déco</AdminBtn>
          <ToggleSwitch value={cfg.active} onChange={v => setCfg(c => ({ ...c, active:v }))} accent={V} />
        </div>
      </div>
      <div style={{ background:`linear-gradient(135deg,${accent}18,${accent}06)`, borderBottom:`1px solid ${accent}30`, padding:"12px 18px", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:22 }}>🎉</span>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:accent }}>Bienvenue, {user?.name?.split(" ")[0] || "cher restaurateur"} !</div>
          <div style={{ fontSize:12, color:"#9CA3AF", marginTop:1 }}>Commencez par renseigner les infos de votre restaurant, puis ajoutez votre menu.</div>
        </div>
      </div>
      {daysLeft !== null && daysLeft <= 5 && (
        <div style={{ background:`${OR}18`, borderBottom:`1px solid ${OR}50`, padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, fontWeight:700, color:OR }}>⏳ Votre abonnement expire dans {daysLeft <= 0 ? "moins d'un jour" : `${daysLeft} jour${daysLeft > 1 ? "s" : ""}`}.</span>
          <button type="button" onClick={payerAbonnement} style={{ padding:"7px 14px", borderRadius:20, background:R, color:"#fff", fontSize:12, fontWeight:700, border:"none", cursor:"pointer", fontFamily:"inherit" }}>Renouveler →</button>
        </div>
      )}
      <div style={{ display:"flex", background:"#09090F", borderBottom:"1px solid #181824", overflowX:"auto" }}>
        {TABS.map(t => (<button key={t.k} onClick={() => setTab(t.k)} style={{ flex:1, minWidth:60, padding:"10px 4px", background:"none", border:"none", borderBottom: tab === t.k ? `2px solid ${accent}` : "2px solid transparent", color: tab === t.k ? accent : "#6B7280", fontSize:10, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}><span style={{ fontSize:16 }}>{t.i}</span>{t.l}</button>))}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:16 }}>
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
                <span style={{ fontSize:14, fontWeight:600, fontFamily:"monospace", color:"#E8EAF0" }}>{cfg.color}</span>
                <div style={{ flex:1, height:38, borderRadius:10, background:cfg.color, boxShadow:`0 4px 18px ${cfg.color}60` }} />
              </div>
            </Field>
          </Card>
          <Card>
            <div style={{ fontSize:13, fontWeight:700, color:accent, marginBottom:4 }}>🔗 Votre lien client</div>
            <p style={{ fontSize:12, color:"#6B7280", lineHeight:1.6 }}>C'est le lien à envoyer par SMS. Vos clients l'ouvrent sans compte et commandent directement.</p>
            <div style={{ background:"#0E0F17", border:"1px solid #252836", borderRadius:10, padding:"10px 12px", fontSize:12, color:"#E8EAF0", wordBreak:"break-all", fontFamily:"monospace" }}>{publicLink || "Connectez-vous pour générer votre lien"}</div>
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(publicLink); setToast("✓ Lien copié"); setTimeout(() => setToast(""), 2000); } catch (e) { setToast("Copie impossible, sélectionnez le lien"); setTimeout(() => setToast(""), 2500); } }} style={{ flex:1, padding:"11px", borderRadius:10, background:accent, color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>📋 Copier le lien</button>
              <button type="button" onClick={() => publicLink && window.open(publicLink, "_blank")} style={{ padding:"11px 16px", borderRadius:10, background:"#181824", color:"#E8EAF0", border:"1px solid #252836", fontWeight:700, fontSize:13, cursor:"pointer" }}>Ouvrir ↗</button>
            </div>
          </Card>
          <SaveBtn saved={saved} onClick={save} accent={accent} />
        </>}
        {tab === "sms" && <>
          <STitle>Configuration SMS automatique</STitle>
          <Card>
            <div style={{ fontSize:11, fontWeight:700, color:V, letterSpacing:1, marginBottom:8 }}>VARIABLES DISPONIBLES</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
              {["{nom}", "{lien}", "{horaires}"].map(v => (<span key={v} style={{ background:"#181824", border:"1px solid #252836", borderRadius:8, padding:"4px 10px", fontSize:12, color:accent, fontWeight:700, fontFamily:"monospace" }}>{v}</span>))}
            </div>
            <p style={{ fontSize:12, color:"#555B6E" }}>{"{lien}"} = lien cliquable qui ouvre votre chatbot</p>
          </Card>
          <Card>
            <Field l="Message SMS envoyé au client"><textarea value={cfg.sms} onChange={e => setCfg(c => ({ ...c, sms:e.target.value }))} rows={4} maxLength={320} style={{ ...I, resize:"none", lineHeight:1.7 }} /></Field>
          </Card>
          <Card>
            <div style={{ fontSize:11, fontWeight:700, color:"#6B7280", letterSpacing:1, marginBottom:12 }}>APERÇU SMS REÇU PAR LE CLIENT</div>
            <div style={{ background:"#0E0F17", borderRadius:"16px 16px 16px 4px", padding:"14px 16px", fontSize:14, lineHeight:1.8, border:"1px solid #181824", wordBreak:"break-word", color:"#E8EAF0" }}>
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
              {cats.map(cat => (<span key={cat} style={{ background:"#181824", border:`1px solid ${accent}45`, borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:700, color:accent, display:"flex", alignItems:"center", gap:6 }}>{cat} <span onClick={() => setCats(cs => cs.filter(x => x !== cat))} style={{ cursor:"pointer", color:"#6B7280", fontWeight:900, fontSize:15, lineHeight:1 }}>×</span></span>))}
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
                <button type="button" onClick={() => setShowEm(v => !v)} style={{ background:"#0E0F17", border:"1.5px solid #252836", borderRadius:10, padding:"9px 14px", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", gap:8, color:"#E8EAF0" }}>{form.emoji} <span style={{ fontSize:12, color:"#6B7280" }}>Changer ▾</span></button>
                {showEm && (<div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:10, background:"#0E0F17", border:"1px solid #252836", borderRadius:12, padding:12, maxHeight:150, overflowY:"auto" }}>{EMOJIS.map(em => (<button key={em} type="button" onClick={() => { setForm(f => ({ ...f, emoji:em })); setShowEm(false); }} style={{ fontSize:22, background:"none", border:"none", cursor:"pointer", padding:5, borderRadius:8 }}>{em}</button>))}</div>)}
              </div>
            </Field>
            <Field l="Catégorie">
              <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat:e.target.value }))} style={I}><option value="">Choisir une catégorie…</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>
            </Field>
            <Field l="Nom du plat"><input value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder="ex: Magret de canard" maxLength={60} style={I} /></Field>
            <Field l="Prix (€)"><input value={form.price} onChange={e => setForm(f => ({ ...f, price:e.target.value }))} placeholder="ex: 18.50" type="number" step="0.01" min="0" max="1000" style={I} /></Field>
            <Field l="Description (optionnel)"><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc:e.target.value }))} placeholder="ex: Pommes sarladaises" maxLength={120} style={I} /></Field>
            <div style={{ display:"flex", gap:10 }}>
              <button type="button" onClick={addItem} style={{ flex:1, padding:"12px", borderRadius:12, background:accent, color:"#fff", border:"none", fontWeight:700, fontSize:14, cursor:"pointer" }}>{editId !== null ? "✓ Mettre à jour" : "➕ Ajouter au menu"}</button>
              {editId !== null && (<button type="button" onClick={() => { setEditId(null); setForm({ cat:"", name:"", price:"", emoji:"🍔", desc:"" }); }} style={{ padding:"12px 14px", borderRadius:12, background:"#181824", color:"#9CA3AF", border:"1px solid #252836", fontWeight:700, fontSize:13, cursor:"pointer" }}>Annuler</button>)}
            </div>
          </Card>
          {menu.length === 0 && (<div style={{ textAlign:"center", color:"#555B6E", padding:"32px 0" }}><div style={{ fontSize:36, marginBottom:10 }}>🍽️</div><div style={{ fontSize:14 }}>Votre menu est vide.<br />Ajoutez votre premier plat ci-dessus.</div></div>)}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:1.5, marginBottom:10, paddingLeft:4 }}>{cat} · {items.length} article{items.length > 1 ? "s" : ""}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {items.map(item => (
                  <div key={item.id} className="fu" style={{ background: item.on ? "#111420" : "#0C0D14", border:`1px solid ${item.on ? "#252836" : "#181824"}`, borderRadius:14, padding:14, display:"flex", alignItems:"center", gap:12, opacity: item.on ? 1 : .45 }}>
                    <span style={{ fontSize:26, flexShrink:0 }}>{item.emoji}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#E8EAF0" }}>{item.name}</div>
                      {item.desc && <div style={{ fontSize:11, color:"#6B7280", marginTop:2 }}>{item.desc}</div>}
                      <div style={{ fontSize:13, fontWeight:800, color:OR, marginTop:5 }}>{item.price}€</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                      <button type="button" onClick={() => setMenu(m => m.map(i => i.id === item.id ? { ...i, on:!i.on } : i))} style={{ padding:"5px 10px", borderRadius:8, fontSize:10, fontWeight:700, background: item.on ? `${V}20` : "#6B728020", border:`1px solid ${item.on ? V+"45" : "#6B728045"}`, color: item.on ? V : "#9CA3AF", cursor:"pointer" }}>{item.on ? "Actif" : "Caché"}</button>
                      <button type="button" onClick={() => startEdit(item)} style={{ padding:"5px 10px", borderRadius:8, fontSize:10, fontWeight:700, background:"#181824", border:"1px solid #252836", color:"#E8EAF0", cursor:"pointer" }}>✏️ Éditer</button>
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
            {[{ l:"Commandes", v:String(cmdList.length), i:"🍔" },{ l:"Réservations", v:String(resList.length), i:"📅" },{ l:"CA commandes", v:`${ca.toFixed(2).replace(".", ",")}€`, i:"💰" },{ l:"Total reçus", v:String(orders.length), i:"📈" },{ l:"SMS envoyés", v:"—", i:"💬" },{ l:"Clics chatbot", v:"—", i:"👆" }].map(s => (<div key={s.l} style={{ background:"#111420", border:"1px solid #181824", borderRadius:16, padding:"18px 16px" }}><div style={{ fontSize:22, marginBottom:8 }}>{s.i}</div><div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:900, color:accent, lineHeight:1 }}>{s.v}</div><div style={{ fontSize:11, color:"#6B7280", marginTop:7, fontWeight:600 }}>{s.l}</div></div>))}
          </div>
          <p style={{ fontSize:11, color:"#555B6E", textAlign:"center", lineHeight:1.6 }}>« SMS envoyés » et « Clics » s'afficheront quand le vrai système SMS sera branché.</p>
          <div style={{ background:"#111420", border:"1px solid #181824", borderRadius:16, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:16, fontWeight:800 }}>Plan {planName}</div><div style={{ fontSize:12, color: daysLeft !== null && daysLeft <= 5 ? OR : "#6B7280", marginTop:3 }}>{aboFin ? `Actif jusqu'au ${aboFin.toLocaleDateString("fr-FR")} · ${daysLeft <= 0 ? "expiré" : daysLeft + " jour" + (daysLeft > 1 ? "s" : "") + " restant" + (daysLeft > 1 ? "s" : "")}` : "Abonnement mensuel"}</div></div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:900, color:accent }}>{planPrice.toFixed(2).replace(".", ",")}€<span style={{ fontSize:12, color:"#6B7280", fontWeight:600 }}>/mois</span></div>
            </div>
            <button type="button" onClick={payerAbonnement} style={{ display:"block", width:"100%", textAlign:"center", marginTop:14, padding:"11px", borderRadius:10, background: daysLeft !== null && daysLeft <= 5 ? R : "#181824", color:"#fff", fontWeight:700, fontSize:13, border: daysLeft !== null && daysLeft <= 5 ? "none" : "1px solid #252836", cursor:"pointer", fontFamily:"inherit" }}>💳 Renouveler avec SumUp</button>
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
        <div style={{ width:174, height:296, background:"#111420", borderRadius:36, border:`2px solid ${phase === "ringing" ? R : "#252836"}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, position:"relative", overflow:"hidden", animation: phase === "ringing" ? "glow 1s ease-in-out infinite" : "none" }}>
          {phase === "ringing" && <div style={{ position:"absolute", inset:0, background:`radial-gradient(circle,${R}18 0%,transparent 70%)`, animation:"pulse .7s ease-in-out infinite" }} />}
          <div style={{ fontSize:54, animation: phase === "ringing" ? "ring .42s ease-in-out infinite" : "none" }}>{phase === "idle" ? "📵" : phase === "ringing" ? "📱" : phase === "missed" ? "📵" : "💬"}</div>
          <div style={{ fontSize:13, textAlign:"center", padding:"0 20px", lineHeight:1.7 }}>
            {phase === "idle" && <span style={{ color:"#6B7280" }}>Prêt à simuler</span>}
            {phase === "ringing" && <span style={{ color:R, fontWeight:700, whiteSpace:"pre-line" }}>{"Appel entrant…\n+33 6 00 11 22 33"}</span>}
            {phase === "missed" && <span style={{ color:"#EF4444", fontWeight:700 }}>Appel manqué</span>}
            {phase === "sms" && <span style={{ color:V, fontWeight:700 }}>SMS envoyé ✓</span>}
          </div>
        </div>
        <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:10 }}>
          {steps.map((s, i) => (<div key={i} style={{ display:"flex", alignItems:"center", gap:12, background: s.done ? `${V}0E` : "#111420", border:`1px solid ${s.done ? V+"45" : "#181824"}`, borderRadius:12, padding:"12px 16px" }}><span style={{ fontSize:18 }}>{s.done ? "✅" : "⬜"}</span><span style={{ fontSize:14, fontWeight:600, color: s.done ? V : "#6B7280" }}>{s.l}</span></div>))}
        </div>
        {phase === "sms" && (<div className="fu" style={{ width:"100%", background:"#111420", border:`1px solid ${V}40`, borderRadius:16, padding:16 }}><div style={{ fontSize:10, fontWeight:700, color:V, letterSpacing:1.2, marginBottom:10 }}>SMS REÇU PAR LE CLIENT</div><div style={{ background:"#0E0F17", borderRadius:"16px 16px 16px 4px", padding:"13px 16px", fontSize:14, lineHeight:1.8, color:"#E8EAF0", border:"1px solid #181824" }}>Bonjour ! Nous n'avons pas pu répondre à votre appel. Cliquez ici pour commander ou réserver 👉 <span onClick={() => go("chatbot")} style={{ color:R, textDecoration:"underline", cursor:"pointer", fontWeight:700 }}>Ouvrir le chatbot →</span></div></div>)}
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
  const [cart, setCart] = useState([]); // {id,name,emoji,price,qty}
  const [resv, setResv] = useState({});
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const ref = useRef(null);

  function bot(t, d = 420) { setTimeout(() => setMsgs(p => [...p, { r:"bot", t }]), d); }
  function usr(t) { setMsgs(p => [...p, { r:"usr", t }]); }

  // Charge le menu et les réglages du restaurant (vue publique, sans connexion)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (isPublic && restoId) setUserId(restoId); // les commandes du client iront vers ce restaurant
      if (!restoId) { setLoadingMenu(false); return; }
      const { data } = await supabase.from("public_restaurants").select("resto, menu, cats, config").eq("id", restoId).single();
      if (!alive) return;
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
  function addToCart(item) {
    setCart(cur => {
      const ex = cur.find(c => c.id === item.id);
      if (ex) return cur.map(c => c.id === item.id ? { ...c, qty: Math.min(LIMITS.qty.max, c.qty + 1) } : c);
      return [...cur, { id:item.id, name:item.name, emoji:item.emoji, price:priceNum(item.price), qty:1 }];
    });
  }
  function changeQty(id, delta) {
    setCart(cur => cur.flatMap(c => {
      if (c.id !== id) return [c];
      const q = Math.min(LIMITS.qty.max, c.qty + delta);
      return q < 1 ? [] : [{ ...c, qty:q }];
    }));
  }
  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);

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
    const lines = cart.map(c => `${c.qty}× ${c.name}`).join("\n");
    bot(`Voici votre commande :\n\n${lines}\n\n💰 Total : ${cartTotal.toFixed(2)}€\n\nJe confirme ?`, 300);
  }

  function proc(txt) {
    const t = txt.toLowerCase();
    if (flow === "welcome" || flow === "intent") {
      if (t.includes("command") || t.includes("emport") || t.includes("🍔") || t.includes("manger")) {
        if (menu.length === 0) { bot("Le menu n'est pas encore disponible en ligne. Appelez-nous directement pour commander 🙏", 450); return; }
        setFlow("order_cat"); bot("Bien sûr ! Choisissez une catégorie 👇", 400);
      }
      else if (t.includes("réserv") || t.includes("table") || t.includes("📅")) { setFlow("resv_persons"); bot("Pour combien de personnes souhaitez-vous réserver ?", 450); }
      else if (t.includes("info") || t.includes("horaire") || t.includes("❓")) { setFlow("faq"); bot("Sur quoi puis-je vous renseigner ?", 450); }
      else { bot("Je peux vous aider à commander, réserver une table, ou répondre à vos questions. Que souhaitez-vous ?", 400); }
      return;
    }
    if (flow === "order_confirm") {
      if (t.includes("confirm") || t.includes("oui") || t.includes("✅") || t.includes("ok")) { confirmOrder(); }
      else if (t.includes("modif") || t.includes("✏") || t.includes("non")) { setFlow("order_items"); bot("D'accord, modifiez votre panier 👇", 300); }
      return;
    }
    if (flow === "resv_persons") {
      const num = clampInt(txt, LIMITS.persons.min, LIMITS.persons.max);
      const raw = parseInt(String(txt).replace(/[^\d]/g, ""), 10);
      if (!isNaN(raw) && raw > LIMITS.persons.max) { bot(`Pour un groupe de plus de ${LIMITS.persons.max} personnes, merci d'appeler directement le restaurant 🙏`, 450); return; }
      if (num) { setResv(r => ({ ...r, persons:num })); setFlow("resv_date"); bot(`Parfait, table pour ${num} 👍\nPour quelle date ? (ex: ce soir, demain…)`, 500); }
      else { bot("Combien de personnes serez-vous ? (ex: 2, 4…)", 400); }
      return;
    }
    if (flow === "resv_date") { setResv(r => ({ ...r, date:sanitizeText(txt, 40) })); setFlow("resv_time"); bot("À quelle heure souhaitez-vous venir ?", 500); return; }
    if (flow === "resv_time") { setResv(r => ({ ...r, time:sanitizeText(txt, 30) })); setFlow("resv_note"); bot("Une note ? (allergie, occasion…) Ou tapez \"non\".", 500); return; }
    if (flow === "resv_note") {
      const note = (t === "non" || t === "rien") ? "" : sanitizeText(txt, LIMITS.note);
      const r2 = { ...resv, note }; setResv(r2); setFlow("resv_confirm");
      setTimeout(() => bot(`Récapitulatif :\n\n📅 ${r2.date} à ${r2.time}\n👥 ${r2.persons} personne${r2.persons > 1 ? "s" : ""}${r2.note ? "\n📝 " + r2.note : ""}\n\nTout est correct ?`, 500), 0);
      return;
    }
    if (flow === "resv_confirm") {
      if (t.includes("confirm") || t.includes("oui") || t.includes("✅") || t.includes("ok")) { confirmResv(); }
      else if (t.includes("modif") || t.includes("non") || t.includes("✏")) { setResv({}); setFlow("resv_persons"); bot("Pas de problème ! Pour combien de personnes ?", 400); }
      return;
    }
    if (flow === "faq") {
      const h1 = cfg?.hours1 || "12:00 – 14:30", h2 = cfg?.hours2 || "19:00 – 23:30";
      if (t.includes("horaire") || t.includes("ouvert")) { bot(`🕐 Midi : ${h1} / Soir : ${h2} · 7j/7`, 400); }
      else if (t.includes("livr")) { bot("🛵 Pas de livraison pour le moment, mais commande à emporter possible !", 400); }
      else if (t.includes("allerg")) { bot("⚠️ Précisez votre allergie lors de la commande.", 400); }
      else if (t.includes("retour") || t.includes("↩")) { setFlow("intent"); bot("D'accord ! Commander ou réserver ?", 400); }
      else { bot("Pour toute autre question, appelez-nous ! 😊", 400); }
      return;
    }
    bot("Je n'ai pas bien compris. Pouvez-vous reformuler ?", 400);
  }
  function confirmOrder() {
    const items = cart.map(c => `${c.qty}× ${c.name}`);
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
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" }}>
      <TopBar title={`🍽️ ${restoName}`} sub="Commandes & Réservations" onBack={() => go(user ? "admin" : "landing")} dot={V} />
      <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 8px", display:"flex", flexDirection:"column", gap:12 }}>
        {msgs.map((m, i) => (<div key={i} className="fu" style={{ display:"flex", justifyContent: m.r === "usr" ? "flex-end" : "flex-start", gap:8 }}>{m.r === "bot" && <div style={{ width:32, height:32, background:`${R}25`, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0, alignSelf:"flex-end" }}>🤖</div>}<div style={{ maxWidth:"80%", background: m.r === "usr" ? R : "#111420", border: m.r === "bot" ? "1px solid #181824" : "none", borderRadius: m.r === "usr" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding:"12px 14px", fontSize:14, lineHeight:1.8, color:"#E8EAF0", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{m.t}</div></div>))}

        {/* Choix des catégories */}
        {inOrder && (
          <div className="fu" style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {catsWithItems.map(c => (
              <button key={c} type="button" onClick={() => { setSelCat(c); if (flow === "order_cat") pickCat(c); }} style={{ padding:"8px 14px", borderRadius:22, background: selCat === c ? R : "#111420", border:`1.5px solid ${selCat === c ? R : R+"40"}`, color: selCat === c ? "#fff" : R, fontSize:13, fontWeight:700, cursor:"pointer" }}>{c}</button>
            ))}
          </div>
        )}

        {/* Articles de la catégorie sélectionnée */}
        {flow === "order_items" && selCat && (
          <div className="fu" style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {items.map(it => (
              <div key={it.id} style={{ display:"flex", alignItems:"center", gap:12, background:"#111420", border:"1px solid #252836", borderRadius:14, padding:"10px 14px" }}>
                <span style={{ fontSize:24 }}>{it.emoji}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#E8EAF0" }}>{it.name}</div>
                  {it.desc && <div style={{ fontSize:11, color:"#6B7280", marginTop:1 }}>{it.desc}</div>}
                  <div style={{ fontSize:13, fontWeight:800, color:OR, marginTop:3 }}>{priceNum(it.price).toFixed(2)}€</div>
                </div>
                <button type="button" onClick={() => addToCart(it)} style={{ padding:"8px 14px", borderRadius:10, background:R, color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>＋ Ajouter</button>
              </div>
            ))}
          </div>
        )}

        {/* Panier */}
        {inOrder && cart.length > 0 && (
          <div className="fu" style={{ background:"#111420", border:`1px solid ${R}45`, borderRadius:14, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:R, letterSpacing:1, marginBottom:10 }}>🛒 VOTRE PANIER</div>
            {cart.map(c => (
              <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:8 }}>
                <div style={{ fontSize:13, color:"#E8EAF0", flex:1, minWidth:0 }}>{c.emoji} {c.name}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button type="button" onClick={() => changeQty(c.id, -1)} style={{ width:26, height:26, borderRadius:7, background:"#181824", border:"1px solid #252836", color:"#E8EAF0", fontSize:16, cursor:"pointer", lineHeight:1 }}>−</button>
                  <span style={{ fontSize:14, fontWeight:700, minWidth:18, textAlign:"center" }}>{c.qty}</span>
                  <button type="button" onClick={() => changeQty(c.id, 1)} disabled={c.qty >= LIMITS.qty.max} style={{ width:26, height:26, borderRadius:7, background: c.qty >= LIMITS.qty.max ? "#181824" : R, border:"none", color:"#fff", fontSize:16, cursor: c.qty >= LIMITS.qty.max ? "not-allowed" : "pointer", lineHeight:1 }}>＋</button>
                  <span style={{ fontSize:13, fontWeight:800, color:OR, minWidth:54, textAlign:"right" }}>{(c.price * c.qty).toFixed(2)}€</span>
                </div>
              </div>
            ))}
            <div style={{ borderTop:"1px solid #252836", marginTop:8, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:800, fontSize:15 }}>
              <span>Total</span><span style={{ color:OR }}>{cartTotal.toFixed(2)}€</span>
            </div>
            <button type="button" onClick={startRecap} style={{ width:"100%", marginTop:12, padding:"12px", borderRadius:12, background:V, color:"#fff", border:"none", fontWeight:800, fontSize:14, cursor:"pointer" }}>Valider la commande →</button>
            <p style={{ fontSize:11, color:"#555B6E", textAlign:"center", marginTop:8 }}>Maximum {LIMITS.qty.max} par article</p>
          </div>
        )}

        {done && (<div className="fu" style={{ background:`${V}10`, border:`1px solid ${V}45`, borderRadius:14, padding:16, textAlign:"center" }}><div style={{ fontSize:14, fontWeight:700, color:V, marginBottom: isPublic ? 0 : 12 }}>🎉 Transmis au restaurant !</div>{!isPublic && <button type="button" onClick={() => go("dashboard")} style={{ padding:"10px 24px", borderRadius:22, background:V, color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Voir dans le dashboard →</button>}</div>)}
        <div ref={ref} />
      </div>
      {curQR.length > 0 && !done && (<div style={{ padding:"8px 14px", display:"flex", gap:8, overflowX:"auto", borderTop:"1px solid #181824", background:"#09090F" }}>{curQR.map(r => (<button key={r} type="button" onClick={() => q(r)} style={{ flexShrink:0, padding:"8px 14px", borderRadius:22, background:"#111420", border:`1px solid ${R}50`, color:R, fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit" }}>{r}</button>))}</div>)}
      {isPublic && <p style={{ fontSize:10, color:"#555B6E", textAlign:"center", padding:"6px 16px 0", background:"#09090F" }}>En validant une commande, vous acceptez le traitement de vos informations pour la gérer. <span onClick={() => go("confidentialite")} style={{ color:"#9CA3AF", textDecoration:"underline", cursor:"pointer" }}>Confidentialité</span></p>}
      <div style={{ padding:"10px 14px 24px", background:"#09090F", borderTop:"1px solid #181824", display:"flex", gap:10, alignItems:"center" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Écrivez votre message…" maxLength={200} style={{ flex:1, background:"#111420", border:"1.5px solid #252836", borderRadius:14, color:"#E8EAF0", fontSize:14, padding:"12px 14px", fontFamily:"inherit" }} />
        <button type="button" onClick={send} disabled={!input.trim()} style={{ width:46, height:46, borderRadius:13, flexShrink:0, background: input.trim() ? R : "#252836", border:"none", cursor: input.trim() ? "pointer" : "not-allowed", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#fff" }}>➤</button>
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
      {flash && (<div className="fu" style={{ background:`${V}18`, borderBottom:`1px solid ${V}55`, padding:"10px 16px", textAlign:"center", fontSize:14, fontWeight:800, color:V }}>🔔 Nouvelle commande reçue !</div>)}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"8px 14px", background:"#09090F", borderBottom:"1px solid #181824", flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:"#6B7280", display:"flex", alignItems:"center", gap:6 }}><span style={{ width:7, height:7, borderRadius:"50%", background:V, display:"inline-block", animation:"blink 1.6s infinite" }} />En direct</span>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <select value={soundType} onChange={e => { const v = e.target.value; setSoundType(v); ensureAudio(); playSound(audioRef.current, v); }} style={{ padding:"7px 10px", borderRadius:20, background:"#111420", border:"1px solid #252836", color:"#E8EAF0", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {SOUNDS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button type="button" onClick={() => { ensureAudio(); beep(); }} style={{ padding:"6px 12px", borderRadius:20, background:"#181824", border:"1px solid #252836", color:"#E8EAF0", fontSize:12, fontWeight:700, cursor:"pointer" }}>🔊 Tester</button>
          <button type="button" onClick={() => { ensureAudio(); setSoundOn(s => !s); }} style={{ padding:"6px 12px", borderRadius:20, background: soundOn ? `${V}18` : "#181824", border:`1px solid ${soundOn ? V+"55" : "#252836"}`, color: soundOn ? V : "#9CA3AF", fontSize:12, fontWeight:700, cursor:"pointer" }}>{soundOn ? "🔔 Activé" : "🔕 Coupé"}</button>
        </div>
      </div>
      <div style={{ display:"flex", background:"#09090F", borderBottom:"1px solid #181824", padding:"0 12px" }}>
        {[{ k:"en_cours", l:"⏳ En cours" }, { k:"pret", l:"✅ Prêt" }, { k:"all", l:"📋 Tout" }].map(t => (<button key={t.k} type="button" onClick={() => setFilter(t.k)} style={{ flex:1, padding:"12px 4px", background:"none", border:"none", borderBottom: filter === t.k ? `2px solid ${R}` : "2px solid transparent", color: filter === t.k ? R : "#6B7280", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{t.l}</button>))}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:14 }}>
        {list.length === 0 && (<div style={{ textAlign:"center", color:"#555B6E", marginTop:60 }}><div style={{ fontSize:44, marginBottom:14 }}>🍽️</div><div style={{ fontSize:15 }}>Aucune commande ici pour le moment.</div></div>)}
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
    <div className="fu" style={{ background:"#111420", border:`1.5px solid ${isPret ? V+"55" : isCmd ? R+"45" : "#3B82F645"}`, borderRadius:18, overflow:"hidden" }}>
      <div style={{ background: isPret ? `${V}15` : isCmd ? `${R}10` : "#3B82F610", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:22 }}>{isCmd ? "🍔" : "📅"}</span><div><div style={{ fontWeight:800, fontSize:15, color:"#E8EAF0" }}>{o.id}</div><div style={{ fontSize:12, color:"#6B7280", marginTop:1 }}>{o.client} · {o.time}</div></div></div>
        <div style={{ fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:20, background: isPret ? `${V}25` : "#6B728022", border:`1px solid ${isPret ? V+"55" : "#6B728050"}`, color: isPret ? V : "#9CA3AF" }}>{isPret ? "✓ Prêt" : "En cours"}</div>
      </div>
      <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:6 }}>
        {o.items.map((it, j) => (<div key={j} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, color:"#C8CAD4" }}><span style={{ color:R, fontSize:11 }}>▸</span>{it}</div>))}
        {o.note && <div style={{ marginTop:6, fontSize:12, color:"#6B7280", background:"#181824", borderRadius:8, padding:"6px 10px" }}>📝 {o.note}</div>}
      </div>
      <div style={{ padding:"10px 16px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontWeight:800, fontSize:18, color:OR }}>{o.total}</div>
        <div style={{ display:"flex", gap:8 }}>
          {!isPret && status !== "termine" && (<button type="button" onClick={() => upd("pret")} style={{ padding:"9px 20px", borderRadius:10, background:V, color:"#fff", border:"none", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>✓ Marquer prêt</button>)}
          {isPret && (<button type="button" onClick={() => upd("termine")} style={{ padding:"9px 20px", borderRadius:10, background:"#181824", color:"#9CA3AF", border:"1px solid #252836", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Terminer</button>)}
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
      { h: "Durée de conservation", p: "Les commandes et réservations sont conservées [12 mois par défaut], puis supprimées. Les coordonnées des clients ne sont pas conservées au-delà de cette durée sans consentement." },
      { h: "Destinataires", p: "Les données sont accessibles au restaurant concerné et aux sous-traitants techniques (hébergement : Vercel, Supabase)." },
      { h: "Vos droits", p: "Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition. Pour les exercer : [EMAIL]." },
      { h: "Réclamation", p: "Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr)." },
      { h: "Cookies", p: "Le site n'utilise que les technologies strictement nécessaires à son fonctionnement (authentification)." },
    ],
  },
};
function Legal({ doc, go }) {
  const d = LEGAL_DOCS[doc] || LEGAL_DOCS.mentions;
  return (
    <div style={{ minHeight:"100vh", maxWidth:760, margin:"0 auto" }}>
      <TopBar title={d.title} onBack={() => go("landing")} />
      <div style={{ padding:"24px 20px 60px" }}>
        <div style={{ background:`${OR}12`, border:`1px solid ${OR}40`, borderRadius:12, padding:14, marginBottom:24, fontSize:13, color:"#E8EAF0", lineHeight:1.6 }}>
          ⚠️ Modèle à compléter : remplacez les champs entre crochets […] par vos informations réelles, et faites relire ce document par un professionnel avant la mise en ligne.
        </div>
        {d.sections.map((s, i) => (
          <div key={i} style={{ marginBottom:22 }}>
            {s.h && <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:800, color:"#fff", marginBottom:8 }}>{s.h}</h3>}
            <p style={{ fontSize:14, color:"#C8CAD4", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{s.p}</p>
          </div>
        ))}
        <p style={{ fontSize:12, color:"#555B6E", marginTop:30 }}>Dernière mise à jour : [à compléter].</p>
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
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, textAlign:"center", gap:16, maxWidth:440, margin:"0 auto" }}>
      <Logo size={26} />
      <div style={{ fontSize:52, marginTop:6 }}>⏳</div>
      <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, color:"#fff" }}>Activez votre abonnement</h2>
      <p style={{ fontSize:14, color:"#9CA3AF", lineHeight:1.7 }}>Activez votre abonnement <strong style={{ color:R }}>{plan.name}</strong> pour accéder à votre tableau de bord et recevoir vos commandes.</p>
      <div style={{ background:"#111420", border:`1px solid ${R}40`, borderRadius:16, padding:"18px 22px", width:"100%" }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:34, fontWeight:900, color:"#fff" }}>{plan.price.toFixed(2).replace(".", ",")}€<span style={{ fontSize:13, color:"#6B7280", fontWeight:600 }}>/mois</span></div>
      </div>
      <button type="button" onClick={payerAbonnement} style={{ width:"100%", padding:"15px", borderRadius:12, background:R, color:"#fff", fontWeight:800, fontSize:15, border:"none", cursor:"pointer", fontFamily:"inherit" }}>💳 Payer avec SumUp</button>
      <p style={{ fontSize:12, color:"#555B6E", lineHeight:1.6 }}>Après votre paiement, votre accès est activé automatiquement. En cas de souci, contactez-nous.</p>
      <button type="button" onClick={onLogout} style={{ background:"none", border:"none", color:"#6B7280", fontSize:13, cursor:"pointer", textDecoration:"underline", fontFamily:"inherit" }}>Se déconnecter</button>
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
  return (<button type={type} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ padding: lg ? "15px 30px" : sm ? "8px 16px" : "11px 22px", borderRadius:12, background: hov ? "#FF8555" : R, color:"#fff", border:"none", fontFamily:"'DM Sans',sans-serif", fontSize: lg ? 15 : sm ? 12 : 14, fontWeight:800, cursor:"pointer", width: full ? "100%" : "auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, ...st }}>{children}</button>);
}
function GhostBtn({ children, onClick, lg, sm, full, type = "button" }) {
  const [hov, setHov] = useState(false);
  return (<button type={type} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ padding: lg ? "15px 28px" : sm ? "8px 16px" : "11px 22px", borderRadius:12, background: hov ? "rgba(255,255,255,.05)" : "transparent", color: hov ? "#fff" : "#E8EAF0", border:`1.5px solid ${hov ? "#888" : "#252836"}`, fontFamily:"'DM Sans',sans-serif", fontSize: lg ? 15 : sm ? 12 : 14, fontWeight:700, cursor:"pointer", width: full ? "100%" : "auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 }}>{children}</button>);
}
function AdminBtn({ children, onClick, color = R }) {
  return (<button type="button" onClick={onClick} style={{ padding:"6px 11px", borderRadius:8, background:`${color}18`, border:`1px solid ${color}40`, color, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{children}</button>);
}
function StepNav({ title, onBack, step, of }) {
  return (<div style={{ background:"#111420", borderBottom:"1px solid #181824", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:20 }}><button type="button" onClick={onBack} style={{ background:"#181824", border:"none", color:"#E8EAF0", width:36, height:36, borderRadius:10, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>←</button><div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:15, color:"#E8EAF0" }}>{title}</div><div style={{ fontSize:11, color:"#6B7280", marginTop:1 }}>Étape {step} sur {of}</div></div><div style={{ display:"flex", gap:5 }}>{Array.from({ length:of }, (_, i) => (<div key={i} style={{ height:7, borderRadius:4, background: i < step ? R : "#252836", width: i < step ? 22 : 7 }} />))}</div></div>);
}
function TopBar({ title, sub, onBack, dot, badge }) {
  return (<div style={{ padding:"13px 16px", background:"#111420", borderBottom:"1px solid #181824", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}><button type="button" onClick={onBack} style={{ background:"#181824", border:"none", color:"#E8EAF0", width:36, height:36, borderRadius:10, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>←</button><div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:15, display:"flex", alignItems:"center", gap:8, color:"#E8EAF0" }}>{title}{badge > 0 && <span style={{ background:R, color:"#fff", borderRadius:20, padding:"1px 9px", fontSize:11, fontWeight:800 }}>{badge}</span>}</div>{sub && (<div style={{ fontSize:12, color:"#6B7280", marginTop:1, display:"flex", alignItems:"center", gap:5 }}>{dot && <span style={{ width:7, height:7, borderRadius:"50%", background:dot, display:"inline-block" }} />}{sub}</div>)}</div><Logo size={15} /></div>);
}
function Section({ children, dark }) {
  return (<section style={{ padding:"72px 5vw", background: dark ? "#0D0E16" : "#09090F", borderTop:"1px solid #181824", borderBottom:"1px solid #181824" }}>{children}</section>);
}
function SectionHead({ pill, title }) {
  return (<div style={{ textAlign:"center", marginBottom:48 }}><div style={{ fontSize:11, fontWeight:700, color:R, letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:12 }}>{pill}</div><h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(22px,3.5vw,40px)", fontWeight:900, letterSpacing:"-1px", color:"#fff", whiteSpace:"pre-line" }}>{title}</h2></div>);
}
function HoverCard({ children, subtle }) {
  const [hov, setHov] = useState(false);
  return (<div style={{ background: subtle ? "#111420" : "#0E0F17", border:`1px solid ${hov ? R+"50" : "#181824"}`, borderRadius:18, padding:22, transform: hov ? "translateY(-4px)" : "none", cursor:"default" }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>{children}</div>);
}
function Card({ children, id }) {
  return <div id={id} style={{ background:"#111420", border:"1px solid #181824", borderRadius:16, padding:18, display:"flex", flexDirection:"column", gap:14 }}>{children}</div>;
}
function Field({ l, children }) {
  return (<div style={{ display:"flex", flexDirection:"column", gap:6 }}><label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:".9px" }}>{l}</label>{children}</div>);
}
function STitle({ children }) {
  return <div style={{ fontSize:18, fontWeight:800, color:"#E8EAF0", letterSpacing:"-0.3px" }}>{children}</div>;
}
function Toggle({ label, sub, value, onChange, accent = V }) {
  return (<div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}><div><div style={{ fontSize:14, fontWeight:600, color:"#E8EAF0" }}>{label}</div>{sub && <div style={{ fontSize:12, color:"#6B7280", marginTop:2 }}>{sub}</div>}</div><div onClick={() => onChange && onChange(!value)} style={{ width:44, height:24, borderRadius:12, background: value ? accent : "#252836", position:"relative", cursor:"pointer", flexShrink:0 }}><div style={{ position:"absolute", top:3, left: value ? 22 : 3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s" }} /></div></div>);
}
function ToggleSwitch({ value, onChange, accent = V }) {
  return (<div onClick={() => onChange(!value)} style={{ width:40, height:22, borderRadius:11, background: value ? accent : "#252836", position:"relative", cursor:"pointer", flexShrink:0 }}><div style={{ position:"absolute", top:2, left: value ? 19 : 2, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s" }} /></div>);
}
function SaveBtn({ saved, onClick, accent = R }) {
  return (<button type="button" onClick={onClick} style={{ padding:"15px", borderRadius:14, background: saved ? V : accent, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>{saved ? "✓ Sauvegardé !" : "Sauvegarder les modifications"}</button>);
}
function Spinner() {
  return <div style={{ width:18, height:18, border:"2px solid #fff4", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite" }} />;
}
