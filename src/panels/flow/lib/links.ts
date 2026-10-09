import type { FlowNode, LinkOptions } from '../types';

/** Node tokens understood by the link template. Values are URL-encoded. */
const TOKEN = /\$\{node\.(id|label|group|value|status)\}/g;

/**
 * Fill `${node.*}` tokens (URL-encoded) and then dashboard variables. Tokens go first so the interpolator
 * never sees them (they look like variables) and encoded values can not inject variables.
 */
export function fillLinkTemplate(
  template: string,
  node: FlowNode,
  value: string | undefined,
  replaceVariables: (s: string) => string,
  encode = true
): string {
  const filled = template.replace(TOKEN, (_, key: string) => {
    const v = key === 'id' ? node.id : key === 'label' ? node.label : key === 'group' ? (node.group ?? '') : key === 'status' ? (node.status ?? '') : (value ?? '');
    return encode ? encodeURIComponent(v) : v;
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

export interface VariableAction {
  name: string;
  value: string;
}

/** Dashboard variable name from the options: trimmed, without a leading `$`, empty when unusable. */
export function variableName(links: LinkOptions | undefined): string {
  return (links?.variable ?? '').trim().replace(/^\$/, '').replace(/[^\w-]/g, '');
}

/**
 * The variable a node click should set (action `variable` only). The value template takes the same `${node.*}`
 * tokens as the link template, without URL encoding, and may reference other dashboard variables.
 */
export function resolveNodeVariable(
  node: FlowNode,
  links: LinkOptions | undefined,
  value: string | undefined,
  replaceVariables: (s: string) => string
): VariableAction | undefined {
  if (!links || links.action !== 'variable' || links.trigger === 'off') {
    return undefined;
  }
  const name = variableName(links);
  if (!name) {
    return undefined;
  }
  const template = (links.variableValue ?? '').trim() || '${node.id}';
  return { name, value: fillLinkTemplate(template, node, value, replaceVariables, false) };
}

/** URL query update that sets a dashboard variable. */
export function variableQuery(name: string, value: string): Record<string, string> {
  return { [`var-${name}`]: value };
}

/** Current value of a dashboard variable through the panel's interpolator; undefined when unset or unknown. */
export function currentVariable(name: string, replaceVariables: (s: string) => string): string | undefined {
  if (!name) {
    return undefined;
  }
  const probe = '${' + name + '}';
  const v = replaceVariables(probe);
  return !v || v === probe || v === `$${name}` ? undefined : v;
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
