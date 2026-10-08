import type { FlowNode, LinkOptions } from '../types';

/** Node tokens understood by the link template. Values are URL-encoded. */
const TOKEN = /\$\{node\.(id|label|group|value|status)\}/g;

/**
 * Fill `${node.*}` tokens (URL-encoded) and then dashboard variables. Tokens go first so the interpolator
 * never sees them (they look like variables) and encoded values can not inject variables.
 */
export function fillLinkTemplate(template: string, node: FlowNode, value: string | undefined, replaceVariables: (s: string) => string): string {
  const filled = template.replace(TOKEN, (_, key: string) => {
    const v = key === 'id' ? node.id : key === 'label' ? node.label : key === 'group' ? (node.group ?? '') : key === 'status' ? (node.status ?? '') : (value ?? '');
    return encodeURIComponent(v);
  });
  return replaceVariables(filled);
}

/** Only http(s) URLs and same-app relative paths are opened. */
export function safeHref(href: string | undefined): string | undefined {
  const h = (href ?? '').trim();
  if (!h) {
    return undefined;
  }
  if (/^(https?:)?\/\//i.test(h) || /^[/?#]/.test(h)) {
    return h;
  }
  return undefined;
}

/**
 * Link for a node. Manual diagrams: the node's own link beats the template. Data diagrams: the template
 * beats the data link that came with the node frame.
 */
export function resolveNodeLink(
  node: FlowNode,
  links: LinkOptions | undefined,
  value: string | undefined,
  replaceVariables: (s: string) => string,
  isData: boolean
): string | undefined {
  if (!links || links.trigger === 'off') {
    return undefined;
  }
  const template = (links.nodeUrl ?? '').trim();
  const own = (node.link ?? '').trim();
  const raw = isData ? template || own : own || template;
  if (!raw) {
    return undefined;
  }
  // Data links from the frame are already interpolated by the datasource; templates need filling.
  const href = raw === own && isData ? own : fillLinkTemplate(raw, node, value, replaceVariables);
  return safeHref(href);
}

/** Open a resolved link. Relative paths stay inside the app (history push) in the same tab. */
export function openLink(href: string, target: LinkOptions['target'], push?: (path: string) => void) {
  if (target === 'new') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  if (/^[/?#]/.test(href) && push) {
    push(href);
    return;
  }
  window.location.assign(href);
}
