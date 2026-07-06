import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { ConversationRole, Prisma } from '@prisma/client';
import { receptionistReplySchema, type ReceptionistReply } from '@receptionist/contracts';
import { ConfigService } from '@nestjs/config';
import {
  RECEPTIONIST_SYSTEM_PROMPT,
  RECEPTIONIST_SYSTEM_PROMPT_VERSION,
  RECEPTIONIST_PERSONAS,
  receptionistPersonaById,
  type ReceptionistPersona
} from '@receptionist/prompts';
import { CrmService } from '../crm/crm.service.js';
import type { Environment } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { KnowledgeService } from './knowledge.service.js';

const replyJsonSchema = {
  type: 'object',
  properties: {
    spokenText: { type: 'string' },
    displayText: { type: 'string' },
    intent: {
      type: 'string',
      enum: ['question', 'booking', 'update_booking', 'cancel_booking', 'handoff', 'unknown']
    },
    suggestedActions: { type: 'array', items: { type: 'string' } },
    requiresConfirmation: { type: 'boolean' },
    endCall: { type: 'boolean' },
    plan: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'ANSWER',
            'COLLECT_BOOKING_DETAILS',
            'OFFER_AVAILABILITY',
            'PAUSE_BOOKING',
            'RESUME_BOOKING',
            'CORRECT_CONTACT',
            'REQUEST_CALLBACK',
            'HANDOFF',
            'CLARIFY',
            'RECOVER'
          ]
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        workflowStatus: { type: 'string', enum: ['idle', 'active', 'paused'] }
      },
      required: ['action', 'confidence', 'workflowStatus']
    },
    citedKnowledgeIds: { type: 'array', items: { type: 'string' } },
    bookingDetails: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        serviceQuery: { type: 'string' },
        wantsEarliest: { type: 'boolean' },
        readyToReview: { type: 'boolean' }
      }
    }
  },
  required: [
    'spokenText',
    'displayText',
    'intent',
    'suggestedActions',
    'requiresConfirmation',
    'endCall',
    'plan',
    'citedKnowledgeIds'
  ]
};

type ConversationState = {
  name?: string;
  email?: string;
  phone?: string;
  serviceQuery?: string;
  wantsEarliest?: boolean;
  bookingRequested?: boolean;
  bookingStatus?: 'idle' | 'active' | 'paused';
  personaId?: string;
  lastIntent?: string;
  clarificationCount?: number;
};

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly crm: CrmService
  ) {}

  async chat(input: {
    sessionId?: string;
    message: string;
    workspaceId?: string;
  }): Promise<{ sessionId: string; reply: ReceptionistReply }> {
    const workspaceId = input.workspaceId || 'legacy';
    const session = input.sessionId
      ? await this.prisma.conversationSession.findFirst({
          where: { id: input.sessionId, workspaceId }
        })
      : await this.prisma.conversationSession.create({ data: { workspaceId } });
    if (!session) throw new ServiceUnavailableException('Conversation session was not found');
    const existingState = this.readConversationState(session.context);
    const persona = receptionistPersonaById(existingState.personaId);
    if (isFarewell(input.message)) return this.saveClosing(session.id, persona);
    const socialSignal = classifySocialSignal(input.message);
    if (socialSignal)
      return this.saveSocialReply(session.id, input.message, existingState, persona, socialSignal);
    const messageCount = await this.prisma.conversationMessage.count({
      where: { sessionId: session.id }
    });
    if (messageCount >= 40)
      throw new HttpException(
        'This conversation has reached its limit. Please start a new chat.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    const [business, services, articles, history] = await Promise.all([
      this.crm.getBusiness(workspaceId),
      this.crm.listServices(false, workspaceId),
      this.knowledge.relevantFor(input.message, workspaceId),
      this.prisma.conversationMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' },
        take: 10
      })
    ]);
    const lastAssistantMessage = [...history]
      .reverse()
      .find((message) => message.role === ConversationRole.ASSISTANT)?.content;
    const bookingStatus = nextBookingStatus(
      input.message,
      existingState.bookingStatus,
      existingState.bookingRequested
    );
    const conversationState = {
      ...existingState,
      personaId: persona.id,
      ...extractContactDetails(input.message, expectedContactField(lastAssistantMessage)),
      bookingStatus,
      bookingRequested: bookingStatus === 'active'
    };
    await this.prisma.conversationMessage.create({
      data: { sessionId: session.id, role: ConversationRole.USER, content: input.message }
    });
    const apiKey = this.config.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey)
      return this.saveFallback(
        session.id,
        'The receptionist is temporarily unavailable. Please use the booking page or ask a team member for help.',
        {
          action: 'RECOVER',
          confidence: 'low',
          workflowStatus: conversationState.bookingStatus || 'idle'
        },
        conversationState
      );
    const context = articles
      .map((article) => `[${article.slug}] ${article.title}: ${article.content}`)
      .join('\n\n');
    const transcript = history.map((message) => `${message.role}: ${message.content}`).join('\n');
    const serviceList = services.map((service) => `${service.name} (${service.slug})`).join(', ');
    const prompt = `${RECEPTIONIST_SYSTEM_PROMPT}\nPrompt version: ${RECEPTIONIST_SYSTEM_PROMPT_VERSION}\nBusiness: ${business.businessName}. ${business.companyDescription}\nTimezone: ${business.timezone}. Available services: ${serviceList}.\nReceptionist persona: ${persona.name}; ${persona.personality}. Natural catchphrases: ${persona.catchphrases.join(' ')}. Stay in this persona for the whole call; use a catchphrase occasionally, not in every answer.\nGreeting: ${business.greeting}\nTone: ${business.assistantTone}\nBooking instructions: ${business.bookingInstructions}\nHandoff instructions: ${business.handoffInstructions}\nContact details: ${business.contactDetails || '(not configured)'}\n\nApproved knowledge only:\n${context}\n\nCompact conversation state: ${JSON.stringify(conversationState)}\nConversation summary: ${session.summary || '(none)'}\nRecent transcript:\n${transcript}\n\nUser message: ${input.message}\n\nReturn only JSON following the requested schema. Keep spokenText concise: normally one or two natural sentences, then one focused follow-up question when needed. Never claim booking changes are complete. Booking status is authoritative: if it is paused, answer the caller's new request without asking for booking details; only resume when they ask to continue or make a new booking request. For booking requests with active status, use the compact state, never ask for a detail already known, and ask for only the next missing detail. Populate bookingDetails with every known name, email, phone, serviceQuery, and wantsEarliest value. Set readyToReview only after the visitor explicitly confirms the collected details. Set plan.action to the best next conversational action and plan.confidence honestly. The backend validates the plan and is the only component allowed to perform booking mutations. If no approved answer exists, the visitor asks for a person, or confidence is low, use handoff or clarify and invite them to request a callback. Cite only the provided article slugs.`;
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: this.config.get('GEMINI_MODEL', { infer: true }),
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: replyJsonSchema,
          temperature: 0.2,
          maxOutputTokens: 220
        }
      });
      const generatedReply = receptionistReplySchema.parse(JSON.parse(response.text || '{}'));
      const plannedReply = this.executeConversationPlan(generatedReply, conversationState);
      const reply = this.enforceBookingProgress(
        plannedReply,
        conversationState,
        business.assistantTone
      );
      reply.receptionist = { id: persona.id, name: persona.name };
      const approvedIds = new Set(articles.map((article) => article.slug));
      reply.citedKnowledgeIds = reply.citedKnowledgeIds.filter((id) => approvedIds.has(id));
      await this.prisma.$transaction([
        this.prisma.conversationMessage.create({
          data: {
            sessionId: session.id,
            role: ConversationRole.ASSISTANT,
            content: reply.spokenText
          }
        }),
        this.prisma.conversationSession.update({
          where: { id: session.id },
          data: {
            summary: `${input.message.slice(0, 350)} | ${reply.displayText.slice(0, 350)}`,
            context: this.nextConversationState(conversationState, reply) as Prisma.InputJsonValue
          }
        }),
        this.prisma.aiUsageRecord.create({
          data: {
            sessionId: session.id,
            model: this.config.get('GEMINI_MODEL', { infer: true }),
            promptTokens: response.usageMetadata?.promptTokenCount,
            outputTokens: response.usageMetadata?.candidatesTokenCount
          }
        })
      ]);
      await this.prisma.auditLog.create({
        data: {
          action: 'ai.chat',
          targetType: 'conversationSession',
          targetId: session.id,
          actorType: 'visitor',
          workspaceId,
          metadata: {
            model: this.config.get('GEMINI_MODEL', { infer: true }),
            citations: reply.citedKnowledgeIds
          }
        }
      });
      if (reply.intent === 'handoff' || reply.intent === 'unknown')
        await this.prisma.receptionistFeedback.create({
          data: { question: input.message, sessionId: session.id, workspaceId }
        });
      return { sessionId: session.id, reply };
    } catch (error) {
      console.warn(
        'Receptionist generation failed',
        error instanceof Error ? error.message : 'unknown error'
      );
      return this.saveFallback(
        session.id,
        this.recoveryReply(conversationState, input.message),
        this.recoveryPlan(conversationState, input.message),
        conversationState
      );
    }
  }

  async startCall(
    workspaceId = 'legacy'
  ): Promise<{ sessionId: string; reply: ReceptionistReply }> {
    const business = await this.crm.getBusiness(workspaceId);
    const persona = business.receptionistPersonaId === 'random'
      ? RECEPTIONIST_PERSONAS[Math.floor(Math.random() * RECEPTIONIST_PERSONAS.length)]
      : receptionistPersonaById(business.receptionistPersonaId);
    const session = await this.prisma.conversationSession.create({
      data: { workspaceId, context: { personaId: persona.id } }
    });
    const reply: ReceptionistReply = {
      spokenText: persona.introduction,
      displayText: persona.introduction,
      intent: 'question',
      suggestedActions: [],
      requiresConfirmation: false,
      endCall: false,
      plan: { action: 'ANSWER', confidence: 'high', workflowStatus: 'idle' },
      citedKnowledgeIds: [],
      receptionist: { id: persona.id, name: persona.name }
    };
    await this.prisma.conversationMessage.create({
      data: { sessionId: session.id, role: ConversationRole.ASSISTANT, content: reply.spokenText }
    });
    return { sessionId: session.id, reply };
  }

  private async saveFallback(
    sessionId: string,
    message: string,
    plan: NonNullable<ReceptionistReply['plan']>,
    state?: ConversationState
  ) {
    const reply: ReceptionistReply = {
      spokenText: message,
      displayText: message,
      intent: 'handoff',
      suggestedActions: ['Book an appointment'],
      requiresConfirmation: false,
      endCall: false,
      plan,
      citedKnowledgeIds: []
    };
    await this.prisma.conversationMessage.create({
      data: { sessionId, role: ConversationRole.ASSISTANT, content: message }
    });
    if (state)
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: { context: { ...state, bookingStatus: plan.workflowStatus } as Prisma.InputJsonValue }
      });
    return { sessionId, reply };
  }

  private async saveClosing(sessionId: string, persona: ReceptionistPersona) {
    const business = await this.crm.getBusiness();
    const message = `Thanks for calling ${business.businessName}. ${persona.catchphrases[0]} Take care, and goodbye.`;
    const reply: ReceptionistReply = {
      spokenText: message,
      displayText: message,
      intent: 'question',
      suggestedActions: [],
      requiresConfirmation: false,
      endCall: true,
      plan: { action: 'ANSWER', confidence: 'high', workflowStatus: 'idle' },
      citedKnowledgeIds: [],
      receptionist: { id: persona.id, name: persona.name }
    };
    await this.prisma.conversationMessage.create({
      data: { sessionId, role: ConversationRole.ASSISTANT, content: message }
    });
    return { sessionId, reply };
  }

  private async saveSocialReply(
    sessionId: string,
    input: string,
    state: ConversationState,
    persona: ReceptionistPersona,
    signal: SocialSignal
  ) {
    const shouldPause =
      state.bookingStatus === 'active' && signal !== 'compliment' && signal !== 'voice_feedback';
    const workflowStatus = shouldPause ? 'paused' : state.bookingStatus || 'idle';
    const message = socialResponse(signal, shouldPause);
    const reply: ReceptionistReply = {
      spokenText: message,
      displayText: message,
      intent: 'question',
      suggestedActions: shouldPause ? ['Continue booking', 'Request a callback'] : [],
      requiresConfirmation: false,
      endCall: false,
      plan: {
        action: shouldPause ? 'PAUSE_BOOKING' : 'ANSWER',
        confidence: 'high',
        workflowStatus
      },
      citedKnowledgeIds: [],
      receptionist: { id: persona.id, name: persona.name }
    };
    await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: { sessionId, role: ConversationRole.USER, content: input }
      }),
      this.prisma.conversationMessage.create({
        data: { sessionId, role: ConversationRole.ASSISTANT, content: message }
      }),
      this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          summary: `${input.slice(0, 350)} | ${message.slice(0, 350)}`,
          context: {
            ...state,
            bookingStatus: workflowStatus,
            bookingRequested: workflowStatus === 'active'
          } as Prisma.InputJsonValue
        }
      })
    ]);
    return { sessionId, reply };
  }

  private recoveryReply(state: ConversationState, message: string) {
    if (state.bookingStatus === 'paused') {
      if (/\b(?:sofia|talk|speak|transfer|callback|phone)\b/i.test(message))
        return 'I cannot share private phone numbers, but I can ask a team member to call you back. Would you like that?';
      return 'I have paused the booking while I help with that. Would you like to continue the booking afterward?';
    }
    if (state.serviceQuery && !state.name)
      return `I have the ${state.serviceQuery} request. What name should I use for the booking?`;
    if (state.name && !state.phone)
      return `Thanks, ${state.name}. What phone number is best for the booking?`;
    if (state.name && state.phone && !state.email)
      return `Great, ${state.name}. What email should I send the confirmation to?`;
    return 'I want to make sure I help with the right thing. Are you looking to book, check availability, or ask about a service?';
  }

  private recoveryPlan(
    state: ConversationState,
    message: string
  ): NonNullable<ReceptionistReply['plan']> {
    if (state.bookingStatus === 'paused')
      return {
        action: /\b(?:sofia|talk|speak|transfer|callback|phone)\b/i.test(message)
          ? 'REQUEST_CALLBACK'
          : 'RECOVER',
        confidence: 'medium',
        workflowStatus: 'paused'
      };
    return {
      action: state.bookingStatus === 'active' ? 'COLLECT_BOOKING_DETAILS' : 'RECOVER',
      confidence: 'low',
      workflowStatus: state.bookingStatus || 'idle'
    };
  }

  private readConversationState(value: unknown): ConversationState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const source = value as Record<string, unknown>;
    return {
      ...(typeof source.name === 'string' ? { name: source.name } : {}),
      ...(typeof source.email === 'string' ? { email: source.email } : {}),
      ...(typeof source.phone === 'string' ? { phone: source.phone } : {}),
      ...(typeof source.serviceQuery === 'string' ? { serviceQuery: source.serviceQuery } : {}),
      ...(typeof source.wantsEarliest === 'boolean' ? { wantsEarliest: source.wantsEarliest } : {}),
      ...(typeof source.bookingRequested === 'boolean'
        ? { bookingRequested: source.bookingRequested }
        : {}),
      ...(source.bookingStatus === 'idle' ||
      source.bookingStatus === 'active' ||
      source.bookingStatus === 'paused'
        ? { bookingStatus: source.bookingStatus }
        : {}),
      ...(typeof source.personaId === 'string' ? { personaId: source.personaId } : {}),
      ...(typeof source.lastIntent === 'string' ? { lastIntent: source.lastIntent } : {}),
      ...(typeof source.clarificationCount === 'number'
        ? { clarificationCount: source.clarificationCount }
        : {})
    };
  }

  private nextConversationState(
    state: ConversationState,
    reply: ReceptionistReply
  ): ConversationState {
    const details = reply.bookingDetails;
    const clarificationCount = reply.intent === 'unknown' ? (state.clarificationCount ?? 0) + 1 : 0;
    return {
      ...state,
      ...(details?.name ? { name: details.name } : {}),
      ...(details?.email ? { email: details.email } : {}),
      ...(details?.phone ? { phone: details.phone } : {}),
      ...(details?.serviceQuery ? { serviceQuery: details.serviceQuery } : {}),
      ...(details?.wantsEarliest !== undefined ? { wantsEarliest: details.wantsEarliest } : {}),
      ...(state.personaId ? { personaId: state.personaId } : {}),
      bookingStatus: reply.plan?.workflowStatus || state.bookingStatus || 'idle',
      bookingRequested: (reply.plan?.workflowStatus || state.bookingStatus) === 'active',
      lastIntent: reply.intent,
      clarificationCount
    };
  }

  private enforceBookingProgress(
    reply: ReceptionistReply,
    state: ConversationState,
    assistantTone: string
  ): ReceptionistReply {
    if (state.bookingStatus !== 'active') return reply;
    const bookingDetails = {
      ...reply.bookingDetails,
      ...(state.name ? { name: state.name } : {}),
      ...(state.email ? { email: state.email } : {}),
      ...(state.phone ? { phone: state.phone } : {})
    };
    const readyToReview = Boolean(state.name && state.email && state.phone);
    const acknowledgement = toneAcknowledgement(assistantTone);
    if (readyToReview)
      return {
        ...reply,
        intent: 'booking',
        requiresConfirmation: true,
        bookingDetails: { ...bookingDetails, readyToReview: true },
        spokenText: `${acknowledgement} I have your details. Choose a live time in the booking card, then review and confirm it.`,
        displayText: `${acknowledgement} I have your details. Choose a live time below, then review and confirm your booking.`
      };
    const missing = !state.name ? 'name' : !state.phone ? 'phone number' : 'email address';
    return {
      ...reply,
      intent: 'booking',
      bookingDetails: { ...bookingDetails, readyToReview: false },
      spokenText: `${acknowledgement} What ${missing} should I use for the booking?`,
      displayText: `${acknowledgement} What ${missing} should I use for the booking?`
    };
  }

  private executeConversationPlan(
    reply: ReceptionistReply,
    state: ConversationState
  ): ReceptionistReply {
    const status = state.bookingStatus || (state.bookingRequested ? 'active' : 'idle');
    const hasNewContact = Boolean(
      (reply.bookingDetails?.name && reply.bookingDetails.name !== state.name) ||
      (reply.bookingDetails?.email && reply.bookingDetails.email !== state.email) ||
      (reply.bookingDetails?.phone && reply.bookingDetails.phone !== state.phone)
    );
    let action = reply.plan?.action || 'ANSWER';
    if (reply.intent === 'handoff') action = 'REQUEST_CALLBACK';
    else if (status === 'paused') action = reply.intent === 'unknown' ? 'CLARIFY' : 'ANSWER';
    else if (hasNewContact) action = 'CORRECT_CONTACT';
    else if (status === 'active')
      action =
        state.name && state.email && state.phone ? 'OFFER_AVAILABILITY' : 'COLLECT_BOOKING_DETAILS';
    else if (reply.intent === 'unknown' || reply.plan?.confidence === 'low') action = 'CLARIFY';
    return {
      ...reply,
      plan: {
        action,
        confidence: action === 'CLARIFY' ? 'low' : reply.plan?.confidence || 'medium',
        workflowStatus: status
      }
    };
  }
}

function isFarewell(message: string) {
  return /\b(?:goodbye|bye(?:\s+bye)?|that(?:'s| is) all|that's it|no,? thank you|no thanks|have a (?:good|nice) day)\b/i.test(
    message
  );
}

function extractContactDetails(
  message: string,
  expectedField?: 'name' | 'email' | 'phone'
): Pick<ConversationState, 'name' | 'email' | 'phone'> {
  let name = message
    .match(
      /\b(?:my name is|this is|i am|i'm|im|change (?:my )?name to|call me|use (?:the name )?)\s+([a-z][a-z '-]{1,60})/i
    )?.[1]
    ?.replace(/\b(?:and|my phone|my email)\b.*$/i, '')
    .trim();
  if (!name && expectedField === 'name' && /^[a-z][a-z '-]{1,60}$/i.test(message.trim()))
    name = message.trim();
  const emailCandidate = message
    .toLowerCase()
    .replace(/\s+(?:at)\s+/g, '@')
    .replace(/\s+(?:dot|point)\s+/g, '.')
    .replace(/\s+/g, '');
  const email = emailCandidate.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0];
  const words: Record<string, string> = {
    zero: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    oh: '0'
  };
  const normalizedPhone = message
    .toLowerCase()
    .replace(
      /\b(zero|one|two|three|four|five|six|seven|eight|nine|oh)\b/g,
      (_, word: string) => words[word]
    );
  const digits = normalizedPhone.replace(/\D/g, '');
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(digits.length >= 7 && digits.length <= 15 ? { phone: digits } : {})
  };
}

function expectedContactField(
  lastAssistantMessage?: string
): 'name' | 'email' | 'phone' | undefined {
  if (!lastAssistantMessage) return undefined;
  if (/\b(?:what|which) (?:name|name should)/i.test(lastAssistantMessage)) return 'name';
  if (/\b(?:phone|number)\b/i.test(lastAssistantMessage)) return 'phone';
  if (/\b(?:email|e-mail)\b/i.test(lastAssistantMessage)) return 'email';
  return undefined;
}

function isBookingRequest(message: string) {
  return /\b(?:book|booking|appointment|reserve|reservation|schedule)\b/i.test(message);
}

function nextBookingStatus(
  message: string,
  previous: ConversationState['bookingStatus'],
  legacyBookingRequested?: boolean
): NonNullable<ConversationState['bookingStatus']> {
  if (
    /\b(?:never mind|forget (?:it|the booking)|stop booking|cancel (?:this |the )?booking|start over)\b/i.test(
      message
    )
  )
    return 'idle';
  if (
    /\b(?:continue|carry on|resume|back to (?:the )?booking)\b/i.test(message) ||
    isBookingRequest(message)
  )
    return 'active';
  const current = previous || (legacyBookingRequested ? 'active' : 'idle');
  if (current === 'active' && isBookingInterruption(message)) return 'paused';
  return current;
}

function isBookingInterruption(message: string) {
  if (
    /\b(?:my name is|this is|i am|i'm|im|change (?:my )?(?:name|email|phone)|my (?:email|phone)|first|second|third|yes|no)\b/i.test(
      message
    )
  )
    return false;
  return /\b(?:actually|by the way|before that|instead|can you|could you|would you|who is|what is|where is|how much|talk|speak|transfer|give .*?(?:phone|number))\b/i.test(
    message
  );
}

type SocialSignal = 'grief' | 'frustration' | 'illness' | 'compliment' | 'voice_feedback';

function classifySocialSignal(message: string): SocialSignal | undefined {
  const text = message.toLowerCase();
  if (
    /\b(?:my|our)\s+(?:cat|dog|pet|mum|mom|mother|dad|father|friend|partner|family member)\b.{0,40}\b(?:died|dead|passed away|passed)\b|\b(?:lost my)\s+(?:cat|dog|pet|friend|parent)\b/.test(
      text
    )
  )
    return 'grief';
  if (/\b(?:i(?:'m| am) (?:sick|ill)|not feeling well|in hospital|at the hospital)\b/.test(text))
    return 'illness';
  if (
    /\b(?:frustrated|angry|annoyed|upset|this (?:is|isn't|is not) working|this is ridiculous)\b/.test(
      text
    )
  )
    return 'frustration';
  if (
    /\b(?:your voice sounds like|you sound like)\s+(?:a |an )?(?:man|woman|guy|girl|person)\b/.test(
      text
    )
  )
    return 'voice_feedback';
  if (
    /\b(?:thank you|thanks|you(?:'re| are) (?:helpful|great|nice|good)|that(?:'s| is) helpful)\b/.test(
      text
    )
  )
    return 'compliment';
  return undefined;
}

function socialResponse(signal: SocialSignal, paused: boolean) {
  const continuation = paused
    ? ' Would you like to continue later, or pause the booking for now?'
    : '';
  if (signal === 'grief') return `I'm really sorry. Take the time you need.${continuation}`;
  if (signal === 'illness')
    return `I'm sorry you're feeling unwell. Please take care of yourself.${continuation}`;
  if (signal === 'frustration')
    return `I'm sorry this has been frustrating.${continuation || ' I will do my best to make the next step simple.'}`;
  if (signal === 'voice_feedback') return 'Thanks for telling me. I appreciate the feedback.';
  return 'Thank you, I really appreciate that.';
}

function toneAcknowledgement(tone: string) {
  const normalized = tone.toLowerCase();
  if (/casual|friendly|relaxed|conversational|warm/.test(normalized)) return "I've got you.";
  if (/upbeat|energetic/.test(normalized)) return 'Absolutely.';
  return 'Of course.';
}
