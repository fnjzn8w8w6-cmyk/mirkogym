/**
 * Runtime JSX dell'app: identico a quello di React, ma le emoji nei testi diventano icone piene
 * (vedi src/jsx/emoji-icons.ts). Vale per tutti i testi resi in elementi HTML, compresi quelli che
 * arrivano da dati o dall'AI.
 */
import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime';
import { transformProps } from './transform';

export { Fragment };
export type { JSX } from 'react/jsx-runtime';

export function jsx(type: unknown, props: Record<string, unknown>, key?: unknown) {
  return reactJsx(type as never, transformProps(type, props) as never, key as never);
}
export function jsxs(type: unknown, props: Record<string, unknown>, key?: unknown) {
  return reactJsxs(type as never, transformProps(type, props) as never, key as never);
}
