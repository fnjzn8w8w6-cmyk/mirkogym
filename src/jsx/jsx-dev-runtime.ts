import { Fragment, jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime';
import { transformProps } from './transform';

export { Fragment };
export type { JSX } from 'react/jsx-dev-runtime';

export function jsxDEV(type: unknown, props: Record<string, unknown>, key: unknown, isStatic: boolean, source: unknown, self: unknown) {
  return reactJsxDEV(type as never, transformProps(type, props) as never, key as never, isStatic, source as never, self);
}
