import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { configureApp } from '../src/configure-app.js';

/**
 * `POST /api/chat` against a stub ai-service (6.4b).
 *
 * A real ai-service would need an LLM key and the whole Python stack; the
 * proxy's contract is HTTP and SSE, so a tiny node server is the honest test
 * double. It also lets us force the failures a live service rarely produces:
 * refused connections, timeouts, and a stream that dies mid-answer.
 */
type StubMode = 'stream' | 'slow' | 'hangup' | 'reject' | 'truncate';

const STEP_FRAME =
  'data: {"type":"step","step":"classify_intent","status":"done","detail":{"intent":"data_question"}}\n\n';
const ANSWER_FRAME =
  'data: {"type":"answer","outcome":"answered","answer":"Six departments.","trace":["compose_answer"]}\n\n';

describe('chat proxy (e2e)', () => {
  let app: INestApplication<App>;
  let server: Server;
  let mode: StubMode = 'stream';
  let seenAuthorization = '';
  let seenBody = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        seenAuthorization = String(req.headers.authorization ?? '');
        seenBody = body;

        if (mode === 'hangup') {
          req.socket.destroy();
          return;
        }

        if (mode === 'slow') {
          // Never send headers: this exercises the proxy's run timeout.
          return;
        }

        if (mode === 'reject') {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end('{"detail":"Invalid or missing service token."}');
          return;
        }

        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(STEP_FRAME);

        if (mode === 'truncate') {
          setTimeout(() => req.socket.destroy(), 30);
          return;
        }

        res.end(ANSWER_FRAME);
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as AddressInfo).port;

    // ConfigModule validates (and freezes) the environment when AppModule is
    // *defined*, so the import must happen after these variables are set.
    process.env.AI_SERVICE_URL = `http://127.0.0.1:${port}`;
    process.env.AI_SERVICE_TIMEOUT_MS = '300';

    const { AppModule } = await import('../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    mode = 'stream';
    seenAuthorization = '';
    seenBody = '';
  });

  function post(message: unknown): request.Test {
    return request(app.getHttpServer()).post('/api/chat').send(message as object);
  }

  it('streams the upstream frames and forwards the service token', async () => {
    const response = await post({ message: '  Headcount by department?  ' }).expect(
      200,
    );

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache, no-transform');
    expect(response.headers['x-accel-buffering']).toBe('no');

    expect(response.text).toContain(STEP_FRAME.trimEnd());
    expect(response.text).toContain(ANSWER_FRAME.trimEnd());

    const token = app.get(ConfigService).getOrThrow<string>('INTERNAL_API_TOKEN');
    expect(seenAuthorization).toBe(`Bearer ${token}`);
    expect(JSON.parse(seenBody)).toEqual({ message: 'Headcount by department?' });
  });

  it('answers 502 when ai-service refuses the connection', async () => {
    mode = 'hangup';

    const response = await post({ message: 'Headcount?' }).expect(502);

    expect(response.body).toMatchObject({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'Internal server error',
      path: '/api/chat',
    });
  });

  it('answers 502 when ai-service never sends headers', async () => {
    mode = 'slow';

    const response = await post({ message: 'Headcount?' }).expect(502);

    expect(response.body).toMatchObject({ statusCode: 502 });
  });

  it('does not forward an upstream 401 as our 401', async () => {
    mode = 'reject';

    const response = await post({ message: 'Headcount?' }).expect(502);

    expect(response.body.statusCode).toBe(502);
    expect(response.body.message).toBe('Internal server error');
  });

  it('reports a stream that dies mid-answer as an error frame', async () => {
    mode = 'truncate';

    const response = await post({ message: 'Headcount?' }).expect(200);

    expect(response.text).toContain(STEP_FRAME.trimEnd());
    expect(response.text).toContain('"type":"error"');
    expect(response.text).not.toContain(ANSWER_FRAME.trimEnd());
  });

  it('rejects a blank message before calling ai-service', async () => {
    const response = await post({ message: '   ' }).expect(400);

    expect(response.body.message).toContain('message must not be empty');
    expect(seenBody).toBe('');
  });

  it('rejects a message longer than 2000 characters', async () => {
    await post({ message: 'x'.repeat(2001) }).expect(400);
  });

  it('documents the chat route in OpenAPI', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(response.body.paths['/api/chat'].post.responses['200']).toBeDefined();
    expect(
      response.body.components.schemas.ChatRequestDto.properties.message
        .maxLength,
    ).toBe(2000);
  });
});
