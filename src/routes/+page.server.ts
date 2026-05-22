import { env } from '$env/dynamic/private';
import { getDefaultLlmSettings, getServerLlmConfigSummary } from '$lib/server/llm';

export function load() {
  const defaultLlm = getDefaultLlmSettings();
  return {
    hasServerToken: Boolean(env.DAILY_DEV_API_TOKEN?.trim()),
    hasOpenAiKey: Boolean(env.OPENAI_API_KEY?.trim() || env.OPEN_AI_API_TOKEN?.trim()),
    defaultLlm,
    serverLlmConfig: getServerLlmConfigSummary()
  };
}
