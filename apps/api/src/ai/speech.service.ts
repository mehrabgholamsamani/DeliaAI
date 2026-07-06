import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { v2 } from '@google-cloud/speech';
import { ConversationRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { CrmService } from '../crm/crm.service.js';
import { receptionistPersonaById } from '@receptionist/prompts';

const MAX_REPLY_CHARACTERS = 350;

@Injectable()
export class SpeechService {
  private readonly client = new TextToSpeechClient();
  private readonly speechClient = new v2.SpeechClient({ apiEndpoint: 'eu-speech.googleapis.com' });

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
    private readonly crm: CrmService
  ) {}

  async synthesizeLatestReply(sessionId: string): Promise<Buffer> {
    if (!this.config.get('GOOGLE_TTS_ENABLED', { infer: true }))
      throw new ServiceUnavailableException('Cloud speech is not enabled.');

    const [message, session] = await Promise.all([
      this.prisma.conversationMessage.findFirst({
        where: { sessionId, role: ConversationRole.ASSISTANT },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.conversationSession.findUnique({ where: { id: sessionId }, select: { context: true, workspaceId: true } })
    ]);
    if (!message) throw new ServiceUnavailableException('There is no reply ready to speak.');

    const text = message.content.replace(/\s+/g, ' ').trim().slice(0, MAX_REPLY_CHARACTERS);
    if (!text) throw new ServiceUnavailableException('There is no reply ready to speak.');

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const usage = await this.prisma.speechUsageRecord.aggregate({
      _sum: { characters: true },
      where: { createdAt: { gte: monthStart }, session: { workspaceId: session?.workspaceId || 'legacy' } }
    });
    const limit = this.config.get('GOOGLE_TTS_MONTHLY_CHARACTER_LIMIT', { infer: true });
    if ((usage._sum.characters ?? 0) + text.length > limit)
      throw new HttpException('The cloud voice allowance has been reached.', HttpStatus.TOO_MANY_REQUESTS);

    try {
      const personaId = readPersonaId(session?.context);
      const persona = personaId ? receptionistPersonaById(personaId) : undefined;
      const [response] = await this.client.synthesizeSpeech({
        input: { ssml: spokenSsml(text) },
        voice: {
          languageCode: this.config.get('GOOGLE_TTS_LANGUAGE_CODE', { infer: true }),
          name: persona?.voiceName || this.config.get('GOOGLE_TTS_VOICE', { infer: true })
        },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.1, volumeGainDb: 3 }
      });
      if (!response.audioContent) throw new Error('Cloud TTS returned no audio.');
      await this.prisma.speechUsageRecord.create({ data: { sessionId, characters: text.length } });
      return Buffer.from(response.audioContent as Uint8Array);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Cloud speech is temporarily unavailable.');
    }
  }

  async transcribe(audio: Buffer, durationSeconds: number, sessionId?: string) {
    if (!this.config.get('GOOGLE_STT_ENABLED', { infer: true }))
      throw new ServiceUnavailableException('Cloud transcription is not enabled.');
    if (audio.length < 400 || audio.length > 2_000_000)
      throw new HttpException('Audio must be between 400 bytes and 2 MB.', HttpStatus.BAD_REQUEST);
    const maxTurn = this.config.get('GOOGLE_STT_MAX_TURN_SECONDS', { infer: true });
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > maxTurn)
      throw new HttpException('That turn was too long. Please pause briefly, then continue.', HttpStatus.BAD_REQUEST);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const session = sessionId
      ? await this.prisma.conversationSession.findUnique({ where: { id: sessionId }, select: { id: true, workspaceId: true } })
      : undefined;
    if (sessionId && !session) throw new HttpException('Conversation session was not found.', HttpStatus.BAD_REQUEST);
    const workspaceId = session?.workspaceId || 'legacy';
    const usage = await this.prisma.transcriptionUsageRecord.aggregate({
      _sum: { seconds: true },
      where: { createdAt: { gte: monthStart }, session: { workspaceId } }
    });
    if ((usage._sum.seconds ?? 0) + Math.ceil(durationSeconds) > this.config.get('GOOGLE_STT_MONTHLY_SECONDS_LIMIT', { infer: true }))
      throw new HttpException('The monthly voice transcription allowance has been reached.', HttpStatus.TOO_MANY_REQUESTS);
    const project = this.config.get('GOOGLE_CLOUD_PROJECT', { infer: true });
    if (!project) throw new ServiceUnavailableException('Cloud transcription is not configured.');
    const [business, services] = await Promise.all([this.crm.getBusiness(workspaceId), this.crm.listServices(false, workspaceId)]);
    const phrases = [business.businessName, ...services.map((service) => service.name), 'appointment', 'availability', 'booking', 'reschedule', 'cancel']
      .filter(Boolean)
      .slice(0, 100);
    try {
      const [response] = await this.speechClient.recognize({
        recognizer: `projects/${project}/locations/eu/recognizers/_`,
        config: {
          autoDecodingConfig: {},
          languageCodes: [this.config.get('GOOGLE_STT_LANGUAGE_CODE', { infer: true })],
          model: 'chirp_3',
          features: { enableAutomaticPunctuation: true },
          adaptation: {
            phraseSets: [{ inlinePhraseSet: { phrases: phrases.map((value) => ({ value, boost: 10 })) } }]
          }
        },
        content: audio
      });
      const transcript = response.results?.map((result) => result.alternatives?.[0]?.transcript || '').join(' ').trim();
      await this.prisma.transcriptionUsageRecord.create({ data: { sessionId: session?.id, seconds: Math.ceil(durationSeconds), source: 'chirp_3' } });
      return { transcript, source: 'chirp_3' as const };
    } catch {
      throw new ServiceUnavailableException('Cloud transcription is temporarily unavailable.');
    }
  }
}

function readPersonaId(context: unknown) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return undefined;
  const value = (context as Record<string, unknown>).personaId;
  return typeof value === 'string' ? value : undefined;
}

function spokenSsml(text: string) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<speak><prosody rate="105%">${escaped}</prosody></speak>`;
}
