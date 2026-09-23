// Checks the rules in AGENTS.md that keep skills and plugin manifests in sync.
// Run from the repo root: node scripts/check.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const errors = [];
const fail = (msg) => errors.push(msg);
const read = (path) => readFileSync(path, "utf8");

function readJson(path) {
  try {
    return JSON.parse(read(path));
  } catch (err) {
    fail(`${path}: invalid JSON (${err.message})`);
    return null;
  }
}

function frontmatter(path) {
  const match = read(path).match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`${path}: missing frontmatter`);
    return {};
  }
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^(\w+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  );
}

// Skills: frontmatter, and a table row for every reference.
const skills = readdirSync("skills", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const name of skills) {
  const dir = join("skills", name);
  const skillPath = join(dir, "SKILL.md");
  if (!existsSync(skillPath)) {
    fail(`${dir}: missing SKILL.md`);
    continue;
  }
  const meta = frontmatter(skillPath);
  if (meta.name !== name) fail(`${skillPath}: name "${meta.name}" does not match directory "${name}"`);
  if (!meta.description) fail(`${skillPath}: missing description`);

  const body = read(skillPath);
  const linked = new Set([...body.matchAll(/`(references\/[^`]+\.md)`/g)].map((m) => m[1]));
  const refsDir = join(dir, "references");
  const files = existsSync(refsDir) ? readdirSync(refsDir).map((file) => `references/${file}`) : [];
  for (const file of files) {
    if (!linked.has(file)) fail(`${skillPath}: no table row for ${file}`);
  }
  for (const file of linked) {
    if (!existsSync(join(dir, file))) fail(`${skillPath}: points at missing ${file}`);
  }
}

// Plugin manifests: all parse, and name, version and description agree.
const manifests = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "plugin.json",
];
const marketplaces = [".claude-plugin/marketplace.json", ".cursor-plugin/marketplace.json"];
const otherJson = [".agents/plugins/marketplace.json", ".mcp.json", "mcp.json"];

const reference = readJson(manifests[0]);
for (const path of [...manifests.slice(1), ...marketplaces, ...otherJson]) {
  const json = readJson(path);
  if (!json || !reference) continue;
  if (manifests.includes(path)) {
    for (const key of ["name", "version", "description"]) {
      if (json[key] !== reference[key]) fail(`${path}: ${key} differs from ${manifests[0]}`);
    }
  }
  if (marketplaces.includes(path)) {
    const entry = json.plugins?.find((plugin) => plugin.name === reference.name);
    if (!entry) fail(`${path}: no plugin entry named "${reference.name}"`);
    else if (entry.description !== reference.description) fail(`${path}: description differs from ${manifests[0]}`);
  }
}

// README pointer line: names the same things the skill's description triggers on.
const readme = read("README.md");
for (const name of skills) {
  const { description = "" } = frontmatter(join("skills", name, "SKILL.md"));
  const triggers = description.match(/any (.+? that uses Typesense)/)?.[1];
  if (triggers && !readme.includes(triggers)) {
    fail(`README.md: pointer line should mention "${triggers}" to match skills/${name}/SKILL.md`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}
console.log(`✓ ${skills.length} skill(s) and ${manifests.length + marketplaces.length + otherJson.length} JSON files checked`);
