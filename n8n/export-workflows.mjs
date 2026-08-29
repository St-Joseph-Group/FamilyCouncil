#!/usr/bin/env node
/**
 * Export the Family Council n8n workflows into this repo, with the parts that
 * must not be public replaced by placeholders.
 *
 * WHY THIS EXISTS
 * The chatbot's behaviour lives almost entirely in n8n, not in this codebase,
 * and n8n has no history you can diff. Saving the editor from a browser tab
 * holding an older copy silently overwrites everything changed since that tab
 * was loaded. That has happened three times:
 *
 *   2026-08-20  Is Full Pledge + Retrieve Public Chunks deleted from the chat
 *               workflow. Access control was broken for eight days: people
 *               without Full Pledge got "I don't have enough information" on
 *               documents they were entitled to read. Nobody noticed, because
 *               the workflow still ran and still answered.
 *   2026-08-28  Has Chat Image? + Download Chat Image + Describe Chat Image
 *               deleted, and image_url dropped from Prepare Input. Pasted
 *               screenshots were still uploaded and displayed but never read.
 *   (earlier)   chunkSize reverted 2500 -> 1000 in the KB processor.
 *
 * Every one of those looked fine from the outside. Committing the exports turns
 * a silent revert into a visible diff.
 *
 * WHY IT IS REDACTED
 * This repository is PUBLIC. The raw export contains the n8n hostname and the
 * webhook paths, and the chat webhook has no authentication and trusts a
 * client-supplied is_full_pledge flag - so publishing it verbatim would hand
 * anyone a working request for restricted Family Council content.
 *
 * Nothing secret is written in this file. Webhook paths and the Drive folder id
 * are DERIVED from the fetched workflows, then removed wherever they appear -
 * including inside sticky-note prose, which a URL-shaped rule alone misses. An
 * earlier version made both mistakes: it listed the real paths as constants,
 * and it only matched them in URL position, so a note describing the path
 * leaked straight through.
 *
 * Redaction is a mitigation, not a fix. The fix is to authenticate those
 * webhooks and stop trusting the client's access claim.
 *
 * USAGE
 *   N8N_URL=https://your-n8n-host N8N_API_KEY=... node n8n/export-workflows.mjs
 *
 * Create the key in n8n under Settings -> API. Pass it on the command line or
 * from your shell environment. Do NOT commit it, and do not paste it into a
 * chat window - anything sent to a third party should be treated as disclosed.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'workflows');

const N8N_URL = (process.env.N8N_URL || '').replace(/\/+$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY || '';

/** Workflows to export, by n8n id. Ids are stable; names get edited. */
const WORKFLOWS = [
  { id: 'ndYNEP0gRDdzT6YE', file: 'chat-rag.json' },
  { id: 'tVGDoCsC4yMZfwqm', file: 'kb-file-processor.json' },
  { id: 'dlx6qE4bQxWEzVtw', file: 'kb-ingestion-google-drive.json' },
  { id: 'PMIciYjF180QncJh', file: 'kb-progress-email.json' },
  { id: '8MeUG6bYrnPrmZLv', file: 'kb-error-logger.json' },
  { id: 'tS79gxfqOjaLeLQX', file: 'kb-queue-status.json' },
];

/** Field names whose values are identifiers or paths we do not publish. */
const REDACT_FIELDS = new Set(['webhookId', 'folderId', 'path']);

const HOST_RE = /https?:[/][/][a-z0-9-]+[.][a-z0-9-]+[.]azurewebsites[.]net/gi;
const GCP_RE = /family-council-[0-9]+/g;

/**
 * Collect the values that must not be published, from the workflows themselves.
 * Prefix variants are included because the notes reference the older v1 webhook
 * path as well ("...-v2" -> "...").
 */
function collectSecrets(workflows) {
  const secrets = new Set();
  for (const wf of workflows) {
    for (const node of wf.nodes || []) {
      if (node.type === 'n8n-nodes-base.webhook' && typeof node.parameters?.path === 'string') {
        const p = node.parameters.path;
        secrets.add(p);
        const stripped = p.replace(/-v[0-9]+$/, '');
        if (stripped !== p) secrets.add(stripped);
      }
      for (const a of node.parameters?.assignments?.assignments || []) {
        if (a.name === 'folderId' && typeof a.value === 'string' && a.value.length > 20) {
          secrets.add(a.value);
        }
      }
    }
  }
  // longest first, so "x-v2" is replaced before "x"
  return [...secrets].sort((a, b) => b.length - a.length);
}

function redactString(value, secrets) {
  let out = value
    .replace(HOST_RE, 'https://N8N_HOST_REDACTED')
    .replace(GCP_RE, 'GCP_PROJECT_REDACTED');
  // Plain string replacement, not regex: no escaping to get wrong.
  for (const secret of secrets) out = out.split(secret).join('REDACTED');
  return out;
}

/**
 * `credentials` keeps its NAME but loses its id: the name is what a human needs
 * in order to reattach the right credential after an import, and it is not a
 * secret. n8n never includes credential values in an export, but the ids are
 * still instance-specific and worth withholding.
 */
function redact(value, key, secrets, insideCredentials = false) {
  if (typeof value === 'string') {
    if (insideCredentials && key === 'id') return 'REDACTED';
    if (REDACT_FIELDS.has(key)) return 'REDACTED';
    return redactString(value, secrets);
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, key, secrets, insideCredentials));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redact(v, k, secrets, insideCredentials || k === 'credentials');
    }
    return out;
  }
  return value;
}

/**
 * Only the fields that define behaviour, in a stable order. Dropping
 * updatedAt/versionId keeps the diff to real changes instead of a new hash on
 * every export, which is the whole point of committing these.
 */
function normalise(workflow) {
  return {
    name: workflow.name,
    nodes: (workflow.nodes ?? []).map((n) => ({
      name: n.name,
      type: n.type,
      typeVersion: n.typeVersion,
      position: n.position,
      parameters: n.parameters ?? {},
      ...(n.credentials ? { credentials: n.credentials } : {}),
      ...(n.notes ? { notes: n.notes } : {}),
      ...(n.disabled ? { disabled: n.disabled } : {}),
      ...(n.onError ? { onError: n.onError } : {}),
      ...(n.retryOnFail ? { retryOnFail: n.retryOnFail } : {}),
      ...(n.maxTries ? { maxTries: n.maxTries } : {}),
      ...(n.waitBetweenTries ? { waitBetweenTries: n.waitBetweenTries } : {}),
      ...(n.alwaysOutputData ? { alwaysOutputData: n.alwaysOutputData } : {}),
      ...(n.executeOnce ? { executeOnce: n.executeOnce } : {}),
    })),
    connections: workflow.connections ?? {},
    settings: workflow.settings ?? {},
    pinData: {},
  };
}

/**
 * Last line of defence: fail loudly rather than write a file that leaks.
 */
function assertClean(text, file, secrets) {
  if (/azurewebsites/i.test(text)) {
    throw new Error(`refusing to write ${file}: n8n host still present.`);
  }
  for (const secret of secrets) {
    if (text.includes(secret)) {
      throw new Error(`refusing to write ${file}: "${secret}" still present.`);
    }
  }
}

async function fetchWorkflow(id) {
  const res = await fetch(`${N8N_URL}/api/v1/workflows/${id}`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  if (!N8N_URL || !N8N_API_KEY) {
    console.error('Set N8N_URL and N8N_API_KEY, e.g.\n' +
      '  N8N_URL=https://your-n8n-host N8N_API_KEY=... node n8n/export-workflows.mjs');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  // Fetch everything first: a note in one workflow can name another's webhook
  // path, so the secret list has to be complete before anything is written.
  const fetched = [];
  for (const { id, file } of WORKFLOWS) {
    try {
      fetched.push({ file, workflow: await fetchWorkflow(id) });
    } catch (err) {
      console.error(`FAILED ${file}: ${err.message}`);
      console.error('\nAborting without writing. A missing workflow looks identical\n' +
        'to a deleted one in the diff.');
      process.exit(1);
    }
  }

  const secrets = collectSecrets(fetched.map((f) => f.workflow));
  console.log(`redacting ${secrets.length} derived value(s)`);

  for (const { file, workflow } of fetched) {
    const clean = redact(normalise(workflow), undefined, secrets);
    // Trailing newline and 2-space indent so git diffs stay line-oriented.
    const text = JSON.stringify(clean, null, 2) + '\n';
    assertClean(text, file, secrets);
    await writeFile(join(OUT_DIR, file), text, 'utf8');
    console.log(`exported ${file}  (${clean.nodes.length} nodes)`);
  }

  console.log('\nDone. Review the diff before committing - an unexpected change is the signal.');
}

main();
