// Runs in the API image after `pnpm install --prod` (isolated node_modules, see apps/api/Dockerfile).
// pnpm links the Prisma CLI (with Studio and its engines) and TypeScript in as optional peers of
// @prisma/client, although the API never loads them. Removes every package reachable only through
// them, about half of node_modules.
import fs from "node:fs";
import path from "node:path";

const SKIPPED = new Set(["prisma", "typescript"]);
const root = path.resolve(process.argv[2] ?? ".");
const store = path.join(root, "node_modules/.pnpm");
const reachable = new Set();

/** Package links in a node_modules folder, including scoped ones. */
function links(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".")) return [];
    if (name.startsWith("@")) return fs.readdirSync(path.join(dir, name)).map((scoped) => `${name}/${scoped}`);
    return [name];
  });
}

function visit(dir) {
  for (const name of links(dir)) {
    const link = path.join(dir, name);
    if (SKIPPED.has(name) || !fs.lstatSync(link).isSymbolicLink()) continue;
    const relative = path.relative(store, fs.realpathSync(link));
    if (relative.startsWith("..")) continue;
    const entry = relative.split(path.sep)[0];
    if (reachable.has(entry)) continue;
    reachable.add(entry);
    visit(path.join(store, entry, "node_modules"));
  }
}

visit(path.join(root, "apps/api/node_modules"));

let removed = 0;
for (const entry of fs.readdirSync(store)) {
  if (entry === "node_modules" || entry.startsWith(".") || reachable.has(entry)) continue;
  fs.rmSync(path.join(store, entry), { recursive: true, force: true });
  removed++;
}

// Hoisted links to removed packages.
const hoisted = path.join(store, "node_modules");
for (const name of links(hoisted)) {
  const link = path.join(hoisted, name);
  if (!fs.existsSync(link)) fs.rmSync(link, { force: true });
}

console.log(`Removed ${removed} packages the API does not load; kept ${reachable.size}.`);
