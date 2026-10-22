// Event-callback harness only; real DSH/React rendering is verified separately in the isolated host.
let active = null;
const hooks = new Map();
function slot(initial) {
  const index = active.cursor++;
  if (!(index in active.values)) active.values[index] = typeof initial === 'function' ? initial() : initial;
  return { index, values: active.values };
}
export function useState(initial) {
  const { index, values } = slot(initial);
  return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
}
export function useRef(initial) { const { index, values } = slot(() => ({ current: initial })); return values[index]; }
export function useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); }
function createElement(type, props, ...children) { return { type, props: { ...props, children } }; }
export default { createElement, Fragment: Symbol.for('review.fragment') };
export function render(component, props = {}) { return expand(createElement(component, props)); }
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') {
    const keys = hooks.get(node.type) ?? new Map(); hooks.set(node.type, keys);
    const key = node.props.key ?? 'root', values = keys.get(key) ?? []; keys.set(key, values);
    const previous = active; active = { cursor: 0, values };
    try { return expand(node.type(node.props)); } finally { active = previous; }
  }
  return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}
