# Typesense skills

Agent skills for building with [Typesense](https://typesense.org).

## Install

```sh
npx skills add typesense/skills
```

Then add this line to the project's `CLAUDE.md` or `AGENTS.md`:

```
This project uses Typesense. Load the typesense skill before writing or changing any code, config, CI workflow or script that uses Typesense.
```

Larger models load the skill from its description alone. Smaller ones, such as Claude Haiku, rarely do unless the project points them at it.
