# Contributing

Keep skills small. They cover what a coding agent gets wrong without them, and point at the Typesense docs for everything else instead of keeping another copy.

For changes to a skill or its references:

- Check the guidance against the [versioned Typesense docs](https://typesense.org/docs/) or a running Typesense server. A working URL alone is not enough.
- Link to the relevant docs page instead of copying parameters, limits or examples that will go stale.
- When fixing outdated content, replace it with a short pointer to the current docs where you can.
- If the docs don't cover what the skill needs, describe the gap in the pull request instead of adding guidance nothing backs up.
- After editing a skill, run its validation cases, such as `skills/typesense/tests/validation.md`.

Before committing, run:

```sh
node scripts/check.mjs
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), with the skill as scope, for example `fix(typesense): ...`. See `AGENTS.md` for the repo layout and the files that must stay in sync.
