# Agent rules

## Owner's working rules
- Keep token use low; spend more only when a task is complex and needs it.
- Explain and summarise in plain words.
- Short progress updates, only when something important changed.
- Decide after research instead of asking. Ask the owner only for input or actions an AI can't do (payments, logins, secrets, device checks).
- No guessing, even on simple tasks: check first, or say it can't be verified.
- After each task, review what was built; fix it before moving on.
- Precision at every layer: code, tests, tasks, messages.
- Prevent, don't apologise: catch anything catchable before it ships.
- While building: focused tests per change. Full regression + full QA once, on the finished build.
- Plan risks and fixes at design, build and release.
- One file per topic: update it, never make v2/final/copy/patch versions.

## Repo rules
- Read first: `docs/ARCHITECTURE.md` (target design and work streams), then only the files your task names.
- Money is exact bigint (`src/core/money`); never use number arithmetic on amounts (`scripts/test-money-lint.mjs`).
- The brain (`src/brain`) reads the ledger and never writes it. Import writes staging until the user confirms.
- Only the modules allow-listed in `tests/no-network.test.ts` may reach the network.
- Before every push: `npm run check` and `node scripts/test-money-lint.mjs`. Never skip, disable or weaken a test; delete tests only together with the code they test, and list them in the PR.
- Every bug fix starts with a failing test that reproduces it.
- UI copy: helper text at most 12 words; info sheets at most 2 sentences; say each thing once.
- Code comments: at most 2 lines, and only to say why. History belongs in git, not in comments or docs.
- Commit on your stream's branch only; one PR back into the integration branch.
- Relay project "Money tracker": post your result to `agents/claude` and add one line to `LOG.md`.
