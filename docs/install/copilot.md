# Install: GitHub Copilot

Copilot uses **prompt files** (`.github/prompts/*.prompt.md`) for slash commands, **custom agents** (`.github/agents/*.agent.md`, formerly "chat modes") for sub-agents, and `.github/copilot-instructions.md` as the auto-loaded memory file. Sequential workflows use **handoffs** between agents.

Adapter source: `adapters/copilot/.github/` → `prompts/<name>.prompt.md`, `agents/<name>.agent.md`, `copilot-instructions.md`.

Prompt files and custom agents are available in **VS Code, Visual Studio, and JetBrains IDEs** (not the github.com web chat).

Modern VS Code Copilot supports all three primitives at the **user level**, so the toolkit can be installed once and work in every repo you open. The default install does exactly that.

## Prerequisites

- GitHub Copilot enabled in your IDE (VS Code recommended for global install).
- Node 18+ (to run the installer).
- A recent VS Code — user-level prompt files, `~/.copilot/agents`, and `~/.copilot/instructions` are read automatically.

## Option A — Global (recommended; one command)

From the toolkit folder:

```bash
node scripts/adlc.mjs sync --tool=copilot           # add --dry-run first to preview
```

That installs into your user-level Copilot config, available across **all** workspaces:

| Primitive | Lands in | Why it's global |
|---|---|---|
| Slash commands (`*.prompt.md`) | VS Code user prompts folder | user-profile prompts load in every workspace |
| Sub-agents (`*.agent.md`) | `~/.copilot/agents/` | default user-level agent location |
| Memory (instructions) | `~/.copilot/instructions/adlc.instructions.md` (`applyTo: '**'`) | user instructions apply to every repo |

The files are symlinks back to the toolkit, so `git -C <toolkit> pull` updates every workspace at once. Existing files at any target are backed up to `*.bak` (or pass `--force`).

If the slash commands don't show up, the installer prints a one-line `chat.promptFilesLocations` setting you can add to your VS Code **user** `settings.json` as a fallback. Use `--insiders` to target VS Code Insiders, or `--vscode-prompts-dir=<path>` for a non-default profile.

## Option B — Single project

```bash
node scripts/adlc.mjs sync --tool=copilot --repo=/path/to/project
```

This writes `.github/prompts/`, `.github/agents/`, and `.github/copilot-instructions.md` into that repo (stubs reference `.adlc-toolkit/core/…`, so vendor the toolkit there too). If the repo already has a `.github/`, the installer copies into it; merge the ADLC block if `copilot-instructions.md` already exists.

## Use it

In Copilot Chat:

```
/init        → creates .adlc/
/spec        → start a REQ
/proceed     → full gated pipeline
```

Prompt files appear as `/`-commands. To run a review with isolated roles, switch to (or hand off to) the `correctness-reviewer` / `quality-reviewer` / `architecture-reviewer` / `reflector` custom agents.

## Verify

- `/` in Copilot Chat lists the ADLC prompts — in **any** repo (global install).
- The agent picker shows the ADLC custom agents.
- The ADLC instructions load automatically (right-click the Chat view → **Diagnostics** lists every loaded prompt/agent/instruction and its source — the fastest way to confirm a global install resolved).
- After `/init`, `.adlc/` exists.

## Notes

- **Read-only reviewers** are enforced by each agent's tool set — the reviewer agents are not granted edit tools. Confirm tool grants in the agent picker if your org customizes them.
- **`/sprint`** uses sequential handoffs rather than true parallelism — correct, not concurrent. `/proceed` works fully.
- Prompt/agent files are pointer stubs that read `core/...` from the toolkit at runtime. A global install stamps the toolkit's **absolute** path, so keep the toolkit where you cloned it (don't move it after installing — just re-run the installer if you do).
- Tool/agent frontmatter keys vary slightly across Copilot host IDEs; if an agent isn't picked up, check that IDE's custom-agent docs and adjust the emitter in `scripts/adlc.mjs build`.
