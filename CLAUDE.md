# OpenHR — Claude Code Instructions

All project instructions are maintained in `Others/CLAUDE.md`. Read that file for full context.

## Frozen Modules — Read Before Editing

A short list of files in this repo has regressed three times during refactors
(auto-logout, forgotten check-out closure). They are now **frozen**. Before
editing any of them you MUST follow the plan-approval gate described in
`Others/CLAUDE.md` → "Frozen Modules — Change-Control".

Frozen files:
- `src/services/session/sessionManager.ts` and `sessionManager.types.ts`
- `src/services/workday/workdaySessionManager.ts` and `workdaySessionManager.types.ts`
- `src/context/AuthContext.tsx` (must remain a thin UI delegation layer)
- `Others/pb_hooks/cron.pb.js` — especially the `auto_close_sessions` block
- `scripts/validate-pb-hooks.cjs`

## Git Workflow — MUST FOLLOW

### Branch model (Eletropasso) — do not confuse `main` with `master`

| Branch | Role |
|--------|------|
| `main` | First / original baseline of the software. Not day-to-day. |
| `master` | Edited **stable** version — pull from here for deploy. |
| `dev` | **Development** branch — all daily work, commit, and push land here. |

**Flow:** develop on `dev` → commit + push always to `dev` → promote to `master` only when validated → pull/`deploy` from `master`.

After completing any code changes (on `dev`):
1. Ensure checkout is `dev` (create/switch if needed)
2. Stage the changed files: `git add <specific files>` (never use `git add .` or `git add -A`)
3. Update `src/data/changelog.ts` with a new entry describing the change (add to the first release group if same date, or create a new group at the top)
4. Commit with a descriptive message: `git commit -m "description of changes"`
5. Push to dev: `git push origin dev`

Always push immediately after committing to `dev`. Never leave unpushed commits on `dev`.
Do not commit daily work directly to `master` or `main`.
