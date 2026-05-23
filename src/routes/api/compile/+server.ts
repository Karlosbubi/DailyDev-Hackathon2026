import { json } from '@sveltejs/kit';
import type { LlmSettings } from '$lib/compiler/types';
import { compileProjectRequest } from '$lib/server/compile';

export async function POST({ request, fetch }) {
  const { token, forceDemo, llm } = (await request
    .json()
    .catch(() => ({ token: '', forceDemo: false, llm: undefined }))) as {
    token?: string;
    forceDemo?: boolean;
    llm?: Partial<LlmSettings>;
  };

  const result = await compileProjectRequest({
    fetchFn: fetch,
    token,
    forceDemo,
    llm
  });

  return json(result);
}
