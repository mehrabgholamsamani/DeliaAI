import { describe, expect, it } from 'vitest';
import type { ReceptionistReply } from '@receptionist/contracts';
import { AiService } from './ai.service.js';

type SafetyRailSubject = {
  blockUnsupportedClaims(
    reply: ReceptionistReply,
    message: string,
    articles: { slug: string; title: string; content: string }[]
  ): void;
  executeConversationPlan(
    reply: ReceptionistReply,
    state: {
      bookingStatus: 'idle' | 'active' | 'paused';
      bookingStage?: 'collecting' | 'choosing_time' | 'awaiting_confirmation' | 'completed';
    }
  ): ReceptionistReply;
};

function subject() {
  return new AiService({ get: () => undefined } as never, {} as never, {} as never, {} as never);
}

function reply(): ReceptionistReply {
  return {
    spokenText: 'Yes, there is parking.',
    displayText: 'Yes, there is parking.',
    intent: 'question',
    suggestedActions: [],
    requiresConfirmation: false,
    endCall: false,
    plan: { action: 'ANSWER', confidence: 'high', workflowStatus: 'idle' },
    citedKnowledgeIds: []
  };
}

describe('AiService safety rails', () => {
  it('blocks an unsupported accessibility or parking claim', () => {
    const result = reply();
    (subject() as unknown as SafetyRailSubject).blockUnsupportedClaims(
      result,
      'Do you have parking and wheelchair access?',
      []
    );
    expect(result.intent).toBe('handoff');
    expect(result.spokenText).toContain("don't have that detail");
  });

  it('does not convert a cancellation intent into a new booking action', () => {
    const result = reply();
    result.intent = 'cancel_booking';
    const planned = (subject() as unknown as SafetyRailSubject).executeConversationPlan(result, {
      bookingStatus: 'idle'
    });
    expect(planned.plan?.action).toBe('HANDOFF');
  });

  it('does not reopen availability while a selected time awaits confirmation', () => {
    const planned = (subject() as unknown as SafetyRailSubject).executeConversationPlan(reply(), {
      bookingStatus: 'active',
      bookingStage: 'awaiting_confirmation'
    });
    expect(planned.plan?.action).toBe('ANSWER');
  });
});
