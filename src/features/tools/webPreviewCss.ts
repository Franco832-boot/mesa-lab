import { WEB_LIMITS } from './webPreviewProtocol';

const properties = new Set(('color background background-color background-image border border-color border-width border-style border-radius outline outline-color outline-width outline-style outline-offset box-shadow text-shadow opacity display visibility position inset top right bottom left z-index width min-width max-width height min-height max-height margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left box-sizing overflow overflow-x overflow-y font font-family font-size font-weight font-style line-height letter-spacing text-align text-decoration text-transform white-space overflow-wrap word-break vertical-align list-style-type gap row-gap column-gap flex flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-content align-self justify-content grid-template-columns grid-template-rows grid-column grid-row place-items cursor appearance accent-color object-fit transform transform-origin transition-property transition-duration transition-timing-function').split(' '));

export interface CssBudget { rules: number; declarations: number }
export function previewDeclarations(source: string, budget: CssBudget = { rules: 0, declarations: 0 }): string {
  if (source.length > WEB_LIMITS.css) throw new Error('413');
  const style = document.createElement('span').style;
  style.cssText = source;
  if ((budget.declarations += style.length) > WEB_LIMITS.declarations) throw new Error('413');
  const output: string[] = [];
  for (let index = 0; index < Math.min(style.length, WEB_LIMITS.declarations); index++) {
    const name = style.item(index), value = style.getPropertyValue(name);
    if (properties.has(name) && value.length <= 1024 && !/[\\<>@]/.test(value)
      && !/url\s*\(|image-set|cross-fade|paint\s*\(|expression|var\s*\(|attr\s*\(/i.test(value)) output.push(`${name}:${value}`);
  }
  return output.join(';');
}
/** Split bounded top-level rules; the browser's detached CSSOM parses each rule. */
function rules(source: string): readonly string[] {
  const result: string[] = [];
  let start = 0, depth = 0, quote = '', comment = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index], next = source[index + 1];
    if (comment) { if (char === '*' && next === '/') { comment = false; index++; } continue; }
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; continue; }
    if (char === '/' && next === '*') { comment = true; index++; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth < 0 || depth > WEB_LIMITS.nesting + 1) throw new Error('413');
    if (depth === 0 && (char === '}' || char === ';')) {
      result.push(source.slice(start, index + 1)); start = index + 1;
      if (result.length > WEB_LIMITS.rules) throw new Error('413');
    }
  }
  if (depth || quote || comment) throw new Error('415');
  return result;
}
export function previewCss(source: string, depth = 0, budget: CssBudget = { rules: 0, declarations: 0 }): string {
  if (source.length > WEB_LIMITS.css || depth > WEB_LIMITS.nesting) throw new Error('413');
  const output: string[] = [];
  for (const text of rules(source)) {
    if (++budget.rules > WEB_LIMITS.rules) throw new Error('413');
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!clean || (clean.startsWith('@') && !/^@media(?:\s|\()/i.test(clean))) continue;
    const sheet = new CSSStyleSheet();
    try { sheet.insertRule(clean, 0); } catch { continue; }
    const rule = sheet.cssRules[0];
    if (!rule) continue;
    const serialized = rule.cssText, open = serialized.indexOf('{'), close = serialized.lastIndexOf('}');
    if (open < 0 || close < open) continue;
    const selector = serialized.slice(0, open).trim();
    if (selector.length > 256 || /[\\<>]/.test(selector)) continue;
    const body = serialized.slice(open + 1, close);
    if (rule.type === 1) output.push(`${selector}{${previewDeclarations(body, budget)}}`);
    else if (rule.type === 4) output.push(`${selector}{${previewCss(body, depth + 1, budget)}}`);
  }
  return output.join('\n');
}
