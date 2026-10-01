/**
 * Rewrites relative imports under src/ to path aliases:
 * - repositories → @database/repository/<file>
 * - everything else → @/<path-from-src>
 *
 * Also updates jest.mock / jest.requireActual / dynamic import / require.
 */
const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.resolve(__dirname, '../src');
const REPO_DIR = path.join(SRC_ROOT, 'database', 'repository');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && /\.(ts|tsx|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function stripExt(p) {
  return p.replace(/\.(ts|tsx|js|jsx)$/, '');
}

function toAlias(absoluteWithoutExt) {
  const normalized = path.normalize(absoluteWithoutExt);
  if (normalized.startsWith(REPO_DIR + path.sep) || normalized === REPO_DIR) {
    const base = path.basename(normalized);
    return `@database/repository/${base}`;
  }
  const rel = path.relative(SRC_ROOT, normalized).split(path.sep).join('/');
  if (rel.startsWith('..')) {
    throw new Error(`Import escapes src/: ${normalized}`);
  }
  return `@/${rel}`;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const baseName = path.basename(specifier).replace(/\.(ts|tsx|js|jsx)$/, '');
  // Repositories were centralized; any relative *.repository import maps there.
  if (baseName.endsWith('.repository')) {
    return `@database/repository/${baseName}`;
  }

  const fromDir = path.dirname(fromFile);
  let resolved = path.resolve(fromDir, specifier);

  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    path.join(resolved, 'index.ts'),
    path.join(resolved, 'index.js'),
  ];

  let hit = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!hit) {
    hit = resolved;
  }
  return toAlias(stripExt(hit));
}

function rewriteContent(filePath, content) {
  let changed = false;

  const replaceSpec = (spec) => {
    const next = resolveImport(filePath, spec);
    if (!next) {
      return spec;
    }
    changed = true;
    return next;
  };

  // from '...', import('...'), require('...'), jest.mock('...'), jest.requireActual('...')
  const patterns = [
    /(\bfrom\s+)(['"])(\.[^'"]+)\2/g,
    /(\bimport\s*\(\s*)(['"])(\.[^'"]+)\2(\s*\))/g,
    /(\brequire\s*\(\s*)(['"])(\.[^'"]+)\2(\s*\))/g,
    /(\bjest\.(?:mock|requireActual|unmock|doMock|dontMock)\s*\(\s*)(['"])(\.[^'"]+)\2/g,
    /(\bexport\s+(?:\*|{[^}]*})\s+from\s+)(['"])(\.[^'"]+)\2/g,
  ];

  let next = content;
  for (const re of patterns) {
    next = next.replace(re, (...args) => {
      const match = args[0];
      const prefix = args[1];
      const quote = args[2];
      const spec = args[3];
      // Only use a capture group as suffix when the pattern defined one
      // (args.length includes match, groups, offset, input — never treat offset as suffix).
      const groupCount = args.length - 3; // exclude match, offset, input
      const suffix = groupCount >= 4 ? args[4] : '';
      const aliased = replaceSpec(spec);
      if (aliased === spec) {
        return match;
      }
      return `${prefix}${quote}${aliased}${quote}${suffix}`;
    });
  }

  return { content: next, changed };
}

const files = walk(SRC_ROOT);
let updated = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const { content, changed } = rewriteContent(file, original);
  if (changed) {
    fs.writeFileSync(file, content);
    updated += 1;
    console.log('updated', path.relative(process.cwd(), file));
  }
}

// Also rewrite e2e / scripts that import from src with relatives when applicable
const extras = [
  path.resolve(__dirname, '../test/app.e2e-spec.ts'),
  path.resolve(__dirname, '../scripts/patch-database-generated-enums.ts'),
];

for (const file of extras) {
  if (!fs.existsSync(file)) continue;
  const original = fs.readFileSync(file, 'utf8');
  // For scripts outside src, only rewrite if they use relative paths into src
  let content = original;
  let changed = false;

  content = content.replace(
    /(from\s+)(['"])(\.\.\/(?:\.\/)*src\/[^'"]+|\.\/\.\.\/src\/[^'"]+)\2/g,
    (match, prefix, quote, spec) => {
      const abs = path.resolve(path.dirname(file), spec);
      const aliased = toAlias(stripExt(abs));
      changed = true;
      return `${prefix}${quote}${aliased}${quote}`;
    },
  );

  if (changed) {
    fs.writeFileSync(file, content);
    updated += 1;
    console.log('updated', path.relative(process.cwd(), file));
  }
}

console.log(`Done. Updated ${updated} files.`);
