const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const ICON_SPRITE_PATH = 'icons/ui-sprite.svg';

export type UiIconName =
  | 'alert'
  | 'bug'
  | 'cap'
  | 'check'
  | 'chevron-down'
  | 'chevron-up'
  | 'download'
  | 'edit'
  | 'globe'
  | 'heart'
  | 'info'
  | 'layers'
  | 'plus'
  | 'settings'
  | 'shield'
  | 'sparkles'
  | 'target'
  | 'trash'
  | 'upload'
  | 'wallet'
  | 'wrench'
  | 'x-mark';

export function getIconHref(name: UiIconName): string {
  return `${ICON_SPRITE_PATH}#${name}`;
}

export function createIcon(name: UiIconName, className = 'ui-icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const use = document.createElementNS(SVG_NS, 'use');
  const href = getIconHref(name);

  use.setAttribute('href', href);
  use.setAttributeNS(XLINK_NS, 'xlink:href', href);

  svg.appendChild(use);
  return svg;
}

export function replaceWithIcon(
  target: Element,
  name: UiIconName,
  className = 'ui-icon'
): SVGSVGElement {
  const icon = createIcon(name, className);
  target.replaceChildren(icon);
  return icon;
}
