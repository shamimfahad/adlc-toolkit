<!-- ADLC template — merge-checklist.md. Read at /wrapup step 5, never at preflight.
     Placeholders in <angle brackets> are substituted when the checklist is written.
     Both post-merge cleanup blocks are carried here; the written file keeps only the
     one matching pipeline-state.isolation. Safe to customize per project: merge
     strategy, CI steps, extra pre-merge gates. -->

# Merge checklist — REQ-NNN-<slug>

You run these. Claude does not.

## Pre-merge

- [ ] Fetch first, if you didn't before `/wrapup` — the lesson dedup compared against `origin/<base-branch>` as it was on this machine; a stale fetch weakens it:
      `git -C <workPath> fetch origin`
- [ ] Push the branch:
      `git -C <workPath> push -u origin <branch>`
- [ ] Open the PR (paste title/body from pr-draft.md):
      `gh pr create --base <base-branch> --head <branch> --title "<title>" --body-file .adlc/{{REQ_PATH}}/pr-draft.md`
      (or use the web UI)
- [ ] Wait for CI to pass
- [ ] Request review (if applicable)
- [ ] Address review feedback (if any)

## Merge

- [ ] Merge the PR:
      `gh pr merge <pr-url> --squash --delete-branch`
      (or use the web UI; match the project's merge strategy)

## Post-merge cleanup — `worktree` mode

- [ ] Remove the worktree:
      `git -C <repo-path> worktree remove --force <workPath>`
- [ ] Delete the local branch if `--delete-branch` didn't run it:
      `git -C <repo-path> branch -D <branch>`
- [ ] Pull latest base branch:
      `git -C <repo-path> checkout <base-branch> && git pull`

## Post-merge cleanup — `branch` mode

- [ ] Switch back to base branch:
      `git -C <repo-path> checkout <base-branch>`
- [ ] Pull latest:
      `git -C <repo-path> pull`
- [ ] Delete the local branch if `--delete-branch` didn't run it:
      `git -C <repo-path> branch -D <branch>`

## Notify Claude (optional)

When merge is complete, tell Claude in chat:
`merged REQ-NNN-<slug>`

This updates pipeline-state and adds a hot.md entry.
