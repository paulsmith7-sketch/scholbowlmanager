// Builds dist/scholastic-bowl.html: the whole app in one file that opens
// straight from a USB stick or the desktop (file://), no web server needed.
//
// The app's ES modules are inlined in dependency order, each wrapped in its
// own function scope. This handles the import/export forms the codebase
// uses: `import { a, b as c } from './x.js'`, `export function`,
// `export const`, and `export class`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'src/main.js');

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"](.+?)['"];?\s*$/gm;
const EXPORT_DECL_RE = /^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const modules = new Map(); // path -> { id, code }
const order = [];

function load(file, stack = []) {
  if (modules.has(file)) return modules.get(file);
  if (stack.includes(file)) throw new Error(`Import cycle: ${[...stack, file].map((f) => relative(root, f)).join(' -> ')}`);
  const source = readFileSync(file, 'utf8');
  const id = `__m${modules.size}`;
  const mod = { id, file };
  modules.set(file, mod);

  const imports = [];
  let code = source.replace(IMPORT_RE, (_, names, spec) => {
    const dep = load(resolve(dirname(file), spec), [...stack, file]);
    const bindings = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => n.replace(/\s+as\s+/, ': '));
    imports.push(`const { ${bindings.join(', ')} } = ${dep.id};`);
    return '';
  });
  if (/^\s*import\s/m.test(code)) throw new Error(`Unsupported import form in ${relative(root, file)}`);

  const exported = [];
  code = code.replace(EXPORT_DECL_RE, (_, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  if (/^\s*export\s/m.test(code)) throw new Error(`Unsupported export form in ${relative(root, file)}`);

  mod.code = `// ${relative(root, file)}\nconst ${id} = (() => {\n${imports.join('\n')}\n${code}\nreturn { ${exported.join(', ')} };\n})();\n`;
  order.push(mod);
  return mod;
}

load(entry);

const bundle = order.map((m) => m.code).join('\n');
const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
const icon = readFileSync(resolve(root, 'icon.svg'), 'utf8');
const iconUri = `data:image/svg+xml,${encodeURIComponent(icon)}`;
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;

let html = readFileSync(resolve(root, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${iconUri}" type="image/svg+xml">`)
  .replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () =>
    `<script>\n// Scholastic Bowl Tournament Manager ${version} (single-file build)\n(() => {\n${bundle.replace(/<\/script/gi, '<\\/script')}\n})();\n</script>`);
// The header logo points at icon.svg; inline it for the single file.
html = html.replace('</head>', `<script>window.__SBTM_ICON__ = ${JSON.stringify(iconUri)};</script>\n</head>`);

mkdirSync(resolve(root, 'dist'), { recursive: true });
const out = resolve(root, 'dist/scholastic-bowl.html');
writeFileSync(out, html);
console.log(`Wrote ${relative(root, out)} (${(html.length / 1024).toFixed(0)} KB, ${order.length} modules)`);
