# n8n workflows

The chatbot's behaviour lives here, not in `src/`. The React app only renders a
conversation and posts to a webhook — retrieval, access control, OCR, image
reading and every reply rule are n8n nodes.

n8n keeps its own version history, but it is tied to that instance and it is not
diffable. This directory exists so a change is visible in a pull request.

## Why this matters

Saving the n8n editor from a browser tab holding an older copy of a workflow
overwrites everything changed since that tab was loaded. It has happened three
times, and every time the workflow kept running and kept answering — which is
exactly why nobody noticed:

| Date | What disappeared | Effect |
|---|---|---|
| 2026-08-20 | `Is Full Pledge`, `Retrieve Public Chunks` | Access control broken for **8 days**. People without Full Pledge were told "I don't have enough information" about documents they were entitled to read. |
| 2026-08-28 | `Has Chat Image?`, `Download Chat Image`, `Describe Chat Image`, and `image_url` on `Prepare Input` | Pasted screenshots were uploaded and displayed but never read. |
| earlier | `chunkSize` reverted 2500 → 1000 | Embedding calls up ~40%, worsening the Vertex quota pressure the change existed to relieve. |

**Before editing a workflow in the n8n UI, reload the page first.** An open tab
from an hour ago is a loaded gun.

## What is in here

### `snapshots/`

Hand-checked structural snapshots: node names, node types, the connection graph,
and a `critical` note on anything whose loss or misconfiguration has caused a
real outage. Node bodies (SQL, code, prompts) are **not** here.

These are the cheap early warning. If a node vanishes, `nodeCount` and the node
list change, and that shows up in a diff immediately.

### `export-workflows.mjs`

Full export, including every SQL query, code node and prompt. Run it after any
change:

```bash
N8N_URL=https://your-n8n-host N8N_API_KEY=... node n8n/export-workflows.mjs
```

Create the key in n8n under **Settings → API**. Never commit it, and never paste
it into a chat window — treat anything sent to a third party as disclosed.

Output lands in `n8n/workflows/`. Review the diff before committing: an
unexpected change *is* the signal.

## Redaction, and why it is not enough

**This repository is public.** The raw export contains the n8n hostname and the
webhook paths, so the export script replaces them with placeholders.

That matters because the chat webhook has **no authentication** and takes the
caller's word for `is_full_pledge`. Anyone holding the URL can request
restricted Family Council content by sending `is_full_pledge: true`. The
hostname is already committed in
`supabase/migrations/20260520034819_add_webhook_config_table.sql`; redaction only
withholds the remaining half.

Redaction is a mitigation, not a fix. The fix is to authenticate the chat and
image webhooks and derive access from the authenticated user instead of trusting
the request body. Until that happens, do not publish the webhook paths, and
prefer making this repository private.

## Workflows

| Workflow | id | Trigger | Purpose |
|---|---|---|---|
| Chat (RAG) | `ndYNEP0gRDdzT6YE` | webhook | Answers questions. Access routing, recency lookup, vision, disclaimer. |
| KB File Processor | `tVGDoCsC4yMZfwqm` | every 15 min | One queued file per run: download, convert, extract, OCR, embed. |
| KB Ingestion | `dlx6qE4bQxWEzVtw` | every 15 min | Crawls the Drive tree at all depths and fills the queue. |
| KB Progress Email | `PMIciYjF180QncJh` | every 8 h | Progress mail, self-terminating once idle. |
| KB Error Logger | `8MeUG6bYrnPrmZLv` | error trigger | Writes failures to `fc_kb_errors`. |
| KB Queue Status | `tS79gxfqOjaLeLQX` | manual | Utility for inspecting the queue. |

Snapshots currently cover the first three — the ones carrying the logic and the
ones that have been reverted. Running the export script covers all six.

## Two constraints worth knowing before changing anything

**The Vertex embedding quota is 5 requests per minute** and Google will not
raise it for this project. The processor's one-file-per-run pace, the
`batchSize: 3` embed loop and the 65-second wait all exist because of it. The
chat workflow embeds every user question through the same quota, so saturating
it takes the chatbot down, not just ingestion.

**Access is derived from the Drive folder path**, never from file names or
document contents. A path containing "full pledge" (case-insensitive, with `-`
and `_` treated as spaces) makes everything inside restricted. Subfolders
inherit. Moving a file between folders re-queues it so its tag is recomputed.

## The database n8n keeps its own state in

n8n's workflows, credentials and execution history live in SQLite, in a single
file on the App Service's `/home` mount. That mount is Azure Files — an SMB
network share — and SQLite's locking assumes a local disk. On **2026-08-28**
that file corrupted. Webhooks began returning HTTP 500 in 0.13s before any node
ran, so the chatbot went silent while the scheduled workflows, which only touch
Supabase, carried on as if nothing were wrong.

Everything was recovered: the file could still be read, so all 31 workflows came
out through `sqlite3 -readonly`.

The permanent fix is to move this store to Postgres. Until that happens, the
same failure can recur, and these settings exist to make it less likely and less
expensive:

**Successful executions are not retained.** Every saved run is a write to the
file, and the chat workflow stored a full copy of each answer — 60,000-character
retrieval contexts, embeddings, attached images. `saveDataSuccessExecution` is
`none` on the chat and ingestion workflows; `saveDataErrorExecution` stays `all`,
because failures are the runs worth reading. Set per workflow rather than
globally so a future workflow does not inherit it silently.

Worth pairing with, on the App Service:

| Variable | Value | Why |
|---|---|---|
| `EXECUTIONS_DATA_PRUNE` | `true` | Deletes old execution rows at all |
| `EXECUTIONS_DATA_MAX_AGE` | `168` | Keep one week |
| `EXECUTIONS_DATA_PRUNE_MAX_COUNT` | `5000` | Ceiling regardless of age |
| `N8N_BINARY_DATA_MODE` | `filesystem` | Keeps PDFs and page images out of the database entirely |

Pruning stops the file growing but does not shrink it — freed pages are reused,
not returned. Reclaiming space needs a `VACUUM`, which rewrites the whole file
and is therefore the single operation most likely to corrupt it again. Take a
backup first, do it in a quiet window, and remove the variable afterwards so it
does not run on every restart.

**Backups.** Copying the file while n8n is running can capture a torn write. Use
SQLite's own atomic backup instead:

```bash
sqlite3 /home/.n8n/database.sqlite ".backup '/home/backups/n8n-$(date +%F).db'"
```

The workflow JSON in `workflows/` is a second, independent copy of the part that
actually matters — and the one that recovered the outage.
