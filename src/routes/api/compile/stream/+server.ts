import type { LlmSettings, CompilationStreamEvent } from '$lib/compiler/types';
import { compileProjectRequest } from '$lib/server/compile';

export async function POST({ request, fetch }) {
  const { token, forceDemo, llm } = (await request
    .json()
    .catch(() => ({ token: '', forceDemo: false, llm: undefined }))) as {
    token?: string;
    forceDemo?: boolean;
    llm?: Partial<LlmSettings>;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      async function emit(event: CompilationStreamEvent) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }

      try {
        const result = await compileProjectRequest({
          fetchFn: fetch,
          token,
          forceDemo,
          llm,
          onProgress: emit
        });

        await emit({
          type: 'result',
          result
        });
      } catch (error) {
        await emit({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown streaming compile error'
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  });
}
