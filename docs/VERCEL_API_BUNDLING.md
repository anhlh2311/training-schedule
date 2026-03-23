# Vercel API bundling (shared code)

## Finding

Serverless functions are deployed with a **limited filesystem** under `/var/task/`. Imports to modules **outside** the traced bundle (e.g. `../server/fcmTokens`, `api/lib/...`) can fail at runtime with:

`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...'`

`includeFiles` does not always fix **ESM resolution** for arbitrary relative paths.

Handlers in **`api/cron/`** are still part of the **`api/`** tree; the issue is **imports that leave that tree** (e.g. `../server/...`), not the `cron/` folder itself.

## Remedy used in this project

Shared logic for **`/api/notify`** and **`/api/cron/process-batch`** lives in **[api/notify.ts](mdc:api/notify.ts)** as **named exports**. The cron handler uses:

```ts
import { getFcmTokenEntries, removeDeadFcmTokensAfterSend } from "../notify.js";
```

Use the **`.js` extension** in the import path: with `moduleResolution` **node16** / **nodenext** (as Vercel’s TypeScript check may use), relative ESM imports must include the extension that exists at runtime; TypeScript still type-checks against `notify.ts`.

Everything stays under **`api/`** so the Vercel bundler includes it in the function output.

## Reference

Cursor rule: [.cursor/rules/vercel-api-shared-modules.mdc](mdc:.cursor/rules/vercel-api-shared-modules.mdc)
