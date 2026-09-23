# Typesense skills

Agent skills for building with [Typesense](https://typesense.org).

## Install

Install the skill with `npx skills`, which works with any agent that supports Agent Skills:

```sh
npx skills add typesense/skills
```

Or install it as a plugin in Claude Code, Codex, VS Code or Cursor. The plugin adds the Typesense Cloud MCP server alongside the skill.

### Claude Code

```
/plugin marketplace add typesense/skills
/plugin install typesense@typesense-skills
```

### Codex

```sh
codex plugin marketplace add typesense/skills
codex plugin add typesense@typesense-skills
```

Start a new Codex session after installing.

### VS Code / GitHub Copilot

1. Turn on `chat.plugins.enabled` in VS Code settings.
2. Open the Command Palette and run **Chat: Install Plugin From Source**.
3. Enter `https://github.com/typesense/skills`.

See [VS Code's agent plugin docs](https://code.visualstudio.com/docs/agent-customization/agent-plugins) for marketplace installs and troubleshooting.

### Cursor

Install from the Cursor Marketplace, or add it by hand under **Settings > Rules > Add Rule > Remote Rule (Github)** with `typesense/skills`.

### Clone or copy

Clone this repo and copy `skills/typesense` into your agent's skill directory:

| Agent | Skill directory | Docs |
|---|---|---|
| Claude Code | `~/.claude/skills/` | [docs](https://code.claude.com/docs/en/skills) |
| Cursor | `~/.cursor/skills/` | [docs](https://cursor.com/docs/context/skills) |
| OpenCode | `~/.config/opencode/skills/` | [docs](https://opencode.ai/docs/skills/) |
| OpenAI Codex | `~/.codex/skills/` | [docs](https://developers.openai.com/codex/skills/) |
| Pi | `~/.pi/agent/skills/` | [docs](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent#skills) |

### Point the project at the skill

After installing, add this line to the project's `CLAUDE.md` or `AGENTS.md`:

```
This project uses Typesense. Load the typesense skill before writing or changing any code, config, CI workflow or script that uses Typesense.
```

Larger models load the skill from its description alone. Smaller ones, such as Claude Haiku, rarely do unless the project points them at it.

## Skills

| Skill | Useful for |
|---|---|
| typesense | Typesense v30 API rules and recipes: collection schemas, importing and syncing data, search and filters, API keys, relevance tuning, vector search, search UIs, and running a self-hosted or Cloud cluster |

## MCP server

The plugin installs include the Typesense Cloud MCP server. `npx skills` and copying install only the skill, and the skill works without the server.

| Server | Purpose |
|---|---|
| typesense-cloud | Provision, resize and clone Typesense Cloud clusters and mint API keys. It only manages Cloud clusters, not self-hosted servers. |

To use it without the plugin, add `https://cloud.typesense.org/mcp/v1` to your agent as a remote (HTTP) MCP server.
