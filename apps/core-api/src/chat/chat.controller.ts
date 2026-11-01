import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ChatRequestDto, chatRequestSchema, type ChatRequest } from './chat.dto.js';
import { ChatService } from './chat.service.js';

/** The one frame core-api produces itself, when an open stream breaks. */
const UPSTREAM_ERROR_FRAME = `data: ${JSON.stringify({
  type: 'error',
  message: 'The AI service stopped before finishing.',
})}\n\n`;

/**
 * Browser-facing chat endpoint (6.4, D63).
 *
 * POST + SSE on purpose: the question belongs in a body (no URLs in logs, no
 * length limits), which rules out `EventSource`, so the web client reads
 * `fetch`'s stream instead. The route is public like the rest of the API;
 * auth arrives with Phase 8.
 */
@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiOperation({
    summary: 'Ask the AI agent one question',
    description:
      'Streams server-sent events: `step` frames report progress (classify, select, draft, execute, compose), `answer` is the final payload with the QuerySpec and rows, and `error` means the run broke after streaming started. Frames are `data: <json>` lines with a `type` field.',
  })
  @ApiBody({ type: ChatRequestDto })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'Server-sent event stream',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'The message is empty or longer than 2000 characters',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'ai-service is unreachable, rejected the request, or timed out',
    type: ApiErrorDto,
  })
  async chat(
    @Body(new ZodValidationPipe(chatRequestSchema)) body: ChatRequest,
    @Res() response: Response,
  ): Promise<void> {
    const abort = new AbortController();

    response.on('close', () => {
      if (!response.writableEnded) abort.abort();
    });

    // Throws a 502 envelope while headers are still unsent.
    const upstream = await this.chatService.open(body.message, abort.signal);

    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    try {
      for (;;) {
        const { done, value } = await upstream.reader.read();
        if (done) break;
        if (value) response.write(value);
      }
    } catch {
      // A client "Stop" is not an error worth reporting; a broken upstream is.
      if (!abort.signal.aborted) response.write(UPSTREAM_ERROR_FRAME);
    } finally {
      upstream.dispose();
      response.end();
    }
  }
}
