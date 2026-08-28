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
 * Every rule below is STRUCTURAL: it matches by node type or field name, or by
 * a generic URL shape. None of them contain the secret itself. An earlier draft
 * listed the real webhook paths as find-and-replace patterns, which would have
 * published in this file exactly what the export was removing.
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
  { id: 'dlx6qE4bQxWEzVtw', file: 'kb-ingestion.json' },
  { id: 'PMIciYjF180QncJh', file: 'kb-progress-email.json' },
  { id: '8MeUG6bYrnPrmZLv', file: 'kb-error-logger.json' },
  { id: 'tS79gxfqOjaLeLQX', file: 'kb-queue-status.json' },
];

/** Field names whose values are identifiers or paths we do not publish. */
const REDACT_FIELDS = new Set(['webhookId', 'folderId', 'projectId', 'path']);

/** Node types whose `path` parameter is a live, unauthenticated endpoint. */
const WEBHOOK_NODE_TYPES = new Set(['n8n-nodes-base.webhook']);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * String rules. The host comes from the environment at runtime, so the real
 * hostname is never written down here. The webhook rule matches the SHAPE of an
 * n8n webhook URL and replaces whatever path follows, without naming any path.
 */
function buildStringRules() {
  const rules = [
    [/(\/webhook(?:-test)?\/)[A-Za-z0-9._~-]+/g, '$1WEBHOOK_PATH_REDACTED'],
  ];
  if (N8N_URL) {
    rules.unshift([new RegExp(escapeRegExp(N8N_URL), 'gi'), 'https://N8N_HOST_REDACTED']);
  }
  return rules;
}

const STRING_RULES = buildStringRules();

function redactString(value) {
  let out = value;
  for (const [pattern, replacement] of STRING_RULES) out = out.replace(pattern, replacement);
  return out;
}

/**
 * Walk the workflow and redact in place.
 *
 * `credentials` keeps its NAME but loses its id: the name is what a human needs
 * in order to reattach the right credential after an import, and it is not a
 * secret. n8n never includes credential values in an export, but the ids are
 * still instance-specific and worth withholding.
 */
function redact(value, keyName, insideCredentials = false) {
  if (typeof value === 'string') {
    if (insideCredentials && keyName === 'id') return 'REDACTED';
    if (REDACT_FIELDS.has(keyName)) return 'REDACTED';
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, keyName, insideCredentials));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redact(v, k, insideCredentials || k === 'credentials');
    }
    return out;
  }
  return value;
}

/** Blank the `path` on any webhook node, whatever it happens to be called. */
function redactWebhookPaths(node) {
  if (!WEBHOOK_NODE_TYPES.has(node.type)) return node;
  return { ...node, parameters: { ...node.parameters, path: 'WEBHOOK_PATH_REDACTED' } };
}

/**
 * Only the fields that define behaviour, in a stable order. Dropping
 * updatedAt/versionId keeps the diff to real changes instead of a new hash on
 * every export, which is the whole point of committing these.
 */
function normalise(workflow) {
  return {
    name: workflow.name,
    active: workflow.active,
    settings: workflow.settings ?? {},
    nodes: (workflow.nodes ?? []).map((n) => redactWebhookPaths({
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
  };
}

/**
 * Last line of defence. If the host somehow survived - N8N_URL spelled
 * differently from how the workflow embeds it, say - fail loudly rather than
 * write a file that leaks it.
 */
function assertClean(text, file) {
  const leaks = [];
  if (/https?:\/\/[a-z0-9-]+\.[a-z0-9-]+\.azurewebsites\.net/i.test(text)) leaks.push('n8n host');
  if (/\/webhook(?:-test)?\/(?!WEBHOOK_PATH_REDACTED)[A-Za-z0-9._~-]+/.test(text)) leaks.push('webhook path');
  if (leaks.length) {
    throw new Error(`refusing to write ${file}: ${leaks.join(', ')} still present. ` +
      'Check N8N_URL matches the host the workflows actually embed.');
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
  let failed = 0;

  for (const { id, file } of WORKFLOWS) {
    try {
      const raw = await fetchWorkflow(id);
      const clean = redact(normalise(raw));
      // Trailing newline and 2-space indent so git diffs stay line-oriented.
      const text = JSON.stringify(clean, null, 2) + '\n';
      assertClean(text, file);
      await writeFile(join(OUT_DIR, file), text, 'utf8');
      console.log(`exported ${file}  (${clean.nodes.length} nodes)`);
    } catch (err) {
      failed++;
      console.error(`FAILED ${file}: ${err.message}`);
    }
  }

  // A partial export committed as if complete would read as "nodes deleted".
  if (failed) {
    console.error(`\n${failed} workflow(s) failed. Do NOT commit this run: a missing\n` +
      'workflow looks identical to a deleted one in the diff.');
    process.exit(1);
  }
  console.log('\nDone. Review the diff before committing - an unexpected change is the signal.');
}

main();
