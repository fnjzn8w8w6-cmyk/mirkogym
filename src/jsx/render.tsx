import { Fragment, createElement, type ReactNode } from 'react';
import { EMOJI_RE, EMOJI_TONE, iconFor } from './emoji-icons';

const TONE: Record<string, string> = {
  warn: '#EAB308',
  danger: '#EF4444',
  info: '#3B82F6',
  muted: '#7D8781',
  gold: '#E8C25A',
  silver: '#C9D1CC',
  bronze: '#D08A5A',
};
const ACCENT = '#3DDC84';

/** Un'icona piena al posto di un'emoji. `badge` = dentro un riquadro verde scuro (icone grandi e isolate). */
function emojiIcon(e: string, key: string, badge: boolean, onAccent: boolean): ReactNode {
  const I = iconFor(e);
  if (!I) return e;
  const color = onAccent ? '#03140A' : TONE[EMOJI_TONE[e] ?? EMOJI_TONE[e.replace(/️/g, '')]] ?? ACCENT;
  const icon = createElement(I, { weight: 'fill', color, size: badge ? '0.62em' : '1.15em', 'aria-hidden': true, style: { display: 'inline-block', verticalAlign: '-0.18em', flexShrink: 0 } });
  if (!badge) return createElement(Fragment, { key }, icon);
  return createElement(
    'span',
    {
      key,
      'aria-hidden': true,
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.5em', height: '1.5em', borderRadius: '0.38em', background: '#11261A', verticalAlign: 'middle' },
    },
    icon,
  );
}

/** Divide un testo in parti e sostituisce le emoji con le icone. Restituisce il testo originale se non ne contiene. */
export function replaceEmoji(text: string, badge = false, onAccent = false): ReactNode {
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return text;
  EMOJI_RE.lastIndex = 0;
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(emojiIcon(m[0], `e${i++}`, badge, onAccent));
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  // spazio doppio dopo un'icona iniziale: lo riduco (le emoji avevano già il loro spazio)
  return out;
}
