import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { chatInputSchema } from './ai.schemas.js';
import { AiService } from './ai.service.js';

@WebSocketGateway({
  namespace: '/receptionist',
  cors: {
    origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
    credentials: true
  }
})
export class ReceptionistGateway {
  constructor(private readonly ai: AiService) {}

  @SubscribeMessage('turn')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleTurn(@ConnectedSocket() client: Socket, @MessageBody() raw: unknown) {
    const input = chatInputSchema.parse(raw);
    client.emit('status', { state: 'thinking' });
    const result = await this.ai.chat(input);
    client.emit('reply', result);
    return result;
  }
}
