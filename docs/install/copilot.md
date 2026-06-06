# Install: GitHub Copilot

Copilot uses **prompt files** (`.github/prompts/*.prompt.md`) for slash commands, **custom agents** (`.github/agents/*.agent.md`, formerly "chat modes") for sub-agents, and `.github/copilot-instructions.md` as the auto-loaded memory file. Sequential workflows use **handoffs** between agents.

Adapter source: `adapters/copilot/.github/` → `prompts/<name>.prompt.md`, `agents/<name>.agent.md`, `copilot-instructions.md`.

Prompt files and custom agents are available in **VS Code, Visual Studio, and JetBrains IDEs** (not the github.com web chat).

## Prerequisites

- GitHub Copilot enabled in your IDE.
- In **VS Code**, enable prompt files: Settings → `chat.promptFiles: true` (on by default in recent builds). Custom agents are discovered from `.github/agents/`.
- Node 18+ only if regenerating adapters.

## Option A — Project-local (recommended; Copilot is project-oriented)

**macOS / Linux**
```bash
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit/scripts/build.mjs --tool=copilot --toolkit-path=.adlc-toolkit   # only if path differs
cp -R .adlc-toolkit/adapters/copilot/.github ./.github
```

**Windows (PowerShell)**
```powershell
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit\scripts\build.mjs --tool=copilot --toolkit-path=.adlc-toolkit
Copy-Item -Recurse -Force .adlc-toolkit\adapters\copilot\.github .\.github
```

If the repo already has a `.github/` folder (most do), copy the *contents* — `prompts/`, `agents/`, and `copilot-instructions.md` — in rather than replacing the directory. If `copilot-instructions.md` already exists, merge the ADLC block.

## Option B — User-level prompts (VS Code)

VS Code can load prompt files from your user profile so they appear across workspaces. Run **"Chat: New Prompt File"** from the Command Palette and choose the user location, or copy the generated files into your VS Code user `prompts` folder. Custom agents and `copilot-instructions.md` remain best kept per-repo.

## Use it

In Copilot Chat:

```
/init        → creates .adlc/
/spec        → start a REQ
/proceed     → full gated pipeline
```

Prompt files appear as `/`-commands. To run a review with isolated roles, switch to (or hand off to) the `correctness-reviewer` / `quality-reviewer` / `architecture-reviewer` / `reflector` custom agents.

## Verify

- `/` in Copilot Chat lists the ADLC prompts.
- The agent picker shows the ADLC custom agents.
- `.github/copilot-instructions.md` is picked up automatically (visible in the chat's references).
- After `/init`, `.adlc/` exists.

## Notes

- **Read-only reviewers** are enforced by each agent's tool set — the reviewer agents are not granted edit tools. Confirm tool grants in the agent picker if your org customizes them.
- **`/sprint`** uses sequential handoffs rather than true parallelism — correct, not concurrent. `/proceed` works fully.
- Prompt/agent files are pointer stubs reading `.adlc-toolkit/core/...` at runtime — keep the toolkit present at the stamped path.
- Tool/agent frontmatter keys vary slightly across Copilot host IDEs; if an agent isn't picked up, check that IDE's custom-agent docs and adjust the emitter in `scripts/build.mjs`.
