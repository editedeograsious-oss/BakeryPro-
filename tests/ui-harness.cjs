const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const source = path.resolve(__dirname, '../production-fixes');
const money = n => `UGX ${Number(n).toLocaleString('en-US')}`;
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ').replace(/\s+/g, ' ').trim();
  if (typeof node !== 'object') return String(node);
  return text(node.props?.children);
}
function find(node, predicate, found = []) {
  if (Array.isArray(node)) node.forEach(n => find(n, predicate, found));
  else if (node && typeof node === 'object') {
    if (predicate(node)) found.push(node);
    find(node.props?.children, predicate, found);
  }
  return found;
}
const button = (tree, label) => find(tree, n => n.type === 'button' && text(n) === label)[0];
function load(filename, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(source, filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const context = { module, exports: module.exports, console, crypto: globalThis.crypto,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), window: globalThis.window };
  vm.runInNewContext(code, context, { filename });
  return module.exports.default;
}
function harness(filename, props, client, extraMocks = {}) {
  const slots = [];
  let cursor = 0, pending = [], refreshes = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = { ...React,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => slots[i] = typeof value === 'function' ? value(slots[i]) : value];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i], deps)) { slots[i] = deps; pending.push(fn); }
    }
  };
  const component = load(filename, {
    react: hooks, 'next/navigation': { useRouter: () => ({ refresh: () => refreshes++ }) },
    '@/lib/supabase/client': { createClient: () => client }, '@/lib/costing': { ugx: money }, ...extraMocks
  });
  return {
    render(next = props) { props = next; cursor = 0; return component(props); },
    async effects() { const effects = pending; pending = []; effects.forEach(fn => fn()); await new Promise(setImmediate); },
    get refreshes() { return refreshes; }
  };
}

module.exports = { harness, load, text, find, button };
