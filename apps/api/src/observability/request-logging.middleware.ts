import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestLogging(request: Request, response: Response, next: NextFunction) {
  const supplied = request.header('x-request-id');
  const requestId = supplied && /^[a-zA-Z0-9._-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  const startedAt = process.hrtime.bigint();
  response.setHeader('x-request-id', requestId);
  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'http_request',
        requestId,
        method: request.method,
        path: request.originalUrl.split('?')[0],
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip: request.ip,
        userAgent: request.header('user-agent')?.slice(0, 300)
      })}\n`
    );
  });
  next();
}
