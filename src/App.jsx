import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

// ── Couleurs ──────────────────────────────────────────────────────────
const R = "#FF6B35";
const OR = "#F5A623";
const V = "#22C55E";
const EMOJIS = ["🍔","🍕","🌮","🌯","🫓","🍗","🌭","🍟","🍝","🥗","🍣","🥙","🍜","🥘","🥩","🍖","🍮","🧁","🍰","🥤","🧃","☕","🍵","🍺","🥂","🍷"];

// ── Plans ─────────────────────────────────────────────────────────────
const PLANS = [
  { key:"starter", name:"Starter", price:29, features:["SMS automatique appel manqué","Chatbot commande simple","Jusqu'à 100 SMS/mois"], missing:["Dashboard cuisine temps réel","Réservations en ligne","Support prioritaire"] },
  { key:"pro", name:"Pro", price:59, popular:true, features:["SMS automatique appel manqué","Chatbot commande + réservation","SMS illimités","Dashboard cuisine temps réel","Réservations en ligne"], missing:["Support prioritaire 7j/7"] },
  { key:"premium", name:"Premium", price:99, features:["SMS automatique appel manqué","Chatbot commande + réservation","SMS illimités","Dashboard cuisine temps réel","Réservations en ligne","Support prioritaire 7j/7"], missing:[] },
];

// ── Base de données Supabase (liée au compte connecté) ─
let _orders = [];
let _subs = [];
let _userId = null;
const notify = () => _subs.forEach(f => f([..._orders]));
export const setUserId = id => { _userId = id; };

async function loadOrders() {
  if (!_userId) { _orders = []; notify(); return; }
  const { data, error } = await supabase
    .from("commandes")
    .select("*")
    .eq("compte_id", _userId)
    .order("cree_le", { ascending: false });
  if (!error && data) {
    _orders = data.map(d => ({
      id: d.ref || d.id,
      _dbid: d.id,
      type: d.type,
      client: d.client,
      items: d.items || [],
      total: d.total,
      note: d.note || "",
      status: d.status,
      time: d.cree_le ? new Date(d.cree_le).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) : "",
    }));
    notify();
  }
}

const db = {
  sub: fn => { _subs.push(fn); loadOrders(); return () => { _subs = _subs.filter(s => s !== fn); }; },
  reload: () => loadOrders(),
  add: async o => {
    _orders = [o, ..._orders];
    notify();
    await supabase.from("commandes").insert({
      compte_id: _userId,
      ref: o.id, type: o.type, client: o.client,
      items: o.items, total: o.total, note: o.note || "", status: o.status,
    });
    loadOrders();
  },
  upd: async (id, s) => {
    _orders = _orders.map(o => o.id === id ? { ...o, status: s } : o);
    notify();
    await supabase.from("commandes").update({ status: s }).eq("ref", id).eq("compte_id", _userId);
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
// ROOT — routeur + gestion de session Supabase
// ═════════════════════════════════════════════════════════════════════
export default function AdBarth() {
  const [page, setPage] = useState("login");
  const [plan, setPlan] = useState(null);
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => db.sub(setOrders), []);

  // Vérifie la session au chargement + écoute les changements
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) applySession(data.session.user);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) applySession(session.user);
      else { setUserId(null); setUser(null); db.reload(); }
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  async function applySession(authUser) {
    setUserId(authUser.id);
    const { data } = await supabase.from("comptes").select("*").eq("id", authUser.id).single();
    const u = {
      email: authUser.email,
      name: data?.nom || authUser.user_metadata?.nom || "",
      resto: data?.resto || authUser.user_metadata?.resto || "Mon restaurant",
      phone: data?.telephone || authUser.user_metadata?.telephone || "",
    };
    setUser(u);
    db.reload();
    setPage("admin");
  }

  const logout = async () => { await supabase.auth.signOut(); setUser(null); setUserId(null); setPage("login"); };
  const go = p => { setPage(p); window.scrollTo(0, 0); };

  if (!ready) return <><style>{CSS}</style><div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#09090F" }}><Spinner /></div></>;

  return (
    <><style>{CSS}</style>
    <div style={{ minHeight:"100vh", background:"#09090F", color:"#E8EAF0", fontFamily:"'DM Sans',sans-serif" }}>
      {page === "login" && <Login go={go} onLogged={applySession} />}
      {page === "landing" && <Landing go={go} />}
      {page === "pricing" && <Pricing go={go} onPick={p => { setPlan(p); go("signup"); }} />}
      {page === "signup" && <Signup go={go} plan={plan} onLogged={applySession} />}
      {page === "admin" && <Admin user={user} go={go} onLogout={logout} />}
      {page === "simulator" && <Simulator go={go} user={user} />}
      {page === "chatbot" && <Chatbot go={go} user={user} />}
      {page === "dashboard" && <Dashboard go={go} orders={orders} />}
    </div></>
  );
}

// ═════════════════════════════════════════════════════════════════════
// LOGIN — connexion Supabase
// ═════════════════════════════════════════════════════════════════════
function Login({ go, onLogged }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setLoading(false);
    if (error) { setErr("Email ou mot de passe incorrect."); return; }
    if (data?.user) onLogged(data.user);
  }
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ marginBottom:30 }}><Logo size={28} /></div>
      <div style={{ width:"100%", maxWidth:380, background:"#111420", border:"1px solid #181824", borderRadius:20, padding:28 }}>
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
        <div style={{ borderTop:"1px solid #181824", marginTop:22, paddingTop:18, textAlign:"center" }}>
          <p style={{ fontSize:13, color:"#6B7280" }}>Pas encore de compte ?</p>
          <span onClick={() => go("pricing")} style={{ fontSize:13, color:R, fontWeight:700, cursor:"pointer" }}>Créer un compte →</span>
          <span onClick={() => go("landing")} style={{ display:"block", marginTop:8, fontSize:12, color:"#555B6E", cursor:"pointer" }}>Découvrir AdBarth</span>
        </div>
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
          AdBarth envoie un SMS automatique à chaque appel manqué. Le client clique, commande ou réserve — et la commande arrive directement en cuisine.
        </p>
        <div className="fu" style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center", marginBottom:20, animationDelay:".3s" }}>
          <PrimaryBtn lg onClick={() => go("pricing")}>Récupérer mes appels manqués →</PrimaryBtn>
          <GhostBtn lg onClick={() => go("simulator")}>📞 Voir la démo</GhostBtn>
        </div>
        <p className="fu" style={{ fontSize:13, color:"#555B6E", animationDelay:".4s" }}>
          <strong style={{ color:"#E8EAF0" }}>À partir de 29€/mois</strong> · Sans engagement · Installation en 15 min
        </p>
        <div className="fu" style={{ display:"flex", alignItems:"center", flexWrap:"wrap", justifyContent:"center", marginTop:60, animationDelay:".5s" }}>
          {[
            { i:"📵", l:"Appel manqué" },
            { i:"💬", l:"SMS automatique" },
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
            { n:"02", i:"💬", t:"SMS envoyé en 3 secondes", d:`Le client reçoit : "Bonjour ! Nous n'avons pas pu répondre. Cliquez ici pour prendre RDV ou passer une commande 👉 [lien]"` },
            { n:"03", i:"🤖", t:"Chatbot prend la commande", d:"Le client choisit sur votre vrai menu, réserve une table ou pose une question. Le chatbot gère tout, 24h/24." },
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
            { i:"🤖", t:"Chatbot de commande", d:"Votre vrai menu, vos catégories. Le client commande ou réserve en totale autonomie." },
            { i:"🍽️", t:"Dashboard cuisine", d:"Commandes et réservations arrivent en temps réel sur votre écran cuisine." },
            { i:"💰", t:"0% de commission", d:"Forfait fixe mensuel. Pas 25-30% prélevés sur chaque commande comme Uber Eats." },
            { i:"⚡", t:"15 min d'installation", d:"Entrez votre menu via l'interface admin, on configure le reste. Opérationnel le jour même." },
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
            { l:"Coût mensuel", a:"Fixe dès 29€", b:"Variable + %" },
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
            { t:"Le dashboard cuisine a changé notre organisation. Les commandes en ligne arrivent au même endroit. Mon équipe adore et on ne rate plus rien.", n:"Naïm B.", r:"Fast-food · Marseille" },
          ].map(t => (
            <div key={t.n} style={{ background:"#111420", border:"1px solid #181824", borderRadius:18, padding:24, transition:"border-color .2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = `${OR}45`}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#181824"}>
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
        <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
          <PrimaryBtn lg onClick={() => go("pricing")}>Démarrer maintenant →</PrimaryBtn>
          <GhostBtn lg onClick={() => go("simulator")}>📞 Tester la démo</GhostBtn>
        </div>
        <p style={{ fontSize:12, color:"#555B6E", marginTop:20 }}>À partir de 29€/mois · Sans engagement · Support en français</p>
      </section>
      <footer style={{ borderTop:"1px solid #181824", padding:"26px 5vw", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:14 }}>
        <Logo />
        <div style={{ fontSize:13, color:"#555B6E" }}>© 2025 AdBarth · Tous droits réservés</div>
        <div style={{ display:"flex", gap:20 }}>
          {["Mentions légales", "CGV", "Confidentialité", "Contact"].map(l => (
            <span key={l} style={{ fontSize:13, color:"#555B6E", cursor:"pointer", transition:"color .15s" }}
              onMouseEnter={e => e.currentTarget.style.color="#E8EAF0"}
              onMouseLeave={e => e.currentTarget.style.color="#555B6E"}>{l}</span>
          ))}
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
      <StepNav title="Choisissez votre plan" onBack={() => go("login")} step={1} of={2} />
      <div style={{ padding:"40px 20px", maxWidth:960, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(22px,3.5vw,40px)", fontWeight:900, letterSpacing:"-1px", marginBottom:12 }}>Simple. Transparent. Sans surprise.</h2>
          <p style={{ color:"#6B7280", fontSize:15 }}>Pas de commission sur vos commandes. Pas de frais cachés. Juste un forfait fixe.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(255px,1fr))", gap:20 }}>
          {PLANS.map(p => (
            <div key={p.key} style={{ background:"#111420", border:`1.5px solid ${p.popular ? R : "#181824"}`, borderRadius:22, padding:28, position:"relative", boxShadow: p.popular ? `0 0 55px ${R}1C` : "none", transition:"transform .25s" }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "none"}>
              {p.popular && (
                <div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", background:R, color:"#fff", padding:"4px 18px", borderRadius:100, fontSize:11, fontWeight:800, whiteSpace:"nowrap" }}>⭐ Le plus choisi</div>
              )}
              <div style={{ fontSize:12, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>{p.name}</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:46, fontWeight:900, color:"#fff", lineHeight:1, marginBottom:4 }}>
                <sup style={{ fontSize:20, verticalAlign:"top", marginTop:8, display:"inline-block" }}>€</sup>{p.price}
              </div>
              <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>par mois · sans engagement</div>
              <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:10, marginBottom:26 }}>
                {p.features.map(f => (
                  <li key={f} style={{ fontSize:13, color:"#E8EAF0", display:"flex", gap:9, alignItems:"flex-start" }}>
                    <span style={{ color:V, fontWeight:800, flexShrink:0 }}>✓</span>{f}
                  </li>
                ))}
                {p.missing.map(f => (
                  <li key={f} style={{ fontSize:13, color:"#555B6E", display:"flex", gap:9, alignItems:"flex-start" }}>
                    <span style={{ flexShrink:0 }}>—</span>{f}
                  </li>
                ))}
              </ul>
              <button onClick={() => onPick(p)} style={{ width:"100%", padding:"14px", borderRadius:12, background: p.popular ? R : "transparent", color: p.popular ? "#fff" : "#E8EAF0", border: p.popular ? "none" : "1.5px solid #252836", fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer", boxShadow: p.popular ? `0 4px 24px ${R}45` : "none", transition:"all .2s" }}>
                Choisir ce plan →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SIGNUP — inscription Supabase
// ═════════════════════════════════════════════════════════════════════
function Signup({ go, plan, onLogged }) {
  const [f, setF] = useState({ name:"", email:"", phone:"", resto:"", pass:"", pass2:"" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!f.name || !f.email || !f.resto || !f.pass) { setErr("Remplissez tous les champs obligatoires."); return; }
    if (f.pass !== f.pass2) { setErr("Les mots de passe ne correspondent pas."); return; }
    if (f.pass.length < 6) { setErr("Mot de passe trop court (6 caractères minimum)."); return; }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email);
    if (!emailOk) { setErr("Adresse email invalide."); return; }
    setErr(""); setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.pass,
      options: { data: { nom: f.name, resto: f.resto, telephone: f.phone } },
    });
    setLoading(false);
    if (error) { setErr(error.message || "Erreur lors de l'inscription."); return; }
    if (data?.user) {
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
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:900, color:R, marginTop:2 }}>{plan?.name || "Pro"}</div>
          </div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900 }}>{plan?.price || 59}€<span style={{ fontSize:12, color:"#6B7280", fontWeight:600 }}>/mois</span></div>
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
          <p style={{ textAlign:"center", fontSize:12, color:"#555B6E", lineHeight:1.5 }}>En créant un compte, vous acceptez nos CGV et notre politique de confidentialité.</p>
          <p style={{ textAlign:"center", fontSize:12 }}>
            <span onClick={() => go("login")} style={{ color:R, fontWeight:700, cursor:"pointer" }}>Déjà un compte ? Se connecter</span>
          </p>
        </form>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// ADMIN
// ═════════════════════════════════════════════════════════════════════
function Admin({ user, go, onLogout }) {
  const [tab, setTab] = useState("infos");
  const [cfg, setCfg] = useState({
    name: user?.resto || "", phone: user?.phone || "", address: "",
    hours1: "12:00 – 14:30", hours2: "19:00 – 23:30", color: R, active: true, onlyHours: false,
    sms: "Bonjour ! {nom} n'a pas pu répondre à votre appel. Commandez ou réservez en ligne 👉 {lien}",
    welcome: "Bonjour ! 👋 Bienvenue chez {nom}. Que puis-je faire pour vous ?",
    link: `https://adbarth.fr/${(user?.resto || "monrestaurant").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`,
  });
  const [menu, setMenu] = useState([]);
  const [cats, setCats] = useState(["Entrées", "Plats", "Desserts", "Boissons"]);
  const [form, setForm] = useState({ cat:"", name:"", price:"", emoji:"🍔", desc:"" });
  const [editId, setEditId] = useState(null);
  const [newCat, setNewCat] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const [showEm, setShowEm] = useState(false);
  const accent = cfg.color;
  function save() { setSaved(true); setToast("✓ Modifications sauvegardées"); setTimeout(() => { setSaved(false); setToast(""); }, 2600); }
  function addItem() {
    if (!form.name || !form.price || !form.cat) return;
    if (editId !== null) { setMenu(m => m.map(i => i.id === editId ? { ...form, id:editId, on:true } : i)); setEditId(null); }
    else { setMenu(m => [...m, { ...form, id: uid(), on:true }]); }
    setForm({ cat:form.cat, name:"", price:"", emoji:"🍔", desc:"" });
  }
  function startEdit(item) {
    setForm({ cat:item.cat, name:item.name, price:item.price, emoji:item.emoji, desc:item.desc });
    setEditId(item.id); setTab("menu");
    setTimeout(() => document.getElementById("mform")?.scrollIntoView({ behavior:"smooth" }), 120);
  }
  const grouped = cats.reduce((acc, cat) => { const items = menu.filter(i => i.cat === cat); if (items.length) acc[cat] = items; return acc; }, {});
  const TABS = [
    { k:"infos", i:"🏪", l:"Restaurant" },
    { k:"sms", i:"💬", l:"SMS" },
    { k:"chatbot", i:"🤖", l:"Chatbot" },
    { k:"menu", i:"🍽️", l:"Menu" },
    { k:"stats", i:"📊", l:"Stats" },
  ];
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:520, margin:"0 auto" }}>
      {toast && (
        <div className="fu" style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:V, color:"#fff", padding:"10px 24px", borderRadius:22, fontSize:13, fontWeight:700, zIndex:300, boxShadow:`0 4px 26px ${V}55`, whiteSpace:"nowrap" }}>{toast}</div>
      )}
      <div style={{ background:"#111420", borderBottom:"1px solid #181824", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:20 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Logo size={16} />
            <span style={{ fontSize:10, fontWeight:700, color:"#6B7280", background:"#181824", border:"1px solid #252836", borderRadius:20, padding:"2px 10px", letterSpacing:.5 }}>ADMIN</span>
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
      <div style={{ display:"flex", background:"#09090F", borderBottom:"1px solid #181824", overflowX:"auto" }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ flex:1, minWidth:60, padding:"10px 4px", background:"none", border:"none", borderBottom: tab === t.k ? `2px solid ${accent}` : "2px solid transparent", color: tab === t.k ? accent : "#6B7280", fontSize:10, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, transition:"color .15s" }}>
            <span style={{ fontSize:16 }}>{t.i}</span>{t.l}
          </button>
        ))}
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
            <Field l="Horaires service du midi"><input value={cfg.hours1} onChange={e => setCfg(c => ({ ...c, hours1:e.target.value }))} placeholder="12:00 – 14:30" style={I} /></Field>
            <Field l="Horaires service du soir"><input value={cfg.hours2} onChange={e => setCfg(c => ({ ...c, hours2:e.target.value }))} placeholder="19:00 – 23:30" style={I} /></Field>
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
          <SaveBtn saved={saved} onClick={save} accent={accent} />
        </>}
        {tab === "sms" && <>
          <STitle>Configuration SMS automatique</STitle>
          <Card>
            <div style={{ fontSize:11, fontWeight:700, color:V, letterSpacing:1, marginBottom:8 }}>VARIABLES DISPONIBLES</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
              {["{nom}", "{lien}", "{horaires}"].map(v => (
                <span key={v} style={{ background:"#181824", border:"1px solid #252836", borderRadius:8, padding:"4px 10px", fontSize:12, color:accent, fontWeight:700, fontFamily:"monospace" }}>{v}</span>
              ))}
            </div>
            <p style={{ fontSize:12, color:"#555B6E" }}>{"{nom}"} = nom de votre restaurant · {"{lien}"} = lien chatbot</p>
          </Card>
          <Card>
            <Field l="Message SMS envoyé au client">
              <textarea value={cfg.sms} onChange={e => setCfg(c => ({ ...c, sms:e.target.value }))} rows={4} style={{ ...I, resize:"none", lineHeight:1.7 }} />
            </Field>
            <p style={{ fontSize:12, color:"#555B6E" }}>{cfg.sms.replace("{nom}", cfg.name || "Votre resto").replace("{lien}", cfg.link).length} caractères</p>
          </Card>
          <Card>
            <div style={{ fontSize:11, fontWeight:700, color:"#6B7280", letterSpacing:1, marginBottom:12 }}>APERÇU SMS REÇU PAR LE CLIENT</div>
            <div style={{ background:"#0E0F17", borderRadius:"16px 16px 16px 4px", padding:"14px 16px", fontSize:14, lineHeight:1.8, border:"1px solid #181824", wordBreak:"break-word", color:"#E8EAF0" }}>
              {cfg.sms
                .replace("{nom}", cfg.name || "Votre resto")
                .replace("{horaires}", `${cfg.hours1} / ${cfg.hours2}`)
                .split("{lien}")
                .map((part, i, arr) => i < arr.length - 1
                  ? <span key={i}>{part}<span style={{ color:accent, textDecoration:"underline", fontWeight:700 }}>{cfg.link}</span></span>
                  : <span key={i}>{part}</span>
                )}
            </div>
          </Card>
          <Card>
            <Toggle label="Envoyer uniquement pendant les heures d'ouverture" sub={`${cfg.hours1} et ${cfg.hours2}`} value={cfg.onlyHours} onChange={v => setCfg(c => ({ ...c, onlyHours:v }))} accent={accent} />
          </Card>
          <SaveBtn saved={saved} onClick={save} accent={accent} />
        </>}
        {tab === "chatbot" && <>
          <STitle>Configuration du chatbot client</STitle>
          <Card>
            <Field l="Message d'accueil">
              <textarea value={cfg.welcome} onChange={e => setCfg(c => ({ ...c, welcome:e.target.value }))} rows={3} style={{ ...I, resize:"none", lineHeight:1.7 }} />
            </Field>
            <p style={{ fontSize:12, color:"#555B6E" }}>{"{nom}"} sera remplacé par : <strong style={{ color:"#E8EAF0" }}>{cfg.name || "votre nom"}</strong></p>
          </Card>
          <Card>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>Fonctionnalités activées</div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <Toggle label="🍔 Prise de commande à emporter" value={true} accent={V} />
              <Toggle label="📅 Réservation de table" value={true} accent={V} />
              <Toggle label="❓ Réponses automatiques aux questions" value={true} accent={V} />
            </div>
          </Card>
          <Card>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>FAQ automatique</div>
            <p style={{ fontSize:12, color:"#6B7280", marginBottom:12, lineHeight:1.5 }}>Ces réponses se mettent à jour automatiquement selon vos infos.</p>
            {[
              { q:"Quels sont vos horaires ?", r:`Midi : ${cfg.hours1} / Soir : ${cfg.hours2}` },
              { q:"Faites-vous de la livraison ?", r:"Nous proposons uniquement la commande à emporter via ce chatbot." },
              { q:"Y a-t-il des allergènes ?", r:"Nos plats peuvent contenir des allergènes. Précisez votre allergie lors de la commande." },
            ].map((faq, i) => (
              <div key={i} style={{ background:"#0E0F17", border:"1px solid #252836", borderRadius:12, padding:"11px 14px", marginBottom:8 }}>
                <div style={{ fontSize:12, fontWeight:700, color:accent, marginBottom:4 }}>Q : {faq.q}</div>
                <div style={{ fontSize:13, color:"#C8CAD4" }}>R : {faq.r}</div>
              </div>
            ))}
          </Card>
          <SaveBtn saved={saved} onClick={save} accent={accent} />
        </>}
        {tab === "menu" && <>
          <STitle>Gestion du menu</STitle>
          <Card>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Catégories</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
              {cats.map(cat => (
                <span key={cat} style={{ background:"#181824", border:`1px solid ${accent}45`, borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:700, color:accent, display:"flex", alignItems:"center", gap:6 }}>
                  {cat} <span onClick={() => setCats(cs => cs.filter(x => x !== cat))} style={{ cursor:"pointer", color:"#6B7280", fontWeight:900, fontSize:15, lineHeight:1 }}>×</span>
                </span>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nouvelle catégorie…"
                onKeyDown={e => { if (e.key === "Enter" && newCat.trim()) { setCats(c => [...c, newCat.trim()]); setNewCat(""); } }}
                style={{ ...I, flex:1 }} />
              <button onClick={() => { if (newCat.trim()) { setCats(c => [...c, newCat.trim()]); setNewCat(""); } }} style={{ padding:"10px 18px", borderRadius:10, background:accent, color:"#fff", border:"none", fontWeight:700, fontSize:16, cursor:"pointer" }}>+</button>
            </div>
          </Card>
          <Card id="mform">
            <div style={{ fontSize:13, fontWeight:700, color:accent, marginBottom:10 }}>{editId !== null ? "✏️ Modifier l'article" : "➕ Ajouter un article"}</div>
            <Field l="Emoji">
              <div>
                <button type="button" onClick={() => setShowEm(v => !v)} style={{ background:"#0E0F17", border:"1.5px solid #252836", borderRadius:10, padding:"9px 14px", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", gap:8, color:"#E8EAF0" }}>
                  {form.emoji} <span style={{ fontSize:12, color:"#6B7280" }}>Changer ▾</span>
                </button>
                {showEm && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:10, background:"#0E0F17", border:"1px solid #252836", borderRadius:12, padding:12, maxHeight:150, overflowY:"auto" }}>
                    {EMOJIS.map(em => (
                      <button key={em} type="button" onClick={() => { setForm(f => ({ ...f, emoji:em })); setShowEm(false); }} style={{ fontSize:22, background:"none", border:"none", cursor:"pointer", padding:5, borderRadius:8 }}>{em}</button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field l="Catégorie">
              <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat:e.target.value }))} style={I}>
                <option value="">Choisir une catégorie…</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field l="Nom du plat"><input value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder="ex: Magret de canard" style={I} /></Field>
            <Field l="Prix (€)"><input value={form.price} onChange={e => setForm(f => ({ ...f, price:e.target.value }))} placeholder="ex: 18.50" type="number" step="0.01" min="0" style={I} /></Field>
            <Field l="Description (optionnel)"><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc:e.target.value }))} placeholder="ex: Pommes sarladaises, jus de truffe" style={I} /></Field>
            <div style={{ display:"flex", gap:10 }}>
              <button type="button" onClick={addItem} style={{ flex:1, padding:"12px", borderRadius:12, background:accent, color:"#fff", border:"none", fontWeight:700, fontSize:14, cursor:"pointer", boxShadow:`0 4px 18px ${accent}40` }}>
                {editId !== null ? "✓ Mettre à jour" : "➕ Ajouter au menu"}
              </button>
              {editId !== null && (
                <button type="button" onClick={() => { setEditId(null); setForm({ cat:"", name:"", price:"", emoji:"🍔", desc:"" }); }} style={{ padding:"12px 14px", borderRadius:12, background:"#181824", color:"#9CA3AF", border:"1px solid #252836", fontWeight:700, fontSize:13, cursor:"pointer" }}>Annuler</button>
              )}
            </div>
          </Card>
          {menu.length === 0 && (
            <div style={{ textAlign:"center", color:"#555B6E", padding:"32px 0" }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🍽️</div>
              <div style={{ fontSize:14 }}>Votre menu est vide.<br />Ajoutez votre premier plat ci-dessus.</div>
            </div>
          )}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:1.5, marginBottom:10, paddingLeft:4 }}>
                {cat} · {items.length} article{items.length > 1 ? "s" : ""}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {items.map(item => (
                  <div key={item.id} className="fu" style={{ background: item.on ? "#111420" : "#0C0D14", border:`1px solid ${item.on ? "#252836" : "#181824"}`, borderRadius:14, padding:14, display:"flex", alignItems:"center", gap:12, opacity: item.on ? 1 : .45, transition:"all .2s" }}>
                    <span style={{ fontSize:26, flexShrink:0 }}>{item.emoji}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#E8EAF0" }}>{item.name}</div>
                      {item.desc && <div style={{ fontSize:11, color:"#6B7280", marginTop:2, lineHeight:1.4 }}>{item.desc}</div>}
                      <div style={{ fontSize:13, fontWeight:800, color:OR, marginTop:5 }}>{item.price}€</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                      <button type="button" onClick={() => setMenu(m => m.map(i => i.id === item.id ? { ...i, on:!i.on } : i))} style={{ padding:"5px 10px", borderRadius:8, fontSize:10, fontWeight:700, background: item.on ? `${V}20` : "#6B728020", border:`1px solid ${item.on ? V+"45" : "#6B728045"}`, color: item.on ? V : "#9CA3AF", cursor:"pointer" }}>
                        {item.on ? "Actif" : "Caché"}
                      </button>
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
            {[
              { l:"SMS envoyés", v:"0", i:"💬" },
              { l:"Clics chatbot", v:"0", i:"👆" },
              { l:"Commandes", v:"0", i:"🍔" },
              { l:"Réservations", v:"0", i:"📅" },
              { l:"CA récupéré", v:"0€", i:"💰" },
              { l:"Taux conversion", v:"—", i:"📈" },
            ].map(s => (
              <div key={s.l} style={{ background:"#111420", border:"1px solid #181824", borderRadius:16, padding:"18px 16px" }}>
                <div style={{ fontSize:22, marginBottom:8 }}>{s.i}</div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:900, color:accent, lineHeight:1 }}>{s.v}</div>
                <div style={{ fontSize:11, color:"#6B7280", marginTop:7, fontWeight:600 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ background:"#111420", border:"1px solid #181824", borderRadius:16, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Les stats se rempliront ici</div>
            <p style={{ fontSize:13, color:"#6B7280", lineHeight:1.65 }}>Dès que vos premiers appels manqués seront détectés et que vos clients utiliseront le chatbot, vos statistiques apparaîtront ici en temps réel.</p>
          </div>
        </>}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SIMULATEUR
// ═════════════════════════════════════════════════════════════════════
function Simulator({ go, user }) {
  const [phase, setPhase] = useState("idle");
  function start() {
    setPhase("ringing");
    setTimeout(() => setPhase("missed"), 2600);
    setTimeout(() => setPhase("sms"), 4400);
  }
  const steps = [
    { l:"Appel entrant détecté", done:["ringing","missed","sms"].includes(phase) },
    { l:"Aucune réponse → appel manqué", done:["missed","sms"].includes(phase) },
    { l:"SMS automatique envoyé en 3s", done:phase === "sms" },
  ];
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" }}>
      <TopBar title="Simulateur" sub="Testez le flux client complet" onBack={() => go(user ? "admin" : "landing")} />
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:22 }}>
        <div style={{ width:174, height:296, background:"#111420", borderRadius:36, border:`2px solid ${phase === "ringing" ? R : "#252836"}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, position:"relative", overflow:"hidden", transition:"border-color .3s", animation: phase === "ringing" ? "glow 1s ease-in-out infinite" : "none" }}>
          {phase === "ringing" && <div style={{ position:"absolute", inset:0, background:`radial-gradient(circle,${R}18 0%,transparent 70%)`, animation:"pulse .7s ease-in-out infinite" }} />}
          <div style={{ fontSize:54, animation: phase === "ringing" ? "ring .42s ease-in-out infinite" : "none" }}>
            {phase === "idle" ? "📵" : phase === "ringing" ? "📱" : phase === "missed" ? "📵" : "💬"}
          </div>
          <div style={{ fontSize:13, textAlign:"center", padding:"0 20px", lineHeight:1.7 }}>
            {phase === "idle" && <span style={{ color:"#6B7280" }}>Prêt à simuler</span>}
            {phase === "ringing" && <span style={{ color:R, animation:"pulse .7s infinite", fontWeight:700, whiteSpace:"pre-line" }}>{"Appel entrant…\n+33 6 00 11 22 33"}</span>}
            {phase === "missed" && <span style={{ color:"#EF4444", fontWeight:700 }}>Appel manqué</span>}
            {phase === "sms" && <span style={{ color:V, fontWeight:700 }}>SMS envoyé ✓</span>}
          </div>
        </div>
        <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:10 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, background: s.done ? `${V}0E` : "#111420", border:`1px solid ${s.done ? V+"45" : "#181824"}`, borderRadius:12, padding:"12px 16px", transition:"all .5s" }}>
              <span style={{ fontSize:18 }}>{s.done ? "✅" : "⬜"}</span>
              <span style={{ fontSize:14, fontWeight:600, color: s.done ? V : "#6B7280" }}>{s.l}</span>
            </div>
          ))}
        </div>
        {phase === "sms" && (
          <div className="fu" style={{ width:"100%", background:"#111420", border:`1px solid ${V}40`, borderRadius:16, padding:16 }}>
            <div style={{ fontSize:10, fontWeight:700, color:V, letterSpacing:1.2, marginBottom:10 }}>SMS REÇU PAR LE CLIENT</div>
            <div style={{ background:"#0E0F17", borderRadius:"16px 16px 16px 4px", padding:"13px 16px", fontSize:14, lineHeight:1.8, color:"#E8EAF0", border:"1px solid #181824", wordBreak:"break-word" }}>
              Bonjour ! Nous n'avons pas pu répondre à votre appel. Cliquez ici pour prendre RDV ou passer une commande 👉{" "}
              <span onClick={() => go("chatbot")} style={{ color:R, textDecoration:"underline", cursor:"pointer", fontWeight:700 }}>Ouvrir le chatbot →</span>
            </div>
          </div>
        )}
        {phase === "idle" && <PrimaryBtn lg full onClick={start}>📞 Simuler un appel manqué</PrimaryBtn>}
        {phase === "sms" && (
          <>
            <PrimaryBtn lg full onClick={() => go("chatbot")}>💬 Voir ce que reçoit le client →</PrimaryBtn>
            <GhostBtn full onClick={() => setPhase("idle")}>Recommencer</GhostBtn>
          </>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// CHATBOT CLIENT
// ═════════════════════════════════════════════════════════════════════
function Chatbot({ go, user }) {
  const restoName = user?.resto || "notre restaurant";
  const [flow, setFlow] = useState("welcome");
  const [cat, setCat] = useState(null);
  const [cart, setCart] = useState([]);
  const [resv, setResv] = useState({});
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [menuCats] = useState([
    { id:"entrees", label:"🥗 Entrées", items:[] },
    { id:"plats", label:"🍽️ Plats", items:[] },
    { id:"desserts", label:"🍮 Desserts", items:[] },
    { id:"boissons", label:"🥤 Boissons", items:[] },
  ]);
  const ref = useRef(null);
  function bot(t, d = 420) { setTimeout(() => setMsgs(p => [...p, { r:"bot", t }]), d); }
  function usr(t) { setMsgs(p => [...p, { r:"usr", t }]); }
  useEffect(() => {
    bot(`Bonjour ! 👋 Bienvenue chez ${restoName}.\n\nJe peux :\n🍔 Prendre votre commande à emporter\n📅 Réserver une table\n❓ Répondre à vos questions\n\nQue souhaitez-vous ?`, 350);
  }, []);
  useEffect(() => ref.current?.scrollIntoView({ behavior:"smooth" }), [msgs]);
  const QR = {
    welcome: ["🍔 Commander à emporter", "📅 Réserver une table", "❓ Infos & horaires"],
    intent: ["🍔 Commander à emporter", "📅 Réserver une table", "❓ Infos & horaires"],
    order_more: ["✅ Confirmer ma commande", "➕ Ajouter autre chose"],
    resv_confirm: ["✅ Confirmer", "✏️ Modifier"],
    faq: ["Horaires ?", "Livraison ?", "Allergènes ?", "↩ Retour"],
  };
  function q(t) { usr(t); proc(t); }
  function send() { const t = input.trim(); if (!t) return; setInput(""); usr(t); proc(t); }
  function proc(txt) {
    const t = txt.toLowerCase();
    if (flow === "welcome" || flow === "intent") {
      if (t.includes("command") || t.includes("emport") || t.includes("🍔")) { setFlow("order_cat"); bot("Quelle catégorie vous fait envie ?", 500); }
      else if (t.includes("réserv") || t.includes("table") || t.includes("📅")) { setFlow("resv_persons"); bot("Pour combien de personnes souhaitez-vous réserver ?", 500); }
      else if (t.includes("info") || t.includes("horaire") || t.includes("❓")) { setFlow("faq"); bot("Sur quoi puis-je vous renseigner ?", 500); }
      else { bot(`Je peux vous aider à :\n🍔 Commander à emporter\n📅 Réserver une table\n❓ Infos & horaires`, 400); }
      return;
    }
    if (flow === "order_cat") { bot("Nos plats arrivent bientôt ! En attendant, appelez-nous directement pour commander. 🙏", 500); setFlow("intent"); return; }
    if (flow === "order_more") {
      if (t.includes("confirm") || t.includes("✅") || t.includes("ok")) { confirmOrder(); }
      else if (t.includes("ajouter") || t.includes("➕")) { setFlow("order_cat"); bot("Quelle catégorie ?", 400); }
      else { bot("Tapez \"confirmer\" pour valider votre commande.", 400); }
      return;
    }
    if (flow === "resv_persons") {
      const n = txt.match(/\d+/);
      if (n) { setResv(r => ({ ...r, persons:n[0] })); setFlow("resv_date"); bot(`Parfait, table pour ${n[0]} 👍\nPour quelle date ? (ex: ce soir, demain, samedi…)`, 500); }
      else { bot("Combien de personnes serez-vous ? (ex: 2, 4…)", 400); }
      return;
    }
    if (flow === "resv_date") { setResv(r => ({ ...r, date:txt })); setFlow("resv_time"); bot("À quelle heure souhaitez-vous venir ?", 500); return; }
    if (flow === "resv_time") { setResv(r => ({ ...r, time:txt })); setFlow("resv_note"); bot("Une note particulière ? (allergie, occasion spéciale…) Ou tapez \"non\".", 500); return; }
    if (flow === "resv_note") {
      const note = (t === "non" || t === "rien") ? "" : txt;
      const r2 = { ...resv, note }; setResv(r2); setFlow("resv_confirm");
      setTimeout(() => bot(`Récapitulatif de votre réservation :\n\n📅 ${r2.date} à ${r2.time}\n👥 ${r2.persons} personne${r2.persons > 1 ? "s" : ""}${r2.note ? "\n📝 " + r2.note : ""}\n\nTout est correct ?`, 500), 0);
      return;
    }
    if (flow === "resv_confirm") {
      if (t.includes("confirm") || t.includes("oui") || t.includes("✅") || t.includes("ok")) { confirmResv(); }
      else if (t.includes("modif") || t.includes("non") || t.includes("✏")) { setResv({}); setFlow("resv_persons"); bot("Pas de problème ! Pour combien de personnes ?", 400); }
      return;
    }
    if (flow === "faq") {
      if (t.includes("horaire") || t.includes("ouvert")) { bot("🕐 Nos horaires :\n• Midi : 12h00 – 14h30\n• Soir : 19h00 – 23h30\n• Ouvert 7 jours sur 7", 400); }
      else if (t.includes("livr")) { bot("🛵 Nous ne faisons pas de livraison pour le moment. Vous pouvez commander à emporter via ce chatbot !", 400); }
      else if (t.includes("allerg")) { bot("⚠️ Nos plats peuvent contenir des allergènes (gluten, lactose, fruits à coque…). Précisez votre allergie lors de la commande.", 400); }
      else if (t.includes("retour") || t.includes("↩")) { setFlow("intent"); bot("D'accord ! Commander ou réserver ?", 400); }
      else { bot("Pour toute autre question, appelez-nous directement. Nous sommes là pour vous aider ! 😊", 400); }
      return;
    }
    bot("Je n'ai pas bien compris. Pouvez-vous reformuler ?", 400);
  }
  function confirmOrder() {
    const total = cart.reduce((s, c) => s + c.item.price * c.qty, 0);
    const items = cart.map(c => `${c.qty}× ${c.item.name}`);
    db.add({ id:"CMD-"+uid(), client:"+33 6 00 11 22 33", type:"commande", items, total:`${total.toFixed(2)}€`, time:now(), status:"en_cours", note:"" });
    setDone(true); setFlow("done");
    bot(`🎉 Commande confirmée !\n\n${items.join("\n")}\n\n💰 Total : ${total.toFixed(2)}€\n\nVotre commande est transmise ! Merci 🙏`, 500);
    setCart([]);
  }
  function confirmResv() {
    db.add({ id:"RES-"+uid(), client:"+33 6 00 11 22 33", type:"reservation", items:[`Table pour ${resv.persons} personne${resv.persons > 1 ? "s" : ""}`, `${resv.date} à ${resv.time}`], total:"—", time:now(), status:"en_cours", note:resv.note || "" });
    setDone(true); setFlow("done");
    bot(`🎉 Réservation confirmée !\n\n📅 ${resv.date} à ${resv.time}\n👥 ${resv.persons} personne${resv.persons > 1 ? "s" : ""}${resv.note ? "\n📝 " + resv.note : ""}\n\nÀ très bientôt ! 🙏`, 500);
  }
  const showCats = flow === "order_cat";
  const curQR = QR[flow] || [];
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" }}>
      <TopBar title={`🍽️ ${restoName}`} sub="Commandes & Réservations" onBack={() => go(user ? "admin" : "landing")} dot={V} />
      <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 8px", display:"flex", flexDirection:"column", gap:12 }}>
        {msgs.map((m, i) => (
          <div key={i} className="fu" style={{ display:"flex", justifyContent: m.r === "usr" ? "flex-end" : "flex-start", gap:8, animationDelay:`${i * 0.02}s` }}>
            {m.r === "bot" && <div style={{ width:32, height:32, background:`${R}25`, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0, alignSelf:"flex-end" }}>🤖</div>}
            <div style={{ maxWidth:"80%", background: m.r === "usr" ? R : "#111420", border: m.r === "bot" ? "1px solid #181824" : "none", borderRadius: m.r === "usr" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding:"12px 14px", fontSize:14, lineHeight:1.8, color:"#E8EAF0", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
              {m.t}
            </div>
          </div>
        ))}
        {showCats && (
          <div className="fu" style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {menuCats.map(c => (
              <button key={c.id} type="button" onClick={() => { usr(c.label); setCat(c); setFlow("order_items"); bot(`${c.label} — nos plats arrivent bientôt ! En attendant vous pouvez nous appeler directement.`, 300); }}
                style={{ padding:"12px 16px", borderRadius:12, background:"#111420", border:`1.5px solid ${R}40`, color:"#E8EAF0", fontSize:14, fontWeight:600, cursor:"pointer", textAlign:"left", transition:"all .15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = R; e.currentTarget.style.background = `${R}12`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = `${R}40`; e.currentTarget.style.background = "#111420"; }}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {cart.length > 0 && (
          <div className="fu" style={{ background:"#111420", border:`1px solid ${R}45`, borderRadius:14, padding:"12px 16px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:R, letterSpacing:1, marginBottom:10 }}>🛒 VOTRE PANIER</div>
            {cart.map(c => (
              <div key={c.item.name} style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#C8CAD0", marginBottom:5 }}>
                <span>{c.qty}× {c.item.emoji} {c.item.name}</span>
                <span style={{ color:"#E8EAF0", fontWeight:700 }}>{(c.item.price * c.qty).toFixed(2)}€</span>
              </div>
            ))}
            <div style={{ borderTop:"1px solid #252836", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:800, fontSize:15 }}>
              <span>Total</span>
              <span style={{ color:OR }}>{cart.reduce((s, c) => s + c.item.price * c.qty, 0).toFixed(2)}€</span>
            </div>
          </div>
        )}
        {done && (
          <div className="fu" style={{ background:`${V}10`, border:`1px solid ${V}45`, borderRadius:14, padding:16, textAlign:"center" }}>
            <div style={{ fontSize:14, fontWeight:700, color:V, marginBottom:12 }}>🎉 Transmis au restaurant !</div>
            <button type="button" onClick={() => go("dashboard")} style={{ padding:"10px 24px", borderRadius:22, background:V, color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Voir dans le dashboard →</button>
          </div>
        )}
        <div ref={ref} />
      </div>
      {curQR.length > 0 && !done && !showCats && (
        <div style={{ padding:"8px 14px", display:"flex", gap:8, overflowX:"auto", borderTop:"1px solid #181824", background:"#09090F" }}>
          {curQR.map(r => (
            <button key={r} type="button" onClick={() => q(r)} style={{ flexShrink:0, padding:"8px 14px", borderRadius:22, background:"#111420", border:`1px solid ${R}50`, color:R, fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit" }}>{r}</button>
          ))}
        </div>
      )}
      <div style={{ padding:"10px 14px 24px", background:"#09090F", borderTop:"1px solid #181824", display:"flex", gap:10, alignItems:"center" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Écrivez votre message…" style={{ flex:1, background:"#111420", border:"1.5px solid #252836", borderRadius:14, color:"#E8EAF0", fontSize:14, padding:"12px 14px", fontFamily:"inherit" }} />
        <button type="button" onClick={send} disabled={!input.trim()} style={{ width:46, height:46, borderRadius:13, flexShrink:0, background: input.trim() ? R : "#252836", border:"none", cursor: input.trim() ? "pointer" : "not-allowed", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#fff", transition:"background .2s" }}>➤</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// DASHBOARD CUISINE
// ═════════════════════════════════════════════════════════════════════
function Dashboard({ go, orders }) {
  const [filter, setFilter] = useState("en_cours");
  const list = orders.filter(o => filter === "all" ? true : o.status === filter);
  const nb = orders.filter(o => o.status === "en_cours").length;
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:520, margin:"0 auto" }}>
      <TopBar title="Commandes en cours" onBack={() => go("admin")} badge={nb} />
      <div style={{ display:"flex", background:"#09090F", borderBottom:"1px solid #181824", padding:"0 12px" }}>
        {[{ k:"en_cours", l:"⏳ En cours" }, { k:"pret", l:"✅ Prêt" }, { k:"all", l:"📋 Tout" }].map(t => (
          <button key={t.k} type="button" onClick={() => setFilter(t.k)} style={{ flex:1, padding:"12px 4px", background:"none", border:"none", borderBottom: filter === t.k ? `2px solid ${R}` : "2px solid transparent", color: filter === t.k ? R : "#6B7280", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{t.l}</button>
        ))}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:14 }}>
        {list.length === 0 && (
          <div style={{ textAlign:"center", color:"#555B6E", marginTop:60 }}>
            <div style={{ fontSize:44, marginBottom:14 }}>🍽️</div>
            <div style={{ fontSize:15 }}>Aucune commande ici pour le moment.</div>
            <div style={{ fontSize:13, color:"#555B6E", marginTop:8 }}>Les commandes du chatbot apparaîtront ici en temps réel.</div>
          </div>
        )}
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
    <div className="fu" style={{ background:"#111420", border:`1.5px solid ${isPret ? V+"55" : isCmd ? R+"45" : "#3B82F645"}`, borderRadius:18, overflow:"hidden", animationDelay:`${i * .05}s` }}>
      <div style={{ background: isPret ? `${V}15` : isCmd ? `${R}10` : "#3B82F610", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>{isCmd ? "🍔" : "📅"}</span>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:"#E8EAF0" }}>{o.id}</div>
            <div style={{ fontSize:12, color:"#6B7280", marginTop:1 }}>{o.client} · {o.time}</div>
          </div>
        </div>
        <div style={{ fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:20, background: isPret ? `${V}25` : "#6B728022", border:`1px solid ${isPret ? V+"55" : "#6B728050"}`, color: isPret ? V : "#9CA3AF" }}>
          {isPret ? "✓ Prêt" : "En cours"}
        </div>
      </div>
      <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:6 }}>
        {o.items.map((it, j) => (
          <div key={j} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, color:"#C8CAD4" }}>
            <span style={{ color:R, fontSize:11 }}>▸</span>{it}
          </div>
        ))}
        {o.note && <div style={{ marginTop:6, fontSize:12, color:"#6B7280", background:"#181824", borderRadius:8, padding:"6px 10px" }}>📝 {o.note}</div>}
      </div>
      <div style={{ padding:"10px 16px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontWeight:800, fontSize:18, color:OR }}>{o.total}</div>
        <div style={{ display:"flex", gap:8 }}>
          {!isPret && status !== "termine" && (
            <button type="button" onClick={() => upd("pret")} style={{ padding:"9px 20px", borderRadius:10, background:V, color:"#fff", border:"none", fontWeight:800, fontSize:13, cursor:"pointer", boxShadow:`0 2px 14px ${V}45`, fontFamily:"inherit" }}>✓ Marquer prêt</button>
          )}
          {isPret && (
            <button type="button" onClick={() => upd("termine")} style={{ padding:"9px 20px", borderRadius:10, background:"#181824", color:"#9CA3AF", border:"1px solid #252836", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Terminer</button>
          )}
        </div>
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
  return (
    <button type={type} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: lg ? "15px 30px" : sm ? "8px 16px" : "11px 22px", borderRadius:12, background: hov ? "#FF8555" : R, color:"#fff", border:"none", fontFamily:"'DM Sans',sans-serif", fontSize: lg ? 15 : sm ? 12 : 14, fontWeight:800, cursor:"pointer", boxShadow: hov ? `0 6px 30px ${R}65` : `0 4px 18px ${R}45`, transition:"all .18s", width: full ? "100%" : "auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, ...st }}>
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, lg, sm, full, type = "button" }) {
  const [hov, setHov] = useState(false);
  return (
    <button type={type} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: lg ? "15px 28px" : sm ? "8px 16px" : "11px 22px", borderRadius:12, background: hov ? "rgba(255,255,255,.05)" : "transparent", color: hov ? "#fff" : "#E8EAF0", border:`1.5px solid ${hov ? "#888" : "#252836"}`, fontFamily:"'DM Sans',sans-serif", fontSize: lg ? 15 : sm ? 12 : 14, fontWeight:700, cursor:"pointer", transition:"all .18s", width: full ? "100%" : "auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 }}>
      {children}
    </button>
  );
}

function AdminBtn({ children, onClick, color = R }) {
  return (
    <button type="button" onClick={onClick} style={{ padding:"6px 11px", borderRadius:8, background:`${color}18`, border:`1px solid ${color}40`, color, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{children}</button>
  );
}

function StepNav({ title, onBack, step, of }) {
  return (
    <div style={{ background:"#111420", borderBottom:"1px solid #181824", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:20 }}>
      <button type="button" onClick={onBack} style={{ background:"#181824", border:"none", color:"#E8EAF0", width:36, height:36, borderRadius:10, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>←</button>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:800, fontSize:15, color:"#E8EAF0" }}>{title}</div>
        <div style={{ fontSize:11, color:"#6B7280", marginTop:1 }}>Étape {step} sur {of}</div>
      </div>
      <div style={{ display:"flex", gap:5 }}>
        {Array.from({ length:of }, (_, i) => (
          <div key={i} style={{ height:7, borderRadius:4, background: i < step ? R : "#252836", width: i < step ? 22 : 7, transition:"all .3s" }} />
        ))}
      </div>
    </div>
  );
}

function TopBar({ title, sub, onBack, dot, badge }) {
  return (
    <div style={{ padding:"13px 16px", background:"#111420", borderBottom:"1px solid #181824", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
      <button type="button" onClick={onBack} style={{ background:"#181824", border:"none", color:"#E8EAF0", width:36, height:36, borderRadius:10, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>←</button>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:800, fontSize:15, display:"flex", alignItems:"center", gap:8, color:"#E8EAF0" }}>
          {title}
          {badge > 0 && <span style={{ background:R, color:"#fff", borderRadius:20, padding:"1px 9px", fontSize:11, fontWeight:800 }}>{badge}</span>}
        </div>
        {sub && (
          <div style={{ fontSize:12, color:"#6B7280", marginTop:1, display:"flex", alignItems:"center", gap:5 }}>
            {dot && <span style={{ width:7, height:7, borderRadius:"50%", background:dot, display:"inline-block", boxShadow:`0 0 7px ${dot}` }} />}
            {sub}
          </div>
        )}
      </div>
      <Logo size={15} />
    </div>
  );
}

function Section({ children, dark }) {
  return (
    <section style={{ padding:"72px 5vw", background: dark ? "#0D0E16" : "#09090F", borderTop:"1px solid #181824", borderBottom:"1px solid #181824" }}>
      {children}
    </section>
  );
}

function SectionHead({ pill, title }) {
  return (
    <div style={{ textAlign:"center", marginBottom:48 }}>
      <div style={{ fontSize:11, fontWeight:700, color:R, letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:12 }}>{pill}</div>
      <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(22px,3.5vw,40px)", fontWeight:900, letterSpacing:"-1px", color:"#fff", whiteSpace:"pre-line" }}>{title}</h2>
    </div>
  );
}

function HoverCard({ children, subtle }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ background: subtle ? "#111420" : "#0E0F17", border:`1px solid ${hov ? R+"50" : "#181824"}`, borderRadius:18, padding:22, transition:"all .25s", transform: hov ? "translateY(-4px)" : "none", cursor:"default" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {children}
    </div>
  );
}

function Card({ children, id }) {
  return <div id={id} style={{ background:"#111420", border:"1px solid #181824", borderRadius:16, padding:18, display:"flex", flexDirection:"column", gap:14 }}>{children}</div>;
}

function Field({ l, children }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:".9px" }}>{l}</label>
      {children}
    </div>
  );
}

function STitle({ children }) {
  return <div style={{ fontSize:18, fontWeight:800, color:"#E8EAF0", letterSpacing:"-0.3px" }}>{children}</div>;
}

function Toggle({ label, sub, value, onChange, accent = V }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
      <div>
        <div style={{ fontSize:14, fontWeight:600, color:"#E8EAF0" }}>{label}</div>
        {sub && <div style={{ fontSize:12, color:"#6B7280", marginTop:2 }}>{sub}</div>}
      </div>
      <div onClick={() => onChange && onChange(!value)} style={{ width:44, height:24, borderRadius:12, background: value ? accent : "#252836", position:"relative", transition:"background .2s", cursor:"pointer", flexShrink:0 }}>
        <div style={{ position:"absolute", top:3, left: value ? 22 : 3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
      </div>
    </div>
  );
}

function ToggleSwitch({ value, onChange, accent = V }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width:40, height:22, borderRadius:11, background: value ? accent : "#252836", position:"relative", transition:"background .2s", cursor:"pointer", flexShrink:0 }}>
      <div style={{ position:"absolute", top:2, left: value ? 19 : 2, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
    </div>
  );
}

function SaveBtn({ saved, onClick, accent = R }) {
  return (
    <button type="button" onClick={onClick} style={{ padding:"15px", borderRadius:14, background: saved ? V : accent, color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor:"pointer", transition:"background .3s", boxShadow:`0 4px 22px ${saved ? V+"50" : accent+"50"}`, fontFamily:"inherit" }}>
      {saved ? "✓ Sauvegardé !" : "Sauvegarder les modifications"}
    </button>
  );
}

function Spinner() {
  return <div style={{ width:18, height:18, border:"2px solid #fff4", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite" }} />;
}
