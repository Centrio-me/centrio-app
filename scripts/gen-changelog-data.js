// One-off script: parses CHANGELOG.md and generates a TS data module for the
// website's changelog widget (pricing page). Not part of the build pipeline.
const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const lines = raw.split(/\r?\n/);
const versions = [];
let current = null;

for (const line of lines) {
  const h = line.match(/^## \[([^\]]+)\]/);
  if (h) {
    if (h[1].toLowerCase() === 'unreleased') {
      current = null;
      continue;
    }
    current = { version: h[1], notes: [] };
    versions.push(current);
    continue;
  }
  if (!current) continue;
  const b = line.match(/^- (.+)/);
  if (b) current.notes.push(b[1]);
}

const clean = versions.filter((v) => v.notes.length > 0);

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

let out = `// Автосгенерировано из CHANGELOG.md локального репозитория приложения
// (C:\\MessengerApps\\CHANGELOG.md) - источник истины для истории версий.
// При выходе новой версии: добавь запись в CHANGELOG.md И сюда (в начало массива).
export interface ChangelogEntry {
  version: string
  notes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
`;

for (const v of clean) {
  out += `  {\n    version: '${v.version}',\n    notes: [\n`;
  for (const n of v.notes) {
    out += `      \`${esc(n)}\`,\n`;
  }
  out += `    ]\n  },\n`;
}
out += `]\n`;

const outPath = path.join(__dirname, '..', 'dist-changelog-data.ts');
fs.writeFileSync(outPath, out);
console.log('versions:', clean.length);
console.log('total notes:', clean.reduce((a, v) => a + v.notes.length, 0));
console.log('written to:', outPath);
