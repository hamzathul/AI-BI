import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReadableStreamDefaultReader } from 'node:stream/web';

/** An opened upstream stream plus the cleanup the controller must call. */
export interface ChatUpstream {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  /** Clears the run timeout and the abort forwarding. Idempotent. */
  dispose: () => void;
}

/**
 * The only path from the browser to ai-service (6.4, D63).
 *
 * core-api opens the upstream request, then pipes bytes untouched. It never
 * parses frames: the event contract has one owner (ai-service), and a proxy
 * that also understands the payload drifts from it.
 *
 * Opening happens *before* response headers are sent, so an unreachable
 * service is still a normal 502 envelope. Once bytes flow, failures can only
 * be reported as an SSE `error` frame, which the controller does.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('AI_SERVICE_URL').replace(/\/+$/, '');
    this.timeoutMs = config.getOrThrow<number>('AI_SERVICE_TIMEOUT_MS');
    this.token = config.getOrThrow<string>('INTERNAL_API_TOKEN');
  }

  async open(message: string, signal: AbortSignal): Promise<ChatUpstream> {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    signal.addEventListener('abort', forwardAbort, { once: true });

    // Whole-run budget, not just time-to-headers: a run can make several LLM
    // calls and one query before it answers.
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', forwardAbort);
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // The status only: an error body can contain semantic names.
        this.logger.warn(`ai_service_rejected status=${response.status}`);
        throw new BadGatewayException('The AI service rejected the request.');
      }

      if (!response.body) {
        throw new BadGatewayException('The AI service returned an empty stream.');
      }

      return { reader: response.body.getReader(), dispose: cleanup };
    } catch (error) {
      cleanup();

      if (error instanceof BadGatewayException) throw error;

      this.logger.warn(
        `ai_service_unavailable error=${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new BadGatewayException('The AI service is unavailable.');
    }
  }
}
