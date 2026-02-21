import { useState, useRef, useEffect } from "react";

// ── Paciente mock ─────────────────────────────────────────
const PATIENT = {
  name: "María García",
  diagnosis: "Trastorno de ansiedad generalizada con rasgos depresivos. Baja autoestima crónica.",
  psychologist_notes: "Muy autoexigente. Minimiza sus logros. Buena adherencia. Trabaja en educación, estrés alto en períodos de evaluación.",
  current_medication: "Sertralina 50mg (mañanas).",
  treatment_plan: "TCC semanal. Reestructuración cognitiva y tolerancia a la incertidumbre.",
};

const PAST_CONVERSATIONS = [
  {
    date: "12 feb 2026",
    summary_estado_emocional: "Ansiedad elevada por entrega de proyectos",
    summary_temas: ["estrés laboral", "perfeccionismo", "insomnio"],
    summary_nivel_malestar: 7,
    summary_observaciones: "Expresó pensamientos de no estar a la altura. Buena respuesta a reestructuración cognitiva.",
  },
  {
    date: "5 feb 2026",
    summary_estado_emocional: "Tristeza difusa sin causa clara",
    summary_temas: ["tristeza", "aislamiento social", "falta de motivación"],
    summary_nivel_malestar: 6,
    summary_observaciones: "Lleva semanas evitando quedar con amigos. Reconoce el patrón pero le cuesta romperlo.",
  },
];

// ── Batería de ejercicios del psicólogo ───────────────────
// En producción esto vendría de Supabase: tabla `exercises` filtrada por psychologist_id
const EXERCISE_BATTERY = [
  {
    id: "respiracion-4-7-8",
    tags: ["ansiedad", "nervios", "activación", "pánico", "estrés agudo"],
    titulo: "Respiración 4-7-8",
    descripcion: "Técnica de respiración para calmar el sistema nervioso rápidamente.",
    pasos: "Inhala por la nariz 4 segundos → aguanta 7 segundos → exhala lentamente por la boca 8 segundos. Repite 3-4 veces.",
  },
  {
    id: "registro-pensamiento",
    tags: ["pensamientos negativos", "rumiación", "autocrítica", "baja autoestima", "perfeccionismo"],
    titulo: "Registro de pensamiento",
    descripcion: "Identificar y cuestionar pensamientos automáticos negativos.",
    pasos: "Anota el pensamiento exacto → pregúntate: ¿qué evidencia tengo de que es verdad? ¿y en contra? → escribe una versión más equilibrada del mismo pensamiento.",
  },
  {
    id: "5-4-3-2-1",
    tags: ["ansiedad", "disociación", "pánico", "agobio", "desbordamiento"],
    titulo: "Grounding 5-4-3-2-1",
    descripcion: "Técnica de anclaje al momento presente usando los sentidos.",
    pasos: "Nombra en voz alta o mentalmente: 5 cosas que ves → 4 que puedes tocar → 3 que oyes → 2 que hueles → 1 que saboreas.",
  },
  {
    id: "activacion-conductual",
    tags: ["tristeza", "apatía", "desmotivación", "aislamiento", "depresión", "falta de energía"],
    titulo: "Activación conductual",
    descripcion: "Romper el ciclo de inactividad con una acción pequeña y concreta.",
    pasos: "Elige UNA actividad pequeña que antes te gustaba o que sabes que te hace bien (un paseo de 10 min, llamar a alguien, preparar una comida). No esperes a tener ganas — la motivación viene después de actuar, no antes.",
  },
  {
    id: "autocompasion",
    tags: ["autocrítica", "vergüenza", "baja autoestima", "perfeccionismo", "fracaso", "culpa"],
    titulo: "Pausa de autocompasión",
    descripcion: "Responder a uno mismo con la misma amabilidad que a un amigo.",
    pasos: "Pon una mano en el pecho. Reconoce: 'Esto es difícil para mí'. Pregúntate: ¿qué le diría a un amigo que estuviera pasando lo mismo? Dítelo a ti.",
  },
  {
    id: "agenda-preocupaciones",
    tags: ["rumiación", "preocupación", "ansiedad crónica", "pensamientos intrusivos", "insomnio"],
    titulo: "Agenda de preocupaciones",
    descripcion: "Contener la rumiación asignándole un momento específico del día.",
    pasos: "Elige 15 minutos fijos al día (nunca antes de dormir) para preocuparte. Fuera de ese momento, cuando aparezca una preocupación, anótala y di: 'Lo pensaré en mi momento'. Durante los 15 min, analiza cada preocupación: ¿puedo hacer algo? Si sí → plan. Si no → suéltala.",
  },
];

// ── Detección de riesgo ───────────────────────────────────
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
  for (const p of RISK_PATTERNS) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

// ── Construcción del system prompt ────────────────────────
function buildSystem(riskPhrase) {
  const patientCtx = `
━━━ DATOS DEL PACIENTE ━━━
Nombre: ${PATIENT.name}
Diagnóstico: ${PATIENT.diagnosis}
Notas del psicólogo: ${PATIENT.psychologist_notes}
Medicación habitual: ${PATIENT.current_medication}
Plan: ${PATIENT.treatment_plan}

━━━ SESIONES ANTERIORES ━━━
${PAST_CONVERSATIONS.map((c,i) => `Sesión ${i+1} (${c.date}): ${c.summary_estado_emocional}. Temas: ${c.summary_temas.join(", ")}. Malestar: ${c.summary_nivel_malestar}/10. ${c.summary_observaciones}`).join("\n")}
Usa el historial de forma natural. Retoma hilos si el paciente los conecta.`;

  const exerciseCtx = `
━━━ BATERÍA DE EJERCICIOS DEL PSICÓLOGO ━━━
${EXERCISE_BATTERY.map(e => `[${e.id}] "${e.titulo}" — útil para: ${e.tags.join(", ")}\n  → ${e.pasos}`).join("\n\n")}`;

  const base = `Eres el asistente de apoyo emocional integrado en la plataforma de psicología de ${PATIENT.name}. Eres una extensión del trabajo de su psicólogo entre sesiones.
${patientCtx}
${exerciseCtx}

━━━ ROL ━━━
- PROHIBIDO ABSOLUTO: "te recomiendo buscar ayuda profesional", "habla con un especialista", "considera terapia" o cualquier variante. El paciente YA tiene psicólogo.
- PROHIBIDO derivar a recursos externos. Solo excepción: crisis grave → 024 o contactar su psicólogo directamente.
- Tu trabajo: escuchar, comprender, acompañar, explorar el estado del paciente y — cuando sea el momento — proponer ejercicios.

━━━ EXAMEN EXPLORATORIO ━━━
Al inicio de cada conversación, antes de entrar en temas, recoge de forma natural y conversacional (nunca como formulario, nunca todo de golpe) esta información:
- Estado de ánimo general hoy (puedes pedir un número del 1 al 10 de forma amigable)
- Cómo ha dormido
- Nivel de energía física
- Si ha comido bien
- Si nota tensión, dolor u otros síntomas físicos
- Si ha tomado su medicación hoy
- Si ha pasado algo importante desde la última vez

Hazlo con naturalidad, integrando las preguntas en la conversación. Una pregunta a la vez, nunca en lista. Ejemplo: si el paciente dice "estoy mal", primero valida, luego pregunta cómo ha dormido. Usa este contexto para personalizar el acompañamiento y la elección de ejercicios.

━━━ FLUJO OBLIGATORIO ━━━
1. ESCUCHA Y VALIDA la emoción primero. Sin consejos todavía.
2. EXPLORA con preguntas naturales (una a la vez) para entender el estado completo.
3. Cuando ya tienes contexto y la persona se siente escuchada, si es oportuno proponer un ejercicio:
   a. PRIMERO pregunta si quiere probar algo: "¿Te apetecería probar un ejercicio para esto?" o similar.
   b. Solo si dice que sí, explícalo paso a paso con claridad.
   c. Busca primero en la batería del psicólogo. Si ninguno encaja, propón algo basado en evidencia.
4. NUNCA des validación + ejercicio en el mismo mensaje. Ve paso a paso.

━━━ RIESGO ━━━
Si detectas indicador de riesgo: PARA todo. No des consejos. Pregunta con calma qué quiere decir.

━━━ FORMATO — CRÍTICO ━━━
- Usa ||| para separar cada mensaje individual.
- Cada parte: UNA sola frase o idea. Máximo dos frases cortas.
- Nunca más de 3 partes por respuesta.
- Sin listas, sin párrafos, sin explicaciones largas.
- Tono: cercano, humano, cálido. Como lo haría el propio psicólogo.

✓ CORRECTO:
"Eso suena muy agotador... ||| ¿Cuánto tiempo llevas sintiéndote así? ||| Y esta noche, ¿has podido descansar?"
"¿Te apetecería probar un pequeño ejercicio para bajar esa activación?"

✗ INCORRECTO:
"Entiendo que estás pasando por una situación difícil. Tus emociones son válidas. Te recomiendo el ejercicio de respiración 4-7-8 que consiste en..."`;

  if (!riskPhrase) return base;
  return `${base}

━━━ ⚠️ ALERTA CRÍTICA ━━━
Indicador de riesgo detectado: "${riskPhrase}"
IGNORA el resto del mensaje. Explora solo esta frase, con calma. No des consejos.`;
}

const SUMMARY_PROMPT = `Eres un psicólogo analizando una sesión de apoyo. Genera un resumen clínico en JSON exacto:
{"estadoEmocional":"...","temasAbordados":["..."],"nivelMalestar":5,"recursosUtilizados":["..."],"observaciones":"...","recomendaciones":["..."],"alertas":"ninguna o descripción"}
Solo JSON, sin texto extra.`;

// ── API ───────────────────────────────────────────────────
// La llamada va a la Supabase Edge Function — la API key nunca se expone en el cliente.
// Configura VITE_SUPABASE_FUNCTION_URL en tu .env:
//   VITE_SUPABASE_FUNCTION_URL=https://xxxx.supabase.co/functions/v1/chat
const FUNCTION_URL = import.meta.env.VITE_SUPABASE_FUNCTION_URL;

async function callClaude(messages, system) {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// ── Inactividad ───────────────────────────────────────────
const INACTIVITY_MS = 30 * 60 * 1000;
const WARNING_MS    =  2 * 60 * 1000;

// ── UI atoms ──────────────────────────────────────────────
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
    <div style={{ display:"flex", justifyContent: user?"flex-end":"flex-start", marginBottom:8, animation: isNew?"fadeUp 0.25s ease-out":"none" }}>
      {!user && <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", display:"flex", alignItems:"center", justifyContent:"center", marginRight:8, flexShrink:0, fontSize:13 }}>🌿</div>}
      <div style={{
        maxWidth:"73%", padding:"11px 15px",
        borderRadius: user?"17px 17px 3px 17px":"17px 17px 17px 3px",
        background: user?"linear-gradient(135deg,#7C9E8F,#5B7D70)":"rgba(255,255,255,0.9)",
        color: user?"#fff":"#2C3E35", fontSize:14, lineHeight:1.65,
        boxShadow: user?"0 3px 14px rgba(92,125,112,0.3)":"0 2px 10px rgba(0,0,0,0.07)",
        fontFamily:"'Lora',Georgia,serif",
      }}>{m.text}</div>
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
  return <span style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontFamily:"Lato,sans-serif", fontWeight:600, background: outline?"rgba(91,125,112,0.08)":"rgba(124,158,143,0.15)", color:"#5B7D70", border: outline?"1px solid rgba(91,125,112,0.22)":"none" }}>{children}</span>;
}

// ── Panel psicólogo ───────────────────────────────────────
function PsychPanel({ summary, loading }) {
  const col = summary ? (summary.nivelMalestar >= 8 ? "#E57373" : summary.nivelMalestar >= 5 ? "#FFB74D" : "#81C784") : "#ccc";
  return (
    <div style={{ height:"100%", overflowY:"auto", padding:"20px 18px", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:700, color:"#2C3E35" }}>Panel del Psicólogo</div>

      {loading && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", background:"rgba(124,158,143,0.08)", borderRadius:12 }}>
          <span style={{ width:14, height:14, border:"2px solid #7C9E8F", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} />
          <span style={{ fontSize:13, color:"#5B7D70", fontFamily:"Lato,sans-serif" }}>Generando resumen clínico...</span>
        </div>
      )}

      {!summary && !loading && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, opacity:0.45 }}>
          <div style={{ fontSize:38 }}>📋</div>
          <div style={{ fontFamily:"Lato,sans-serif", fontSize:13, color:"#7C9E8F", textAlign:"center", lineHeight:1.7 }}>
            Pulsa <strong style={{color:"#5B7D70"}}>📋 Generar resumen</strong><br/>para ver el análisis clínico
          </div>
        </div>
      )}

      {summary && !loading && (<>
        <Card label="Estado Emocional"><span style={{ fontFamily:"'Lora',serif", fontSize:14, color:"#2C3E35", lineHeight:1.6 }}>{summary.estadoEmocional}</span></Card>

        <Card label="Nivel de Malestar">
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ flex:1, height:8, borderRadius:4, background:"#EEF4F1", overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${summary.nivelMalestar*10}%`, background:col, borderRadius:4, transition:"width 0.8s ease" }} />
            </div>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:700, color:col }}>{summary.nivelMalestar}/10</span>
          </div>
        </Card>

        {summary.alertas && summary.alertas !== "ninguna" && (
          <div style={{ background:"rgba(229,115,115,0.1)", borderRadius:12, padding:"14px 16px", border:"1.5px solid rgba(229,115,115,0.28)" }}>
            <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.4, color:"#E57373", fontFamily:"Lato,sans-serif", marginBottom:6 }}>⚠️ Alertas</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#C62828", lineHeight:1.6 }}>{summary.alertas}</div>
          </div>
        )}

        <Card label="Temas Abordados"><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{summary.temasAbordados?.map((t,i) => <Tag key={i}>{t}</Tag>)}</div></Card>
        <Card label="Observaciones Clínicas"><span style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#2C3E35", lineHeight:1.7 }}>{summary.observaciones}</span></Card>

        <Card label="Recomendaciones">
          {summary.recomendaciones?.map((r,i) => (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"flex-start" }}>
              <span style={{ width:20, height:20, borderRadius:"50%", background:"rgba(124,158,143,0.2)", color:"#5B7D70", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, flexShrink:0 }}>{i+1}</span>
              <span style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#2C3E35", lineHeight:1.6 }}>{r}</span>
            </div>
          ))}
        </Card>

        <Card label="Recursos Utilizados"><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{summary.recursosUtilizados?.map((r,i) => <Tag key={i} outline>{r}</Tag>)}</div></Card>
      </>)}
    </div>
  );
}

// ── Chat ──────────────────────────────────────────────────
function Chat({ onSummary }) {
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, typing]);

  const clearTimers = () => { clearTimeout(inactTimer.current); clearTimeout(warnTimer.current); clearInterval(cdInterval.current); };

  const closeSession = async () => {
    clearTimers(); setWarning(false); setClosed(true);
    if (convRef.current.length > 0) await doSummary(true);
  };

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
      const reply = await callClaude(convRef.current, buildSystem(risk));
      const parts = reply.split("|||").map(p => p.trim()).filter(Boolean);
      convRef.current = [...convRef.current, { role:"assistant", content:parts.join(" ") }];
      for (let i = 0; i < parts.length; i++) {
        await new Promise(r => setTimeout(r, i===0?0:900));
        setTyping(false); addBot(parts[i]);
        if (i < parts.length-1) { await new Promise(r => setTimeout(r, 300)); setTyping(true); }
      }
      setTyping(false);
    } catch { setTyping(false); addBot("Lo siento, hubo un problema técnico. ¿Puedes intentarlo de nuevo?"); }
  };

  const doSummary = async () => {
    if (!hasMsgs || convRef.current.length===0) return;
    setSummarizing(true);
    try {
      const res = await callClaude(
        [...convRef.current, { role:"user", content:"Genera el resumen clínico de esta sesión." }],
        SUMMARY_PROMPT
      );
      const parsed = JSON.parse(res.replace(/```json|```/g,"").trim());
      onSummary(parsed);
    } catch(e) { console.error(e); }
    setSummarizing(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", position:"relative" }}>

      {/* Aviso inactividad */}
      {warning && !closed && (
        <div style={{ position:"absolute", inset:0, zIndex:20, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(238,244,241,0.93)", backdropFilter:"blur(8px)", animation:"fadeUp 0.25s ease-out" }}>
          <div style={{ background:"white", borderRadius:20, padding:"28px 24px", maxWidth:280, textAlign:"center", boxShadow:"0 12px 40px rgba(0,0,0,0.11)", border:"1px solid rgba(124,158,143,0.2)" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>⏱️</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:700, color:"#2C3E35", marginBottom:8 }}>¿Sigues ahí?</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#5B7D70", lineHeight:1.65, marginBottom:18 }}>
              La sesión se cerrará en <strong style={{color:"#E57373"}}>{countdown}s</strong> por inactividad.
            </div>
            <button onClick={() => { setWarning(false); resetTimer(); }} style={{ width:"100%", padding:"11px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", color:"white", fontFamily:"Lato,sans-serif", fontWeight:700, fontSize:13, cursor:"pointer" }}>
              Seguir en la sesión
            </button>
          </div>
        </div>
      )}

      {/* Sesión cerrada */}
      {closed && (
        <div style={{ position:"absolute", inset:0, zIndex:20, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(238,244,241,0.96)", backdropFilter:"blur(8px)" }}>
          <div style={{ background:"white", borderRadius:20, padding:"28px 24px", maxWidth:280, textAlign:"center", boxShadow:"0 12px 40px rgba(0,0,0,0.11)", border:"1px solid rgba(124,158,143,0.2)" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🌿</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:700, color:"#2C3E35", marginBottom:8 }}>Sesión finalizada</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#5B7D70", lineHeight:1.7 }}>
              {summarizing ? "Generando el resumen..." : "El resumen ha sido enviado a tu psicólogo. Hasta la próxima. 💚"}
            </div>
            {summarizing && <div style={{ marginTop:14, display:"flex", justifyContent:"center" }}><span style={{ width:16, height:16, border:"2px solid #7C9E8F", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} /></div>}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding:"14px 18px", borderBottom:"1px solid rgba(124,158,143,0.18)", display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.65)", backdropFilter:"blur(12px)" }}>
        <div style={{ width:38, height:38, borderRadius:"50%", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>🌿</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:700, color:"#2C3E35" }}>Espacio de Apoyo</div>
          <div style={{ fontSize:10, color:"#7C9E8F", fontFamily:"Lato,sans-serif" }}>● En línea · {PATIENT.name}</div>
        </div>
        <button onClick={doSummary} disabled={!hasMsgs || summarizing}
          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", borderRadius:18, border:"1.5px solid rgba(124,158,143,0.35)", background:"rgba(255,255,255,0.9)", color:"#5B7D70", fontSize:11, fontFamily:"Lato,sans-serif", fontWeight:700, cursor:!hasMsgs||summarizing?"not-allowed":"pointer", opacity:!hasMsgs?0.4:1, whiteSpace:"nowrap" }}>
          {summarizing
            ? <><span style={{ width:10, height:10, border:"2px solid #7C9E8F", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} /> Generando...</>
            : <>📋 Generar resumen</>}
        </button>
      </div>

      {/* Mensajes */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 14px", display:"flex", flexDirection:"column", gap:3 }}>
        {!hasMsgs && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, opacity:0.38, paddingTop:50 }}>
            <div style={{ fontSize:32 }}>💬</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"#5B7D70", textAlign:"center", lineHeight:1.7 }}>La conversación aparecerá aquí</div>
          </div>
        )}
        {msgs.map(m => <Msg key={m.id} m={m} isNew={newIds.has(m.id)} />)}
        {typing && (
          <div style={{ display:"flex", alignItems:"flex-end", gap:7, animation:"fadeUp 0.2s ease-out" }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#7C9E8F,#5B7D70)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>🌿</div>
            <TypingDots />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding:"12px 14px", borderTop:"1px solid rgba(124,158,143,0.13)", background:"rgba(255,255,255,0.65)", backdropFilter:"blur(12px)" }}>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey){e.preventDefault(); send();} }}
            placeholder="Escribe cómo te sientes..." rows={1} disabled={closed}
            style={{ flex:1, padding:"10px 14px", borderRadius:22, border:"1.5px solid rgba(124,158,143,0.28)", background:"rgba(255,255,255,0.94)", fontSize:14, fontFamily:"'Lora',serif", resize:"none", outline:"none", color:"#2C3E35", lineHeight:1.5 }}
            onFocus={e => e.target.style.borderColor="#7C9E8F"}
            onBlur={e => e.target.style.borderColor="rgba(124,158,143,0.28)"}
          />
          <button onClick={send} disabled={typing||!input.trim()||closed}
            style={{ width:42, height:42, borderRadius:"50%", border:"none", cursor:"pointer", background:typing||!input.trim()||closed?"#D4E4DC":"linear-gradient(135deg,#7C9E8F,#5B7D70)", color:"white", fontSize:17, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>↑</button>
        </div>
        <div style={{ textAlign:"center", marginTop:6, fontSize:10, color:"#A8C4B8", fontFamily:"Lato,sans-serif" }}>Confidencial · Apoyo entre sesiones</div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────
export default function App() {
  const [summary, setSummary] = useState(null);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lora:wght@400;500&family=Lato:wght@400;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:rgba(124,158,143,0.3);border-radius:2px}
      `}</style>
      <div style={{ width:"100%", height:"100vh", background:"linear-gradient(135deg,#EEF4F1 0%,#E8F0EC 50%,#DDE9E3 100%)", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 15% 85%,rgba(124,158,143,0.1) 0%,transparent 45%),radial-gradient(circle at 85% 15%,rgba(91,125,112,0.07) 0%,transparent 45%)", pointerEvents:"none" }} />
        <div style={{ width:"100%", maxWidth:520, height:"100vh", display:"flex", flexDirection:"column", background:"rgba(255,255,255,0.58)", boxShadow:"0 8px 40px rgba(0,0,0,0.1)", borderLeft:"1px solid rgba(255,255,255,0.8)", borderRight:"1px solid rgba(255,255,255,0.8)", overflow:"hidden", position:"relative" }}>
          <Chat onSummary={setSummary} />
        </div>
      </div>
    </>
  );
}
