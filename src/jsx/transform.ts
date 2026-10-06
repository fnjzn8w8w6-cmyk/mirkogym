import type { ReactNode } from 'react';
import { EMOJI_RE } from './emoji-icons';
import { replaceEmoji } from './render';

/** Elementi i cui figli devono restare testo puro (o SVG). */
const SKIP = new Set(['option', 'title', 'textarea', 'style', 'script', 'text', 'tspan', 'textPath', 'svg', 'g', 'desc']);
const ON_ACCENT = /\bbg-accent-(400|500|600)(?![\/\w-])/;
const BIG = /\btext-(2xl|3xl|4xl|5xl|6xl|\[[3-9]\dpx\])/;

function hasEmoji(s: string) {
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(s);
}

export function transformProps(type: unknown, props: Record<string, unknown>) {
  if (typeof type !== 'string' || SKIP.has(type) || !props || props.children == null) return props;
  const ch = props.children;
  if (typeof ch === 'string') {
    if (!hasEmoji(ch)) return props;
    // emoji da sola in un elemento con testo grande → icona dentro il riquadro
    const alone = ch.replace(EMOJI_RE, '').trim() === '';
    const badge = alone && typeof props.className === 'string' && BIG.test(props.className);
    // su sfondo verde pieno l'icona diventa scura, altrimenti sparisce
    const onAccent = typeof props.className === 'string' && ON_ACCENT.test(props.className);
    return { ...props, children: replaceEmoji(ch, badge && !onAccent, onAccent) };
  }
  if (Array.isArray(ch) && ch.some((c) => typeof c === 'string' && hasEmoji(c))) {
    return { ...props, children: ch.map((c) => (typeof c === 'string' ? (replaceEmoji(c) as ReactNode) : c)) };
  }
  return props;
}
