# Typesense skills

Each skill lives in `skills/<name>/`: a `SKILL.md` router plus a `references/` folder it points at. References stay one level deep, and every file in `references/` has a row in the `SKILL.md` table.

A skill's reader is a coding agent. Cover only what it gets wrong without the skill: v30 renames, undocumented behaviour, gotchas the docs leave out. Point at the versioned docs for exact parameters instead of copying them.

A skill may also have `tests/validation.md`: shell cases that check its guidance against a local server. It has no row in the table. Run it after editing the skill, and update it when the guidance it checks changes.

The repo ships as one plugin, `typesense`, to several agents. Its `name`, `version` and `description` must match in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, the root `plugin.json`, and the entries in `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json`. The Typesense Cloud MCP server is configured in both `.mcp.json` and `mcp.json`, so change it in both. Bump `version` in every manifest together when a change should reach installed users.

When a skill's `description` changes, update the project pointer line in `README.md`, the skill's row in the README's Skills table, and the `description` in `rules/typesense.mdc` to match.

Run `node scripts/check.mjs` before committing. CI runs it too.

Commits follow Conventional Commits with the skill as scope, e.g. `fix(typesense): ...`.
