# Typesense skills

Each skill lives in `skills/<name>/`: a `SKILL.md` router plus a `references/` folder it points at. References stay one level deep, and every file in `references/` has a row in the `SKILL.md` table.

A skill's reader is a coding agent. Cover only what it gets wrong without the skill: v30 renames, undocumented behaviour, gotchas the docs leave out. Point at the versioned docs for exact parameters instead of copying them.

When a skill's `description` changes, update its entry in `.claude-plugin/marketplace.json` and the project pointer line in `README.md` to match.

Commits follow Conventional Commits with the skill as scope, e.g. `fix(typesense): ...`.
