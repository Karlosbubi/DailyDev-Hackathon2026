import { spawn } from 'node:child_process';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOllamaBaseUrl(value) {
  const trimmed = (value || 'http://ollama:11434/api').trim().replace(/\/$/, '');
  const internalized = trimmed
    .replace('http://localhost:11434', 'http://ollama:11434')
    .replace('http://127.0.0.1:11434', 'http://ollama:11434');
  return internalized.endsWith('/api') ? internalized : `${internalized}/api`;
}

async function waitForOllama(baseUrl, attempts = 90) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`${baseUrl}/tags`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Keep waiting until Ollama becomes reachable.
    }

    await sleep(2000);
  }

  return false;
}

async function ensureOllamaModel() {
  const provider = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  const model = (process.env.OLLAMA_BOOTSTRAP_MODEL || process.env.OLLAMA_MODEL || '').trim();

  if (provider !== 'ollama' || !model) {
    console.log('[bootstrap] Skipping Ollama model bootstrap.');
    return;
  }

  const baseUrl = normalizeOllamaBaseUrl(process.env.OLLAMA_BASE_URL);
  console.log(`[bootstrap] Waiting for Ollama at ${baseUrl}.`);
  const reachable = await waitForOllama(baseUrl);

  if (!reachable) {
    throw new Error(`Ollama did not become reachable at ${baseUrl}.`);
  }

  const tagsResponse = await fetch(`${baseUrl}/tags`);
  if (!tagsResponse.ok) {
    throw new Error(`Failed to query Ollama tags (${tagsResponse.status}).`);
  }

  const tagsPayload = await tagsResponse.json();
  const models = Array.isArray(tagsPayload?.models) ? tagsPayload.models : [];
  const alreadyPresent = models.some((entry) => entry && typeof entry === 'object' && entry.name === model);

  if (alreadyPresent) {
    console.log(`[bootstrap] Ollama model already present: ${model}.`);
    return;
  }

  console.log(`[bootstrap] Pulling Ollama model: ${model}.`);
  const pullResponse = await fetch(`${baseUrl}/pull`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      stream: false
    })
  });

  if (!pullResponse.ok) {
    throw new Error(`Failed to pull Ollama model ${model} (${pullResponse.status}).`);
  }

  console.log(`[bootstrap] Ollama model ready: ${model}.`);
}

async function main() {
  const child = spawn('node', ['build'], {
    stdio: 'inherit'
  });

  ensureOllamaModel().catch((error) => {
    console.error('[bootstrap]', error instanceof Error ? error.message : error);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
