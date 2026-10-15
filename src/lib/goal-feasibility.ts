/**
 * Il coach verifica se l'obiettivo è raggiungibile nel tempo previsto, con i tuoi dati, e propone alternative realistiche.
 * Tutto calcolato (niente AI), con ritmi da atleta natural che si allena con costanza:
 * - massa magra in più a settimana: neofita ~0,25 kg, intermedio ~0,13, avanzato ~0,06 (donne ~55%, meno dopo i 40 anni,
 *   meno quando ci si avvicina al limite naturale, FFMI ~25 uomo / ~21 donna);
 * - massa: peso in più al massimo 0,5% a settimana (consigliato 0,25%), al più ~75% di quel peso è massa magra;
 * - definizione: la massa magra si mantiene (un neofita può guadagnarne pochissima); calo al massimo ~0,7% del peso
 *   a settimana, 0,5% quando si è già asciutti.
 */
import type { GoalPhase, GoalPlan } from './goal-plan';
import type { UserProfile } from './metabolism';
import type { Goal } from './metabolism';

const WEEK = 7 * 86400000;
const r1 = (v: number) => Math.round(v * 10) / 10;
const itKg = (v: number) => r1(v).toString().replace('.', ',');
const pct = (v: number) => `${Math.round(v)}%`;
const iso = (t: number) => new Date(t).toLocaleDateString('sv-SE');
const ts = (d: string) => new Date(`${d}T12:00:00`).getTime();
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

export interface Comp {
  weight: number;
  bf: number;
  lean: number;
  fat: number;
}
export const compOf = (weight: number, bf: number): Comp => ({ weight, bf, lean: weight * (1 - bf / 100), fat: (weight * bf) / 100 });
const fromLean = (lean: number, weight: number): Comp => ({ weight, lean, fat: weight - lean, bf: ((weight - lean) / weight) * 100 });

const LEVEL_IT: Record<UserProfile['experience'], string> = { beginner: 'neofita', intermediate: 'intermedio', advanced: 'avanzato' };

const BULK_MAX = 0.005;
const BULK_OK = 0.0025;

/** FFMI: massa magra in rapporto all'altezza (normalizzato a 1,80 m). */
const ffmiOf = (p: UserProfile, lean: number) => {
  const h = p.heightCm / 100;
  return lean / (h * h) + 6.1 * (1.8 - h);
};
/** Potenziale rimasto (0–1): quanto sei lontano dal limite naturale di muscolo (FFMI ~25 uomo, ~21,5 donna). */
export function potential(p: UserProfile, lean: number): number {
  const ffmi = ffmiOf(p, lean);
  const v = p.sex === 'f' ? (21.5 - ffmi) / 6.5 : (25 - ffmi) / 7;
  return Math.max(0, Math.min(1, v));
}

/**
 * Massa magra che puoi mettere in una settimana con allenamento e surplus giusti (kg).
 * Conta soprattutto quanto sei lontano dal limite naturale (lontano ~0,25 kg, vicino ~0,04); il livello dichiarato
 * corregge un po' (neofita +15%, avanzato −15%), poi sesso ed età.
 */
export function leanGainPerWeek(p: UserProfile, lean: number): number {
  const byPotential = 0.04 + 0.22 * potential(p, lean) ** 1.5;
  const exp = p.experience === 'beginner' ? 1.15 : p.experience === 'advanced' ? 0.85 : 1;
  const sex = p.sex === 'f' ? 0.55 : 1;
  const age = p.age >= 50 ? 0.7 : p.age >= 40 ? 0.85 : 1;
  return byPotential * exp * sex * age;
}

/** Massa magra dopo `weeks` settimane di massa (il ritmo cala man mano che ti avvicini al limite). */
function leanAfter(p: UserProfile, lean: number, weeks: number): number {
  let l = lean;
  const n = Math.floor(weeks);
  for (let i = 0; i < n; i++) l += leanGainPerWeek(p, l);
  return l + leanGainPerWeek(p, l) * (weeks - n);
}

/** In massa con il surplus giusto ~55% del peso preso è massa magra. */
const LEAN_SHARE = 0.55;

/**
 * Massa "pulita" di b settimane: ogni settimana il peso sale quanto serve al muscolo che puoi mettere
 * (massa magra / 55%), al massimo 0,5% del peso.
 */
function leanBulk(p: UserProfile, start: Comp, weeks: number): Comp {
  let lean = start.lean;
  let w = start.weight;
  for (let i = 0; i < Math.round(weeks); i++) {
    const g = leanGainPerWeek(p, lean);
    const dw = Math.min(g / LEAN_SHARE, w * BULK_MAX);
    lean += Math.min(g, dw * 0.75);
    w += dw;
  }
  return fromLean(lean, w);
}

/** Percentuale minima di grasso sensata (non la proponiamo mai sotto). */
const minBf = (p: UserProfile) => (p.sex === 'f' ? 15 : 7);
/** Calo massimo a settimana in definizione (frazione del peso): 0,7%, 0,5% quando sei già asciutto. */
const cutRate = (p: UserProfile, bf: number) => (bf < (p.sex === 'f' ? 20 : 12) ? 0.005 : 0.007);
/** Settimane per scendere da un peso all'altro mantenendo la massa magra. */
function cutWeeks(p: UserProfile, from: Comp, toWeight: number): number {
  let w = from.weight;
  let n = 0;
  while (w > toWeight + 0.01 && n < 520) {
    w -= w * cutRate(p, ((w - from.lean) / w) * 100);
    n++;
  }
  return n;
}

export type Verdict = 'ok' | 'tight' | 'no';
export interface PhaseCheck {
  index: number;
  phase: GoalPhase;
  weeks: number;
  from: Comp;
  /** come arrivi davvero a fine fase con questo piano */
  to: Comp;
  verdict: Verdict;
  issues: string[];
}

/** Simula le fasi (dalla fase in corso) partendo da oggi: come saresti davvero a fine di ognuna e cosa non torna. */
export function checkPlan(p: UserProfile, now: Comp, phases: GoalPhase[], current: number, today = Date.now()): PhaseCheck[] {
  const out: PhaseCheck[] = [];
  let cur = now;
  for (let i = current; i < phases.length; i++) {
    const ph = phases[i];
    const startT = Math.max(today, ts(ph.start));
    const weeks = Math.max(0.5, (ts(ph.end) - startT) / WEEK);
    const wT = (ph.weightMin + ph.weightMax) / 2;
    const issues: string[] = [];
    let verdict: Verdict = 'ok';
    let to: Comp;
    if (ph.type === 'cut') {
      const lean = cur.lean + (p.experience === 'beginner' ? 0.03 * weeks : 0);
      const w = ph.targetBf != null ? lean / (1 - ph.targetBf / 100) : wT;
      to = fromLean(lean, w);
      const tBf = ph.targetBf;
      const off = tBf != null ? Math.abs(w - wT) : 0;
      if (tBf != null && off >= 1)
        issues.push(
          w < wT
            ? `Al ${pct(tBf)} peserai circa ${itKg(w)} kg, non ${itKg(wT)}: per pesare ${itKg(wT)} kg così asciutto servirebbero ${itKg(wT * (1 - tBf / 100) - lean)} kg di muscolo in più, e in definizione il muscolo si mantiene, non cresce.`
            : `Al ${pct(tBf)} peserai circa ${itKg(w)} kg, più dei ${itKg(wT)} indicati: a ${itKg(wT)} kg perderesti muscolo.`,
        );
      if (off >= 2) verdict = 'no';
      else if (off >= 1) verdict = 'tight';
      if (to.bf < minBf(p)) {
        issues.push(`Il ${pct(to.bf)} di grasso è sotto il minimo sano che proponiamo (${minBf(p)}%).`);
        verdict = 'no';
      }
      const loss = cur.weight - to.weight;
      const need = loss > 0 ? cutWeeks(p, cur, to.weight) : 0;
      if (need > weeks + 0.5) {
        issues.push(`Per perdere ${itKg(loss)} kg senza perdere muscolo servono almeno ${Math.ceil(need)} settimane, non ${Math.round(weeks)}.`);
        verdict = 'no';
      } else if (need > weeks * 0.85 && verdict === 'ok') verdict = 'tight';
    } else if (ph.type === 'bulk' || ph.type === 'strength') {
      const gain = wT - cur.weight;
      const maxGain = cur.weight * BULK_MAX * weeks;
      if (gain > maxGain + 0.3) {
        issues.push(`${itKg(gain)} kg in ${Math.round(weeks)} settimane sono troppi: al massimo circa ${itKg(maxGain)} kg senza mettere soprattutto grasso.`);
        verdict = 'no';
      } else if (gain > cur.weight * BULK_OK * weeks * 1.3) verdict = 'tight';
      const leanGain = Math.max(0, Math.min(leanAfter(p, cur.lean, weeks) - cur.lean, gain * 0.75));
      to = fromLean(cur.lean + leanGain, Math.max(wT, cur.lean + leanGain + 1));
      if (ph.targetBf != null && to.bf > ph.targetBf + 0.5) {
        const needLean = wT * (1 - ph.targetBf / 100) - cur.lean;
        issues.push(
          `A ${itKg(wT)} kg al ${pct(ph.targetBf)} servirebbero +${itKg(needLean)} kg di massa magra; in ${Math.round(weeks)} settimane puoi metterne circa ${itKg(leanGain)}: arriveresti al ${pct(to.bf)}.`,
        );
        verdict = to.bf > ph.targetBf + 2 ? 'no' : verdict === 'ok' ? 'tight' : verdict;
      }
    } else {
      // mantenimento / ricomposizione: peso stabile, un po' di muscolo al posto del grasso
      const leanGain = leanGainPerWeek(p, cur.lean) * weeks * 0.35;
      to = fromLean(Math.min(cur.lean + leanGain, wT - 1), wT);
      if (ph.targetBf != null && to.bf > ph.targetBf + 1) {
        issues.push(`Restando a ${itKg(wT)} kg arriveresti circa al ${pct(to.bf)}, non al ${pct(ph.targetBf)}: per scendere serve una fase di definizione.`);
        verdict = 'no';
      }
    }
    out.push({ index: i, phase: ph, weeks, from: cur, to, verdict, issues });
    cur = to;
  }
  return out;
}

export const planVerdict = (checks: PhaseCheck[]): Verdict => (checks.some((c) => c.verdict === 'no') ? 'no' : checks.some((c) => c.verdict === 'tight') ? 'tight' : 'ok');

/* ---------- Alternative realistiche ---------- */

export interface Alternative {
  id: string;
  title: string;
  /** cosa ottieni, in una riga */
  result: string;
  detail: string;
  phases: { type: Goal; label: string; weeks: number; weight: number; bf: number }[];
  end: string;
}

/** Massa poi definizione: con b settimane di massa, come finisci (o null se non c'è tempo per la definizione). */
function bulkThenCut(p: UserProfile, now: Comp, b: number, totalWeeks: number, finalBf: number) {
  const peak = leanBulk(p, now, b);
  const lean = peak.lean + (p.experience === 'beginner' ? 0.03 * (totalWeeks - b) : 0);
  const end = fromLean(lean, lean / (1 - finalBf / 100));
  const need = peak.weight > end.weight ? cutWeeks(p, peak, end.weight) : 0;
  // margine del 15% sul tempo di definizione: un piano proposto dal coach non deve essere già al limite
  return need <= (totalWeeks - b) * 0.85 ? { peak, end, cutWeeks: totalWeeks - b, need } : null;
}

/**
 * Alternative coerenti con la data finale del piano (es. tra un anno):
 * 1) tieni la % di grasso e scopri il peso realistico; 2) tieni il peso e scopri la % realistica;
 * 3) tieni tutti e due e scopri quanto tempo serve davvero.
 */
export function alternatives(p: UserProfile, now: Comp, phases: GoalPhase[], current: number, today = Date.now()): Alternative[] {
  const rest = phases.slice(current);
  if (!rest.length) return [];
  const last = rest[rest.length - 1];
  const endT = ts(last.end);
  const T = Math.max(1, Math.round((endT - today) / WEEK));
  const endIso = last.end;
  const wF = (last.weightMin + last.weightMax) / 2;
  const hasBulk = rest.some((x) => x.type === 'bulk' || x.type === 'strength');
  const hasCut = rest.some((x) => x.type === 'cut');
  const out: Alternative[] = [];
  const bfF = last.targetBf ?? (hasCut ? Math.max(minBf(p), now.bf - 5) : now.bf);

  if (hasBulk && hasCut) {
    // 1) massa il più lunga possibile lasciando il tempo per arrivare al grasso obiettivo
    let best: ReturnType<typeof bulkThenCut> & { b: number } | null = null;
    for (let b = 0; b <= T; b++) {
      const r = bulkThenCut(p, now, b, T, bfF);
      if (r) best = { ...r, b };
    }
    if (best) {
      out.push({
        id: 'bf',
        title: `Priorità definizione: ${pct(bfF)} entro il ${fmtDate(endIso)}`,
        result: `${itKg(best.end.weight)} kg al ${pct(bfF)}, +${itKg(best.end.lean - now.lean)} kg di muscolo rispetto a oggi`,
        detail: `Massa per ${best.b} settimane fino a circa ${itKg(best.peak.weight)} kg, poi definizione per ${best.cutWeeks} settimane.`,
        phases: [
          { type: 'bulk', label: 'Massa', weeks: best.b, weight: r1(best.peak.weight), bf: r1(best.peak.bf) },
          { type: 'cut', label: 'Definizione', weeks: best.cutWeeks, weight: r1(best.end.weight), bf: bfF },
        ],
        end: endIso,
      });
      // 2) stesso piano, ma la definizione si ferma al peso obiettivo
      if (wF > best.end.weight + 0.5) {
        const endW = fromLean(best.end.lean, wF);
        out.push({
          id: 'weight',
          title: `Priorità peso: ${itKg(wF)} kg entro il ${fmtDate(endIso)}`,
          result: `${itKg(wF)} kg al ${pct(endW.bf)} circa, +${itKg(endW.lean - now.lean)} kg di muscolo rispetto a oggi`,
          detail: `Massa per ${best.b} settimane fino a circa ${itKg(best.peak.weight)} kg, poi definizione fino a ${itKg(wF)} kg.`,
          phases: [
            { type: 'bulk', label: 'Massa', weeks: best.b, weight: r1(best.peak.weight), bf: r1(best.peak.bf) },
            { type: 'cut', label: 'Definizione', weeks: best.cutWeeks, weight: r1(wF), bf: r1(endW.bf) },
          ],
          end: endIso,
        });
      }
    }
    // 3) tutti e due: quanta massa e quanto tempo servono davvero
    const needLean = wF * (1 - bfF / 100);
    if (needLean > now.lean + 0.3) {
      let found: (ReturnType<typeof bulkThenCut> & { b: number; total: number }) | null = null;
      for (let total = T; total <= 260 && !found; total += 2) {
        for (let b = 0; b <= total; b++) {
          const r = bulkThenCut(p, now, b, total, bfF);
          if (r && r.end.lean >= needLean - 0.2) {
            found = { ...r, b, total };
            break;
          }
        }
      }
      if (found && found.total > T) {
        const end = iso(today + found.total * WEEK);
        out.push({
          id: 'both',
          title: `Tutti e due: ${itKg(wF)} kg al ${pct(bfF)}`,
          result: `Realistico entro il ${fmtDate(end)} (${Math.round((found.total - T) / 4.3)} mesi in più)`,
          detail: `Massa per ${found.b} settimane fino a circa ${itKg(found.peak.weight)} kg (+${itKg(found.peak.lean - now.lean)} kg di muscolo), poi definizione per ${found.cutWeeks} settimane.`,
          phases: [
            { type: 'bulk', label: 'Massa', weeks: found.b, weight: r1(found.peak.weight), bf: r1(found.peak.bf) },
            { type: 'cut', label: 'Definizione', weeks: found.cutWeeks, weight: r1(wF), bf: bfF },
          ],
          end,
        });
      } else if (!found)
        out.push({
          id: 'both',
          title: `Tutti e due: ${itKg(wF)} kg al ${pct(bfF)}`,
          result: 'Non realistico in modo naturale',
          detail: `Servirebbero ${itKg(needLean)} kg di massa magra: oltre quello che si raggiunge in 5 anni di allenamento naturale partendo da oggi.`,
          phases: [],
          end: endIso,
        });
    }
  } else if (hasBulk) {
    // solo massa: peso realistico al grasso indicato, o grasso realistico al peso indicato
    const maxLean = leanAfter(p, now.lean, T) - now.lean;
    const leanGain = (w: number) => Math.min(maxLean, (w - now.weight) * 0.75);
    const wMax = Math.min(wF, now.weight * (1 + BULK_MAX * T));
    const atW = fromLean(now.lean + Math.max(0, leanGain(wMax)), wMax);
    out.push({
      id: 'weight',
      title: `${itKg(wMax)} kg entro il ${fmtDate(endIso)}`,
      result: `Circa al ${pct(atW.bf)} di grasso, +${itKg(atW.lean - now.lean)} kg di muscolo`,
      detail: 'Il muscolo che puoi mettere in questo tempo è limitato: il resto del peso sarà grasso.',
      phases: [{ type: 'bulk', label: 'Massa', weeks: T, weight: r1(wMax), bf: r1(atW.bf) }],
      end: endIso,
    });
    if (last.targetBf != null && last.targetBf < now.bf - 1) {
      // vuoi più muscolo ma anche meno grasso di adesso: prima definizione, poi massa pulita
      const end = fromLean(now.lean, now.lean / (1 - last.targetBf / 100));
      const c = cutWeeks(p, now, end.weight);
      if (c < T) {
        const fin = leanBulk(p, end, T - c);
        out.push({
          id: 'cutfirst',
          title: `Prima definizione, poi massa pulita`,
          result: `${itKg(fin.weight)} kg al ${pct(fin.bf)}, +${itKg(fin.lean - now.lean)} kg di muscolo`,
          detail: `Definizione per ${c} settimane fino a circa ${itKg(end.weight)} kg al ${pct(last.targetBf)}, poi massa lenta per ${T - c} settimane.`,
          phases: [
            { type: 'cut', label: 'Definizione', weeks: c, weight: r1(end.weight), bf: last.targetBf },
            { type: 'bulk', label: 'Massa pulita', weeks: T - c, weight: r1(fin.weight), bf: r1(fin.bf) },
          ],
          end: endIso,
        });
      }
    } else if (last.targetBf != null) {
      // il peso più alto che resta entro il grasso indicato
      let w = now.weight;
      for (let x = now.weight; x <= wMax + 0.01; x += 0.1) if (fromLean(now.lean + Math.max(0, leanGain(x)), x).bf <= last.targetBf + 0.3) w = x;
      const c = fromLean(now.lean + Math.max(0, leanGain(w)), w);
      out.push({
        id: 'bf',
        title: `Massa pulita: resta sotto il ${pct(last.targetBf)}`,
        result: `${itKg(w)} kg al ${pct(c.bf)}, +${itKg(c.lean - now.lean)} kg di muscolo`,
        detail: `Sali più piano (circa ${((w - now.weight) / T).toFixed(2).replace('.', ',')} kg a settimana): quasi tutto quello che prendi è muscolo.`,
        phases: [{ type: 'bulk', label: 'Massa pulita', weeks: T, weight: r1(w), bf: r1(c.bf) }],
        end: endIso,
      });
    }
  } else if (hasCut) {
    const end = fromLean(now.lean, now.lean / (1 - bfF / 100));
    const need = cutWeeks(p, now, end.weight);
    out.push({
      id: 'bf',
      title: `Definizione al ${pct(bfF)}`,
      result: `${itKg(end.weight)} kg al ${pct(bfF)}, mantenendo il muscolo`,
      detail: need > T ? `Servono circa ${need} settimane (entro il ${fmtDate(iso(today + need * WEEK))}).` : `Ci stai nei tempi: servono circa ${need} settimane.`,
      phases: [{ type: 'cut', label: 'Definizione', weeks: Math.max(need, T), weight: r1(end.weight), bf: bfF }],
      end: need > T ? iso(today + need * WEEK) : endIso,
    });
  }
  return out;
}

/** Piano nuovo da un'alternativa (le fasi già fatte restano). */
export function applyAlternative(phases: GoalPhase[], current: number, alt: Alternative, nowWeight: number, today = Date.now()): GoalPhase[] {
  const kept = phases.slice(0, current);
  let start = iso(today);
  let from = nowWeight;
  const list = alt.phases.filter((x) => x.weeks > 0);
  const next: GoalPhase[] = list
    .map((x, i) => {
      // l'ultima fase finisce esattamente alla data dell'alternativa
      const end = i === list.length - 1 ? alt.end : iso(ts(start) + x.weeks * WEEK);
      // a fine massa la % di grasso si arrotonda per eccesso (17,4 → 18), in definizione al valore più vicino
      const ph: GoalPhase = { type: x.type, label: x.label, start, end, startWeight: r1(from), weightMin: r1(x.weight - 0.5), weightMax: r1(x.weight + 0.5), targetBf: x.type === 'cut' ? Math.round(x.bf) : Math.ceil(x.bf) };
      start = end;
      from = x.weight;
      return ph;
    });
  return [...kept, ...next];
}

/** Testo per il coach (chat, check-in): cosa è realistico, così non promette risultati impossibili. */
export function feasibilityText(p: UserProfile, checks: PhaseCheck[]): string {
  const v = planVerdict(checks);
  const rate = leanGainPerWeek(p, checks[0]?.from.lean ?? 60).toFixed(2).replace('.', ',');
  const head = `REALISMO DEL PIANO (calcolato dall'app, livello ${LEVEL_IT[p.experience]}, ~${rate} kg di massa magra a settimana al massimo): ${v === 'ok' ? 'realistico' : v === 'tight' ? 'fattibile ma stretto' : 'NON realistico così com\'è'}`;
  const issues = checks.flatMap((c) => c.issues.map((i) => `${c.phase.label}: ${i}`));
  return `${head}.${issues.length ? ` Problemi: ${issues.join(' ')}` : ''} Non promettere risultati oltre questi numeri.`;
}

export const levelLabel = (p: UserProfile) => LEVEL_IT[p.experience];

/**
 * Proposta per il check-in: se con i dati di oggi il piano non è più realistico, la versione aggiornata più vicina
 * a quello che volevi (tiene la % di grasso finale se l'avevi indicata, altrimenti il peso), con le stesse date finali.
 */
export function goalProposal(p: UserProfile, now: Comp, plan: GoalPlan, today = Date.now()): { id: string; title: string; detail: string; phases: GoalPhase[]; summary: string } | null {
  const checks = checkPlan(p, now, plan.phases, plan.current, today);
  if (planVerdict(checks) === 'ok') return null;
  const alts = alternatives(p, now, plan.phases, plan.current, today).filter((a) => a.phases.length);
  const last = plan.phases[plan.phases.length - 1];
  const pick = alts.find((a) => a.id === (last?.targetBf != null ? 'bf' : 'weight')) ?? alts[0];
  if (!pick) return null;
  const why = checks.flatMap((c) => c.issues)[0];
  return {
    id: `goal-${pick.id}-${pick.end}`,
    title: `Obiettivo aggiornato: ${pick.result}`,
    detail: `${why ? `${why} ` : ''}Proposta: ${pick.title.charAt(0).toLowerCase()}${pick.title.slice(1)}. ${pick.detail}`,
    phases: applyAlternative(plan.phases, plan.current, pick, now.weight, today),
    summary: `${pick.title}: ${pick.result}. ${pick.detail}`,
  };
}
