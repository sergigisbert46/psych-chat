import { useState, useRef, useEffect } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, query, where, orderBy, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const EXERCISE_BATTERY = [
  { id: "respiracion-4-7-8", titulo: "Respiración 4-7-8", pasos: "Inhala 4s → aguanta 7s → exhala 8s. Repite 3-4 veces." },
  { id: "registro-pensamiento", titulo: "Registro de pensamiento", pasos: "Anota el pensamiento → ¿qué evidencia hay? ¿en contra? → versión más equilibrada." },
  { id: "5-4-3-2-1", titulo: "Grounding 5-4-3-2-1", pasos: "5 cosas que ves → 4 que tocas → 3 que oyes → 2 que hueles → 1 que saboreas." },
  { id: "activacion-conductual", titulo: "Activación conductual", pasos: "Elige UNA actividad pequeña. La motivación viene después de actuar, no antes." },
  { id: "autocompasion", titulo: "Pausa de autocompasión", pasos: "Mano en el pecho. '¿Qué le dirías a un amigo en tu lugar?'" },
  { id: "agenda-preocupaciones", titulo: "Agenda de preocupaciones", pasos: "15 min fijos al día. Fuera de ese momento: anota y suelta." },
];
const RISK_PATTERNS = [
  /no (encuentro|veo|hay|tiene|tengo).{0,30}(manera|forma|sentido|motivo|razón|salida|ganas)/i,
  /no (quiero|puedo) (seguir|continuar|más)/i,
  /quiero (desaparecer|morirme|morir|hacerme daño|dejar de existir)/i,
  /me quiero (morir|matar|hacer daño)/i,
  /pensando en (suicidarme|quitarme la vida|morir)/i,
  /no (vale|merece|tiene) (la pena|sentido) (vivir|seguir)/i,
  /harto.{0,20}(vivir|existir|todo|la vida)/i,
  /sin (ganas|fuerzas) (de vivir|para seguir)/i,
  /(la vida|todo) (no tiene sentido|ya no tiene sentido)/i,
  /sin salida|sin esperanza/i,
  /ya no (quiero|puedo|aguanto|soporto)/i,
];
function detectRisk(text) {
  for (const p of RISK_PATTERNS) { const m = text.match(p); if (m) return m[0]; }
  return null;
}
function buildSystem(patient, pastSessions, riskPhrase) {
  if (!patient) return "Eres un asistente de apoyo emocional. Datos del paciente no disponibles aún.";

  const firstName = patient.name?.split(" ")[0] || "el paciente";
  const sessionsCtx = pastSessions.length > 0
    ? `SESIONES ANTERIORES (${pastSessions.length}):
${pastSessions.slice(0,5).map((s,i) => {
        const sum = s.summary;
        if (!sum) return `Sesión ${i+1} (${s.date}): sin resumen.`;
        return `Sesión ${i+1} (${s.date}): ${sum.estadoEmocional}. Temas: ${(sum.temasAbordados||[]).join(", ")}. Malestar: ${sum.nivelMalestar}/10. ${sum.observaciones}`;
      }).join("\n")}
Usa el historial si el paciente conecta hilos.`
    : `Es la primera sesión de ${firstName}. Salúdale con calidez.`;
  const base = `Eres el asistente de apoyo emocional de ${firstName}. Extensión de su psicólogo entre sesiones.
DATOS:
Nombre: ${patient.name}
${patient.diagnosis ? "Diagnóstico: "+patient.diagnosis : ""}
${patient.psychologist_notes ? "Notas: "+patient.psychologist_notes : ""}
${patient.current_medication ? "Medicación: "+patient.current_medication : ""}
${patient.treatment_plan ? "Plan: "+patient.treatment_plan : ""}

${sessionsCtx}

EJERCICIOS:
${EXERCISE_BATTERY.map(e => `[${e.id}] "${e.titulo}" → ${e.pasos}`).join("\n")}

ROL: El paciente YA está en tratamiento. PROHIBIDO sugerir buscar ayuda. Solo en crisis grave: 024.

━━━ FLUJO OBLIGATORIO ━━━
REGLA DE ORO: UN TURNO = UNA INTENCIÓN. Nunca hagas dos cosas en el mismo mensaje.
- Si validas → NO preguntes en el mismo mensaje. Solo valida.
- Si preguntas → haz UNA sola pregunta y PARA. Espera la respuesta del paciente.
- Si propones un ejercicio → no añadas preguntas ni validaciones extra.

SECUENCIA (cada paso es UN mensaje separado, esperando respuesta entre cada uno):
1. VALIDA la emoción. Que se sienta comprendido/a. Nada más. Para aquí.
2. ESPERA a que responda. Luego, si necesitas más contexto, haz UNA pregunta abierta. Para aquí.
3. ESPERA a que responda. Solo cuando ya se siente escuchado/a y el momento es natural: propón UN ejercicio.
   - Busca primero en la batería del psicólogo (los ejercicios de arriba).
   - Si ninguno encaja, propón algo basado en evidencia, paso a paso.

PROHIBIDO:
- Hacer más de UNA pregunta por mensaje.
- Validar Y preguntar en el mismo mensaje.
- Asumir lo que el paciente siente o piensa sin que lo haya dicho.
- Adelantarte a dar soluciones antes de que el paciente haya podido explicarse.
- Responder con párrafos largos. Sé breve: 1-2 frases por parte del mensaje.

RIESGO: Si detectas indicador → PARA. Explora con calma.

━━━ FORMATO ━━━
- Usa ||| para separar mensajes (máx 2 partes).
- Cada parte: 1-2 frases máximo. Sin listas. Sin párrafos. Tono humano y cercano.
- IMPORTANTE: las partes ||| son visualmente mensajes separados, pero el paciente NO puede responder entre ellas. Por tanto:
  · Si la primera parte valida, la segunda puede SOLO añadir un matiz empático. NO una pregunta.
  · Si quieres preguntar, la pregunta debe ser lo ÚNICO del mensaje (o la segunda parte de una validación breve).
  · NUNCA: validar en parte 1 + pregunta en parte 2 + consejo en parte 3. Eso es demasiado.
✔ "Eso suena muy agotador..." (solo validar, esperar respuesta)
✔ "Tiene mucho sentido que te sientas así. ||| ¿Cuánto tiempo llevas con esto?"
✗ "Entiendo que estás pasando por algo difícil. ||| ¿Qué crees que lo provoca? ||| Hay un ejercicio que podría ayudarte..."`;
  if (!riskPhrase) return base;
  return base + `\n\nALERTA: "${riskPhrase}". Explora solo esto.`;
}
const SUMMARY_PROMPT = `Eres un psicólogo analizando una sesión. JSON exacto sin texto extra:
{"estadoEmocional":"...","temasAbordados":["..."],"nivelMalestar":5,"recursosUtilizados":["..."],"observaciones":"...","recomendaciones":["..."],"alertas":"ninguna o descripción"}`;

async function callClaude(messages, system) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

const INACTIVITY_MS = 30 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;

// ── Generador de resumen HTML para descarga ───────────────
function generateSummaryHTML(summary, patient) {
  const date = new Date().toLocaleDateString("es-ES", { day:"numeric", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" });
  const col = summary.nivelMalestar >= 8 ? "#E57373" : summary.nivelMalestar >= 5 ? "#FFB74D" : "#81C784";
  const name = patient?.name || "Paciente";
  const alertBlock = summary.alertas && summary.alertas !== "ninguna"
    ? `<div style="background:#FFF3F3;border:1.5px solid #E5737355;border-radius:10px;padding:16px 18px;margin-bottom:20px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#E57373;font-weight:700;margin-bottom:6px">⚠️ ALERTAS</div>
        <div style="font-size:13px;color:#C62828;line-height:1.7">${summary.alertas}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resumen Clínico — ${name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lora:wght@400;500&family=Lato:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Lora',Georgia,serif;background:#f7faf8;color:#2C3E35;padding:0;margin:0}
  .page{max-width:700px;margin:0 auto;padding:40px 36px;background:white}
  @media print{body{background:white;padding:0}.page{max-width:100%;padding:30px;box-shadow:none}.no-print{display:none!important}}
  h1{font-family:'Playfair Display',serif;font-size:22px;color:#2C3E35;margin-bottom:4px}
  .subtitle{font-family:'Lato',sans-serif;font-size:12px;color:#7C9E8F;margin-bottom:28px}
  .patient-bar{display:flex;gap:20px;flex-wrap:wrap;background:#EEF4F1;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-family:'Lato',sans-serif;font-size:12px;color:#5B7D70}
  .patient-bar strong{color:#2C3E35}
  .card{background:#FAFCFB;border:1px solid #E8F0EC;border-radius:10px;padding:16px 18px;margin-bottom:16px}
  .section-label{font-family:'Lato',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#7C9E8F;margin-bottom:8px;font-weight:700}
  .section-content{font-size:14px;line-height:1.75;color:#2C3E35}
  .malestar-bar{height:10px;border-radius:5px;background:#EEF4F1;overflow:hidden;margin-top:8px}
  .malestar-fill{height:100%;border-radius:5px}
  .malestar-num{font-family:'Playfair Display',serif;font-size:22px;font-weight:700}
  .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
  .tag{padding:5px 14px;border-radius:20px;font-size:12px;font-family:'Lato',sans-serif;font-weight:600;background:rgba(124,158,143,0.12);color:#5B7D70}
  .tag-outline{background:rgba(91,125,112,0.06);border:1px solid rgba(91,125,112,0.2)}
  .rec-item{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
  .rec-num{width:22px;height:22px;border-radius:50%;background:rgba(124,158,143,0.18);color:#5B7D70;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-family:'Lato',sans-serif}
  .rec-text{font-size:13px;line-height:1.65}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #E8F0EC;font-family:'Lato',sans-serif;font-size:10px;color:#A8C4B8;text-align:center}
  .print-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:20px;border:none;background:linear-gradient(135deg,#7C9E8F,#5B7D70);color:white;font-family:'Lato',sans-serif;font-weight:700;font-size:13px;cursor:pointer;margin-bottom:24px}
  .print-btn:hover{opacity:0.9}
</style>
</head>
<body>
<div class="page">
  <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <h1>🌿 Resumen Clínico de Sesión</h1>
  <div class="subtitle">${date}</div>
  <div class="patient-bar">
    <div><strong>Paciente:</strong> ${name}</div>
    ${patient?.diagnosis ? `<div><strong>Diagnóstico:</strong> ${patient.diagnosis}</div>` : ""}
    ${patient?.current_medication ? `<div><strong>Medicación:</strong> ${patient.current_medication}</div>` : ""}
    ${patient?.treatment_plan ? `<div><strong>Plan:</strong> ${patient.treatment_plan}</div>` : ""}
  </div>
  ${alertBlock}
  <div class="card"><div class="section-label">Estado Emocional</div><div class="section-content">${summary.estadoEmocional}</div></div>
  <div class="card"><div class="section-label">Nivel de Malestar</div><div style="display:flex;align-items:center;gap:14px;margin-top:4px"><div style="flex:1"><div class="malestar-bar"><div class="malestar-fill" style="width:${summary.nivelMalestar*10}%;background:${col}"></div></div></div><div class="malestar-num" style="color:${col}">${summary.nivelMalestar}/10</div></div></div>
  <div class="card"><div class="section-label">Temas Abordados</div><div class="tags">${(summary.temasAbordados||[]).map(t => `<span class="tag">${t}</span>`).join("")}</div></div>
  <div class="card"><div class="section-label">Observaciones Clínicas</div><div class="section-content" style="font-size:13px">${summary.observaciones}</div></div>
  <div class="card"><div class="section-label">Recomendaciones</div>${(summary.recomendaciones||[]).map((r,i) => `<div class="rec-item"><div class="rec-num">${i+1}</div><div class="rec-text">${r}</div></div>`).join("")}</div>
  <div class="card"><div class="section-label">Recursos Utilizados</div><div class="tags">${(summary.recursosUtilizados||[]).map(r => `<span class="tag tag-outline">${r}</span>`).join("")}</div></div>
  <div class="footer">Documento generado automáticamente · Espacio de Apoyo · Confidencial<br>${date}</div>
</div>
</body>
</html>`;
}

function downloadSummary(summary, patient) {
  const html = generateSummaryHTML(summary, patient);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0,10);
  const safeName = (patient?.name || "paciente").replace(/\s+/g,"-").toLowerCase();
  a.href = url;
  a.download = `resumen-clinico-${safeName}-${dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TypingDots() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, padding:"11px 15px", background:"rgba(255,255,255,0.78)", borderRadius:16, borderBottomLeftRadius:3, width:"fit-content", boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
      {[0,1,2].map(i => <span key={i} style={{ width:7, height:7, borderRadius:"50%", background:"#7C9E8F", display:"inline-block", animation:"bounce 1.2s infinite", animationDelay:`${i*0.2}s` }} />)}
    </div>
  );
}
function Msg({ m, isNew }) {
  const user = m.role === "user";
  return (
    <div style={{ display:"flex", justifyContent:user?"flex-end":"flex-start", marginBottom:8, animation:isNew?"fadeUp 0.25s ease-out":"none" }}>
      {!user && <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", display:"flex", alignItems:"center", justifyContent:"center", marginRight:8, flexShrink:0, fontSize:13 }}>🌿</div>}
      <div style={{ maxWidth:"73%", padding:"11px 15px", borderRadius:user?"17px 17px 3px 17px":"17px 17px 17px 3px", background:user?"linear-gradient(135deg,#7C9E8F,#5B7D70)":"rgba(255,255,255,0.9)", color:user?"#fff":"#2C3E35", fontSize:14, lineHeight:1.65, boxShadow:user?"0 3px 14px rgba(92,125,112,0.3)":"0 2px 10px rgba(0,0,0,0.07)", fontFamily:"'Lora',Georgia,serif" }}>{m.text}</div>
    </div>
  );
}
function Card({ label, children }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.85)", borderRadius:14, padding:"14px 16px", boxShadow:"0 3px 12px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.4, color:"#7C9E8F", fontFamily:"Lato,sans-serif", marginBottom:8 }}>{label}</div>
      {children}
    </div>
  );
}
function Tag({ children, outline }) {
  return <span style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontFamily:"Lato,sans-serif", fontWeight:600, background:outline?"rgba(91,125,112,0.08)":"rgba(124,158,143,0.15)", color:"#5B7D70", border:outline?"1px solid rgba(91,125,112,0.22)":"none" }}>{children}</span>;
}

function LoginScreen({ onLogin, loading, error }) {
  return (
    <div style={{ width:"100%", height:"100vh", background:"linear-gradient(135deg,#EEF4F1 0%,#E8F0EC 50%,#DDE9E3 100%)", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 15% 85%,rgba(124,158,143,0.12) 0%,transparent 45%),radial-gradient(circle at 85% 15%,rgba(91,125,112,0.08) 0%,transparent 45%)", pointerEvents:"none" }} />
      <div style={{ background:"rgba(255,255,255,0.75)", backdropFilter:"blur(20px)", borderRadius:28, padding:"52px 44px", maxWidth:400, width:"90%", textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,0.1)", border:"1px solid rgba(255,255,255,0.85)", position:"relative", zIndex:1, animation:"fadeUp 0.4s ease-out" }}>
        <div style={{ width:76, height:76, borderRadius:"50%", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:34, margin:"0 auto 22px", boxShadow:"0 8px 28px rgba(92,125,112,0.32)" }}>🌿</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:700, color:"#2C3E35", marginBottom:8 }}>Espacio de Apoyo</div>
        <div style={{ fontFamily:"'Lora',serif", fontSize:14, color:"#7C9E8F", lineHeight:1.75, marginBottom:10 }}>Tu espacio seguro entre sesiones.</div>
        <div style={{ width:36, height:2, background:"linear-gradient(90deg,#7C9E8F,#5B7D70)", borderRadius:2, margin:"0 auto 32px" }} />
        <button onClick={onLogin} disabled={loading} style={{ width:"100%", padding:"15px 20px", borderRadius:14, border:"1.5px solid rgba(200,220,210,0.6)", background:loading?"rgba(238,244,241,0.9)":"white", cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:12, boxShadow:"0 4px 18px rgba(0,0,0,0.08)" }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow="0 6px 24px rgba(92,125,112,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow="0 4px 18px rgba(0,0,0,0.08)"; }}>
          {loading
            ? <><span style={{ width:18, height:18, border:"2px solid #7C9E8F", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} /><span style={{ fontFamily:"Lato,sans-serif", fontWeight:700, fontSize:15, color:"#5B7D70" }}>Conectando...</span></>
            : <><svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink:0 }}><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg><span style={{ fontFamily:"Lato,sans-serif", fontWeight:700, fontSize:15, color:"#2C3E35" }}>Continuar con Google</span></>}
        </button>
        {error && <div style={{ marginTop:16, padding:"10px 14px", borderRadius:10, background:"rgba(229,115,115,0.08)", border:"1px solid rgba(229,115,115,0.25)", fontFamily:"Lato,sans-serif", fontSize:12, color:"#C62828" }}>{error}</div>}
        <div style={{ marginTop:28, fontFamily:"Lato,sans-serif", fontSize:11, color:"#B0CCBF", lineHeight:1.6 }}>Solo tú y tu psicólogo tienen acceso a tus conversaciones.</div>
      </div>
    </div>
  );
}

function PsychPanel({ summary, loading, pastSessions, patient }) {
  const [showHistory, setShowHistory] = useState(false);
  const col = summary ? (summary.nivelMalestar >= 8 ? "#E57373" : summary.nivelMalestar >= 5 ? "#FFB74D" : "#81C784") : "#ccc";
  return (
    <div style={{ height:"100%", overflowY:"auto", padding:"20px 18px", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:700, color:"#2C3E35" }}>Panel del Psicólogo</div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {summary && !loading && (
            <button onClick={() => downloadSummary(summary, patient)}
              style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 11px", borderRadius:14, border:"1.5px solid rgba(124,158,143,0.35)", background:"rgba(255,255,255,0.9)", color:"#5B7D70", fontSize:10, fontFamily:"Lato,sans-serif", fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s ease" }}
              onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg,#7C9E8F,#5B7D70)"; e.currentTarget.style.color = "white"; e.currentTarget.style.borderColor = "transparent"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.9)"; e.currentTarget.style.color = "#5B7D70"; e.currentTarget.style.borderColor = "rgba(124,158,143,0.35)"; }}
            >
              ⬇ Descargar
            </button>
          )}
          {pastSessions.length > 0 && <button onClick={() => setShowHistory(!showHistory)} style={{ fontSize:11, fontFamily:"Lato,sans-serif", fontWeight:700, color:"#7C9E8F", background:"none", border:"1px solid rgba(124,158,143,0.3)", borderRadius:10, padding:"4px 10px", cursor:"pointer" }}>{showHistory ? "Ver resumen" : `Historial (${pastSessions.length})`}</button>}
        </div>
      </div>
      {showHistory && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {pastSessions.map((s, i) => (
            <div key={s.id} style={{ background:"rgba(255,255,255,0.85)", borderRadius:12, padding:"12px 14px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontFamily:"Lato,sans-serif", fontSize:11, fontWeight:700, color:"#7C9E8F", textTransform:"uppercase", letterSpacing:1 }}>Sesión {pastSessions.length - i}</span>
                <span style={{ fontFamily:"Lato,sans-serif", fontSize:11, color:"#A8C4B8" }}>{s.date}</span>
              </div>
              {s.summary ? (
                <>
                  <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#2C3E35", lineHeight:1.6, marginBottom:6 }}>{s.summary.estadoEmocional}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>{s.summary.temasAbordados?.map((t,j) => <Tag key={j}>{t}</Tag>)}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ flex:1, height:4, borderRadius:2, background:"#EEF4F1", overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${s.summary.nivelMalestar*10}%`, background:s.summary.nivelMalestar>=8?"#E57373":s.summary.nivelMalestar>=5?"#FFB74D":"#81C784", borderRadius:2 }} />
                    </div>
                    <span style={{ fontFamily:"Lato,sans-serif", fontSize:11, fontWeight:700, color:"#5B7D70" }}>{s.summary.nivelMalestar}/10</span>
                  </div>
                </>
              ) : <div style={{ fontSize:12, color:"#A8C4B8" }}>Sin resumen</div>}
            </div>
          ))}
        </div>
      )}
      {!showHistory && (<>
        {loading && <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", background:"rgba(124,158,143,0.08)", borderRadius:12 }}><span style={{ width:14, height:14, border:"2px solid #7C9E8F", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} /><span style={{ fontSize:13, color:"#5B7D70", fontFamily:"Lato,sans-serif" }}>Generando resumen clínico...</span></div>}
        {!summary && !loading && <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, opacity:0.45 }}><div style={{ fontSize:38 }}>📋</div><div style={{ fontFamily:"Lato,sans-serif", fontSize:13, color:"#7C9E8F", textAlign:"center", lineHeight:1.7 }}>Pulsa <strong style={{ color:"#5B7D70" }}>📋 Resumen</strong><br/>para ver el análisis clínico</div></div>}
        {summary && !loading && (<>
          <Card label="Estado Emocional"><span style={{ fontFamily:"'Lora',serif", fontSize:14, color:"#2C3E35", lineHeight:1.6 }}>{summary.estadoEmocional}</span></Card>
          <Card label="Nivel de Malestar"><div style={{ display:"flex", alignItems:"center", gap:12 }}><div style={{ flex:1, height:8, borderRadius:4, background:"#EEF4F1", overflow:"hidden" }}><div style={{ height:"100%", width:`${summary.nivelMalestar*10}%`, background:col, borderRadius:4, transition:"width 0.8s ease" }} /></div><span style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:700, color:col }}>{summary.nivelMalestar}/10</span></div></Card>
          {summary.alertas && summary.alertas !== "ninguna" && <div style={{ background:"rgba(229,115,115,0.1)", borderRadius:12, padding:"14px 16px", border:"1.5px solid rgba(229,115,115,0.28)" }}><div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.4, color:"#E57373", fontFamily:"Lato,sans-serif", marginBottom:6 }}>⚠️ Alertas</div><div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#C62828", lineHeight:1.6 }}>{summary.alertas}</div></div>}
          <Card label="Temas Abordados"><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{summary.temasAbordados?.map((t,i) => <Tag key={i}>{t}</Tag>)}</div></Card>
          <Card label="Observaciones Clínicas"><span style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#2C3E35", lineHeight:1.7 }}>{summary.observaciones}</span></Card>
          <Card label="Recomendaciones">{summary.recomendaciones?.map((r,i) => <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"flex-start" }}><span style={{ width:20, height:20, borderRadius:"50%", background:"rgba(124,158,143,0.2)", color:"#5B7D70", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, flexShrink:0 }}>{i+1}</span><span style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#2C3E35", lineHeight:1.6 }}>{r}</span></div>)}</Card>
          <Card label="Recursos Utilizados"><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{summary.recursosUtilizados?.map((r,i) => <Tag key={i} outline>{r}</Tag>)}</div></Card>
        </>)}
      </>)}
    </div>
  );
}

function Chat({ onSummary, user, patient, pastSessions, onSignOut, onSessionSaved }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [newIds, setNewIds] = useState(new Set());
  const [hasMsgs, setHasMsgs] = useState(false);
  const [closed, setClosed] = useState(false);
  const [warning, setWarning] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const endRef = useRef(null);
  const convRef = useRef([]);
  const inactTimer = useRef(null);
  const warnTimer = useRef(null);
  const cdInterval = useRef(null);
  const sessionDate = useRef(new Date().toLocaleDateString("es-ES", { day:"numeric", month:"short", year:"numeric" }));
  const riskDetected = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, typing]);
  const clearTimers = () => { clearTimeout(inactTimer.current); clearTimeout(warnTimer.current); clearInterval(cdInterval.current); };

  const doSummary = async (silent = false) => {
    if (!hasMsgs || convRef.current.length === 0) return;
    if (!silent) setSummarizing(true);
    try {
      const res = await callClaude([...convRef.current, { role:"user", content:"Genera el resumen clínico de esta sesión." }], SUMMARY_PROMPT);
      const parsed = JSON.parse(res.replace(/```json|```/g,"").trim());
      onSummary(parsed);
      const sessionData = { userId: user.uid, date: sessionDate.current, summary: parsed, messageCount: convRef.current.length, createdAt: serverTimestamp() };
      if (riskDetected.current) sessionData.messages = convRef.current;
      await addDoc(collection(db, "sessions"), sessionData);
      onSessionSaved();
    } catch(e) { console.error(e); }
    finally { if (!silent) setSummarizing(false); }
  };

  const closeSession = async () => { clearTimers(); setWarning(false); setClosed(true); if (convRef.current.length > 0) await doSummary(true); };

  const resetTimer = () => {
    if (closed) return;
    clearTimers(); setWarning(false);
    warnTimer.current = setTimeout(() => {
      setWarning(true); setCountdown(120);
      cdInterval.current = setInterval(() => setCountdown(p => { if (p<=1){clearInterval(cdInterval.current);return 0;} return p-1; }), 1000);
    }, INACTIVITY_MS - WARNING_MS);
    inactTimer.current = setTimeout(closeSession, INACTIVITY_MS);
  };
  useEffect(() => { if (hasMsgs) resetTimer(); return clearTimers; }, [hasMsgs, msgs]);

  const startNewSession = () => {
    clearTimers(); setMsgs([]); setInput(""); setTyping(false); setSummarizing(false);
    setNewIds(new Set()); setHasMsgs(false); setClosed(false); setWarning(false); setCountdown(120);
    convRef.current = [];
    riskDetected.current = false;
    sessionDate.current = new Date().toLocaleDateString("es-ES", { day:"numeric", month:"short", year:"numeric" });
    onSummary(null);
  };

  const addBot = (text) => {
    const id = Date.now() + Math.random();
    setMsgs(p => [...p, { id, role:"assistant", text }]);
    setNewIds(p => new Set([...p, id]));
    setTimeout(() => setNewIds(p => { const n = new Set(p); n.delete(id); return n; }), 400);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || typing || closed) return;
    setInput(""); setHasMsgs(true);
    const uid = Date.now();
    setMsgs(p => [...p, { id:uid, role:"user", text }]);
    setNewIds(p => new Set([...p, uid]));
    convRef.current = [...convRef.current, { role:"user", content:text }];
    setTyping(true);
    try {
      const risk = detectRisk(text);
      if (risk) riskDetected.current = true;
      const reply = await callClaude(convRef.current, buildSystem(patient, pastSessions, risk));
      const parts = reply.split("|||").map(p => p.trim()).filter(Boolean);
      convRef.current = [...convRef.current, { role:"assistant", content:parts.join(" ") }];
      for (let i = 0; i < parts.length; i++) {
        await new Promise(r => setTimeout(r, i===0?0:900));
        setTyping(false); addBot(parts[i]);
        if (i < parts.length-1) { await new Promise(r => setTimeout(r, 300)); setTyping(true); }
      }
      setTyping(false);
    } catch { setTyping(false); addBot("Lo siento, hubo un problema técnico."); }
  };

  const firstName = patient?.name?.split(" ")[0] || user?.displayName?.split(" ")[0] || "tú";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", position:"relative" }}>
      {warning && !closed && (
        <div style={{ position:"absolute", inset:0, zIndex:20, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(238,244,241,0.93)", backdropFilter:"blur(8px)", animation:"fadeUp 0.25s ease-out" }}>
          <div style={{ background:"white", borderRadius:20, padding:"28px 24px", maxWidth:280, textAlign:"center", boxShadow:"0 12px 40px rgba(0,0,0,0.11)", border:"1px solid rgba(124,158,143,0.2)" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>⏱️</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:700, color:"#2C3E35", marginBottom:8 }}>¿Sigues ahí?</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#5B7D70", lineHeight:1.65, marginBottom:18 }}>La sesión se cerrará en <strong style={{ color:"#E57373" }}>{countdown}s</strong> por inactividad.</div>
            <button onClick={() => { setWarning(false); resetTimer(); }} style={{ width:"100%", padding:"11px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", color:"white", fontFamily:"Lato,sans-serif", fontWeight:700, fontSize:13, cursor:"pointer" }}>Seguir en la sesión</button>
          </div>
        </div>
      )}
      {closed && (
        <div style={{ position:"absolute", inset:0, zIndex:20, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(238,244,241,0.96)", backdropFilter:"blur(8px)" }}>
          <div style={{ background:"white", borderRadius:20, padding:"28px 24px", maxWidth:280, textAlign:"center", boxShadow:"0 12px 40px rgba(0,0,0,0.11)", border:"1px solid rgba(124,158,143,0.2)" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🌿</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:700, color:"#2C3E35", marginBottom:8 }}>Sesión finalizada</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#5B7D70", lineHeight:1.7 }}>{summarizing ? "Guardando..." : "Guardada. 💚"}</div>
            {summarizing && <div style={{ marginTop:14, display:"flex", justifyContent:"center" }}><span style={{ width:16, height:16, border:"2px solid #7C9E8F", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} /></div>}
            {!summarizing && <button onClick={startNewSession} style={{ marginTop:18, width:"100%", padding:"11px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", color:"white", fontFamily:"Lato,sans-serif", fontWeight:700, fontSize:13, cursor:"pointer" }}>✦ Nueva sesión</button>}
          </div>
        </div>
      )}
      <div style={{ padding:"11px 14px", borderBottom:"1px solid rgba(124,158,143,0.18)", display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.65)", backdropFilter:"blur(12px)" }}>
        <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>🌿</div>
        <div style={{ flex:1 }}><div style={{ fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:700, color:"#2C3E35" }}>Espacio de Apoyo</div><div style={{ fontSize:9, color:"#7C9E8F", fontFamily:"Lato,sans-serif" }}>● En línea · {firstName}</div></div>
        <div style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 10px", borderRadius:20, background:"rgba(124,158,143,0.07)", border:"1px solid rgba(124,158,143,0.18)" }}>
          {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" style={{ width:24, height:24, borderRadius:"50%", objectFit:"cover", border:"1.5px solid rgba(124,158,143,0.35)" }} /> : <div style={{ width:24, height:24, borderRadius:"50%", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"white", fontWeight:700 }}>{firstName[0]?.toUpperCase() || "?"}</div>}
          <span style={{ fontSize:12, fontFamily:"Lato,sans-serif", fontWeight:600, color:"#5B7D70", maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{firstName}</span>
          <button onClick={onSignOut} title="Cerrar sesión" style={{ background:"none", border:"none", cursor:"pointer", padding:"2px 4px", opacity:0.5, transition:"opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity="1"} onMouseLeave={e => e.currentTarget.style.opacity="0.5"}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E57373" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
        <div style={{ width:1, height:22, background:"rgba(124,158,143,0.2)", margin:"0 2px" }} />
        <button onClick={() => doSummary(false)} disabled={!hasMsgs || summarizing} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 10px", borderRadius:18, border:"1.5px solid rgba(124,158,143,0.35)", background:"rgba(255,255,255,0.9)", color:"#5B7D70", fontSize:10, fontFamily:"Lato,sans-serif", fontWeight:700, cursor:!hasMsgs||summarizing?"not-allowed":"pointer", opacity:!hasMsgs?0.4:1, whiteSpace:"nowrap" }}>
          {summarizing ? <><span style={{ width:9, height:9, border:"2px solid #7C9E8F", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} /> Guardando...</> : <>📋 Resumen</>}
        </button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 14px", display:"flex", flexDirection:"column", gap:3 }}>
        {!hasMsgs && <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, opacity:0.38, paddingTop:50 }}><div style={{ fontSize:32 }}>💬</div><div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#5B7D70", textAlign:"center", lineHeight:1.7 }}>Hola {firstName}, ¿cómo te sientes hoy?</div></div>}
        {msgs.map(m => <Msg key={m.id} m={m} isNew={newIds.has(m.id)} />)}
        {typing && <div style={{ display:"flex", alignItems:"flex-end", gap:7, animation:"fadeUp 0.2s ease-out" }}><div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>🌿</div><TypingDots /></div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding:"12px 14px", borderTop:"1px solid rgba(124,158,143,0.13)", background:"rgba(255,255,255,0.65)", backdropFilter:"blur(12px)" }}>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey){e.preventDefault(); send();} }} placeholder="Escribe cómo te sientes..." rows={1} disabled={closed} style={{ flex:1, padding:"10px 14px", borderRadius:22, border:"1.5px solid rgba(124,158,143,0.28)", background:"rgba(255,255,255,0.94)", fontSize:14, fontFamily:"'Lora',serif", resize:"none", outline:"none", color:"#2C3E35", lineHeight:1.5 }} onFocus={e => e.target.style.borderColor="#7C9E8F"} onBlur={e => e.target.style.borderColor="rgba(124,158,143,0.28)"} />
          <button onClick={send} disabled={typing||!input.trim()||closed} style={{ width:42, height:42, borderRadius:"50%", border:"none", cursor:"pointer", background:typing||!input.trim()||closed?"#D4E4DC":"linear-gradient(135deg,#7C9E8F,#5B7D70)", color:"white", fontSize:17, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>→</button>
        </div>
        <div style={{ textAlign:"center", marginTop:6, fontSize:10, color:"#A8C4B8", fontFamily:"Lato,sans-serif" }}>Confidencial · Apoyo entre sesiones</div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [patient, setPatient] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [pastSessions, setPastSessions] = useState([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => { const unsub = onAuthStateChanged(auth, u => setUser(u || null)); return unsub; }, []);
  useEffect(() => { if (!user) { setPatient(null); setPastSessions([]); return; } loadOrCreatePatient(user); }, [user]);

  const loadOrCreatePatient = async (u) => {
    setDataLoading(true);
    try {
      const ref = doc(db, "patients", u.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setPatient({ id: snap.id, ...snap.data() });
      } else {
        const newPatient = { name: u.displayName || u.email.split("@")[0], email: u.email, diagnosis: "", psychologist_notes: "", current_medication: "", treatment_plan: "", createdAt: serverTimestamp() };
        await setDoc(ref, newPatient);
        setPatient({ id: u.uid, ...newPatient });
      }
      const q = query(collection(db, "sessions"), where("userId","==", u.uid), orderBy("createdAt","desc"));
      const sessionSnap = await getDocs(q);
      setPastSessions(sessionSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) {
      console.error(e);
      setPatient({ name: u.displayName || u.email, email: u.email, diagnosis:"", psychologist_notes:"", current_medication:"", treatment_plan:"" });
    }
    setDataLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoginLoading(true); setLoginError(null);
    try { await signInWithPopup(auth, googleProvider); }
    catch (err) { if (err.code !== "auth/popup-closed-by-user") setLoginError("No se pudo iniciar sesión. Inténtalo de nuevo."); }
    setLoginLoading(false);
  };
  const handleSignOut = async () => { await signOut(auth); setPatient(null); setSummary(null); setPastSessions([]); };
  const handleSessionSaved = () => { if (user) loadOrCreatePatient(user); };

  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lora:wght@400;500&family=Lato:wght@400;600;700&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin { to{transform:rotate(360deg)} }
    ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:rgba(124,158,143,0.3);border-radius:2px}
  `;

  const Spinner = () => <div style={{ width:"100%", height:"100vh", background:"linear-gradient(135deg,#EEF4F1,#DDE9E3)", display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ width:32, height:32, border:"3px solid #7C9E8F", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} /></div>;

  if (user === undefined || dataLoading || (user && !patient)) return <><style>{STYLES}</style><Spinner /></>;
  if (!user) return <><style>{STYLES}</style><LoginScreen onLogin={handleGoogleLogin} loading={loginLoading} error={loginError} /></>;

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ width:"100%", height:"100vh", background:"linear-gradient(135deg,#EEF4F1 0%,#E8F0EC 50%,#DDE9E3 100%)", display:"flex", overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 15% 85%,rgba(124,158,143,0.1) 0%,transparent 45%),radial-gradient(circle at 85% 15%,rgba(91,125,112,0.07) 0%,transparent 45%)", pointerEvents:"none" }} />
        <div style={{ flex:1, display:"flex", maxWidth:1100, margin:"0 auto", width:"100%", padding:"20px", gap:"20px" }}>
          <div style={{ flex:"0 0 440px", display:"flex", flexDirection:"column", background:"rgba(255,255,255,0.52)", borderRadius:22, boxShadow:"0 8px 36px rgba(0,0,0,0.08)", border:"1px solid rgba(255,255,255,0.72)", overflow:"hidden" }}>
            <Chat onSummary={s => { setSummaryLoading(false); setSummary(s); }} user={user} patient={patient} pastSessions={pastSessions} onSignOut={handleSignOut} onSessionSaved={handleSessionSaved} />
          </div>
          <div style={{ width:1, background:"linear-gradient(to bottom,transparent,rgba(124,158,143,0.25),transparent)", flexShrink:0 }} />
          <div style={{ flex:1, background:"rgba(255,255,255,0.42)", borderRadius:22, boxShadow:"0 8px 36px rgba(0,0,0,0.06)", border:"1px solid rgba(255,255,255,0.72)", overflow:"hidden" }}>
            <PsychPanel summary={summary} loading={summaryLoading} pastSessions={pastSessions} patient={patient} />
          </div>
        </div>
      </div>
    </>
  );
}
