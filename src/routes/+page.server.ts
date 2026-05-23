import { getDefaultLlmSettings, getServerLlmConfigSummary } from '$lib/server/llm';

export function load() {
  const defaultLlm = getDefaultLlmSettings();
  return {
    defaultLlm,
    serverLlmConfig: getServerLlmConfigSummary()
  };
}
