import type { LlmSettings, CompilationStreamEvent } from '$lib/compiler/types';
import { compileProjectRequest } from '$lib/server/compile';

export async function POST({ request, fetch }) {
  const { token, forceDemo, llm, steeringNote } = (await request
    .json()
    .catch(() => ({ token: '', forceDemo: false, llm: undefined, steeringNote: '' }))) as {
    token?: string;
    forceDemo?: boolean;
    llm?: Partial<LlmSettings>;
    steeringNote?: string;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        controller.close();
      };

      const enqueue = (chunk: string) => {
        if (closed) {
          return;
        }

        controller.enqueue(encoder.encode(chunk));
      };

      const heartbeat = setInterval(() => {
        enqueue('\n');
      }, 8_000);

      const abortHandler = () => {
        clearInterval(heartbeat);
        close();
      };

      request.signal.addEventListener('abort', abortHandler);

      async function emit(event: CompilationStreamEvent) {
        enqueue(`${JSON.stringify(event)}\n`);
      }

      try {
        const result = await compileProjectRequest({
          fetchFn: fetch,
          token,
          forceDemo,
          llm,
          steeringNote,
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
        clearInterval(heartbeat);
        request.signal.removeEventListener('abort', abortHandler);
        close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'content-encoding': 'identity',
      connection: 'keep-alive'
    }
  });
}
