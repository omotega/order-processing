import { Injectable, NestMiddleware } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incomingCorrelationId = req.header('x-correlation-id')?.trim();
    const correlationId = incomingCorrelationId || nanoid();

    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    next();
  }
}
