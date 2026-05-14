# Copilot Editing Instructions

When modifying existing code in this workspace, prefer minimal, in-place edits over full rewrites.

## Editing behavior
- Edit only the lines needed to satisfy the request.
- Preserve file structure, naming, formatting style, and comments unless change is required.
- Avoid replacing entire files or large sections when a small patch is possible.
- Do not regenerate components/modules from scratch unless explicitly asked.
- Keep public APIs and behavior stable unless the user requests a breaking change.

## Patch-first workflow
- Read relevant files first.
- Propose targeted diffs and apply focused patches.
- Reuse existing utilities and patterns already present in the codebase.
- After edits, run the smallest relevant validation (typecheck, test, or lint) for changed areas.

## Communication
- Summarize exactly what changed and where.
- If a full rewrite seems necessary, explain why and ask for confirmation first.
