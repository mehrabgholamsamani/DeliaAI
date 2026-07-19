import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  HttpCode,
  PayloadTooLargeException,
  UseGuards
} from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminTokenGuard } from '../crm/admin-token.guard.js';
import { AiService } from './ai.service.js';
import {
  chatInputSchema,
  handoffRequestSchema,
  knowledgeArticleSchema,
  speechRequestSchema,
  startCallSchema
} from './ai.schemas.js';
import { KnowledgeService } from './knowledge.service.js';
import { ReceptionistWorkflowService } from './receptionist-workflow.service.js';
import { confirmActionSchema, prepareActionSchema } from './receptionist-workflow.schemas.js';
import { SpeechService } from './speech.service.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@ApiTags('receptionist')
@Controller('receptionist')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly workflow: ReceptionistWorkflowService,
    private readonly knowledge: KnowledgeService,
    private readonly speechService: SpeechService
  ) {}
  @Post('chat') chat(@Body() body: unknown) {
    return this.ai.chat(parse(chatInputSchema, body));
  }
  @Post('calls') startCall(@Body() body: unknown) {
    parse(startCallSchema, body);
    return this.ai.startCall();
  }
  @Post('actions/prepare') prepareAction(@Body() body: unknown) {
    return this.workflow.prepare(parse(prepareActionSchema, body));
  }
  @Post('actions/confirm') confirmAction(@Body() body: unknown) {
    return this.workflow.confirm(parse(confirmActionSchema, body));
  }
  @Post('handoffs') handoff(@Body() body: unknown) {
    return this.knowledge.createHandoff(parse(handoffRequestSchema, body));
  }
  @Post('speech')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async speech(@Body() body: unknown, @Res() response: Response) {
    const { sessionId } = parse(speechRequestSchema, body);
    const audio = await this.speechService.synthesizeLatestReply(sessionId);
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Cache-Control', 'no-store');
    response.send(audio);
  }
  @Post('transcribe')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async transcribe(@Req() request: Request) {
    return this.speechService.transcribe(
      await readBody(request),
      Number(request.headers['x-audio-duration-seconds']),
      typeof request.headers['x-receptionist-session'] === 'string'
        ? request.headers['x-receptionist-session']
        : undefined
    );
  }
}

function readBody(request: Request, maxBytes = 2_000_000) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    request.on('data', (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > maxBytes) {
        rejected = true;
        reject(new PayloadTooLargeException('Audio must not exceed 2 MB.'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
}

@ApiTags('admin knowledge')
@UseGuards(AdminTokenGuard)
@Controller('admin/knowledge')
export class KnowledgeAdminController {
  constructor(private readonly knowledge: KnowledgeService) {}
  @Get() list() {
    return this.knowledge.list(true);
  }
  @Post() upsert(@Body() body: unknown) {
    return this.knowledge.upsert(parse(knowledgeArticleSchema, body));
  }
  @Get('insights') insights() {
    return this.knowledge.insights();
  }
  @Delete(':slug') remove(@Param('slug') slug: string) {
    return this.knowledge.remove(slug);
  }
}
