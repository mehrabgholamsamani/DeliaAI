import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Prisma, ReceptionistAction, ReceptionistDraftStatus } from '@prisma/client';
import { CrmService } from '../crm/crm.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { z } from 'zod';
import type { confirmActionSchema, prepareActionSchema } from './receptionist-workflow.schemas.js';

type PrepareInput = z.infer<typeof prepareActionSchema>;
type ConfirmInput = z.infer<typeof confirmActionSchema>;

const DraftState = Annotation.Root({
  sessionId: Annotation<string>,
  action: Annotation<ReceptionistAction>,
  payload: Annotation<Record<string, unknown>>,
  draftId: Annotation<string>,
  confirmationText: Annotation<string>
});

@Injectable()
export class ReceptionistWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService
  ) {}

  async prepare(input: PrepareInput, workspaceId = 'legacy') {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: input.sessionId, workspaceId },
      select: { id: true, context: true }
    });
    if (!session) throw new NotFoundException('Conversation session was not found');
    const action = input.action as ReceptionistAction;
    const graph = new StateGraph(DraftState)
      .addNode('persist_draft', async (state) => {
        const draft = await this.prisma.receptionistActionDraft.create({
          data: {
            sessionId: state.sessionId,
            action: state.action,
            payload: state.payload as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 1000 * 60 * 10)
          }
        });
        return {
          draftId: draft.id,
          confirmationText: this.describeAction(state.action, state.payload)
        };
      })
      .addEdge(START, 'persist_draft')
      .addEdge('persist_draft', END)
      .compile();
    const result = await graph.invoke({
      sessionId: input.sessionId,
      action,
      payload: input.payload
    });
    await this.prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        context: {
          ...conversationContext(session.context),
          bookingStatus: 'active',
          bookingStage: 'awaiting_confirmation',
          activeDraftId: result.draftId,
          ...('appointmentAt' in input.payload && typeof input.payload.appointmentAt === 'string'
            ? { selectedAppointmentAt: input.payload.appointmentAt }
            : {})
        } as Prisma.InputJsonValue
      }
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'receptionist.draft.prepare',
        targetType: 'receptionistActionDraft',
        targetId: result.draftId,
        actorType: 'visitor',
        actorId: input.sessionId,
        metadata: { action }
      }
    });
    return {
      draftId: result.draftId,
      confirmationText: result.confirmationText,
      expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
      requiresConfirmation: true
    };
  }

  async confirm(input: ConfirmInput, workspaceId = 'legacy') {
    const draft = await this.prisma.receptionistActionDraft.findFirst({
      where: {
        id: input.draftId,
        sessionId: input.sessionId
      }
    });
    if (!draft) throw new NotFoundException('The confirmation request is invalid or expired');
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: draft.sessionId, workspaceId },
      select: { id: true, context: true }
    });
    if (!session) throw new NotFoundException('The confirmation request is invalid or expired');
    if (draft.status === ReceptionistDraftStatus.EXECUTED && draft.executionResult)
      return draft.executionResult;
    if (draft.expiresAt <= new Date())
      throw new NotFoundException('The confirmation request is invalid or expired');
    if (draft.status !== ReceptionistDraftStatus.PENDING_CONFIRMATION)
      throw new ConflictException('This confirmation is already being processed');
    const claimed = await this.prisma.receptionistActionDraft.updateMany({
      where: {
        id: draft.id,
        status: ReceptionistDraftStatus.PENDING_CONFIRMATION,
        expiresAt: { gt: new Date() }
      },
      data: { status: ReceptionistDraftStatus.EXECUTING }
    });
    if (claimed.count !== 1)
      throw new ConflictException('This confirmation is already being processed');
    let result: unknown;
    try {
      if (draft.action === ReceptionistAction.CREATE_BOOKING)
        result = await this.crm.createBooking(draft.payload as never, workspaceId);
      else if (draft.action === ReceptionistAction.UPDATE_BOOKING) {
        await this.crm.assertManagedBookingWorkspace(
          (draft.payload as { token: string }).token,
          workspaceId
        );
        result = await this.crm.updateManagedBooking(draft.payload as never);
      } else if (draft.action === ReceptionistAction.CANCEL_BOOKING) {
        await this.crm.assertManagedBookingWorkspace(
          (draft.payload as { token: string }).token,
          workspaceId
        );
        result = await this.crm.cancelManagedBooking((draft.payload as { token: string }).token);
      } else throw new ConflictException('Unsupported receptionist action');
    } catch (error) {
      await this.prisma.receptionistActionDraft.updateMany({
        where: { id: draft.id, status: ReceptionistDraftStatus.EXECUTING },
        data: { status: ReceptionistDraftStatus.PENDING_CONFIRMATION }
      });
      throw error;
    }
    await this.prisma.$transaction([
      this.prisma.receptionistActionDraft.update({
        where: { id: draft.id },
        data: {
          status: ReceptionistDraftStatus.EXECUTED,
          executionResult: result as Prisma.InputJsonValue
        }
      }),
      this.prisma.conversationSession.update({
        where: { id: session.id },
        data: {
          context: {
            ...conversationContext(session.context),
            bookingStatus: 'idle',
            bookingStage: 'completed',
            activeDraftId: null
          } as Prisma.InputJsonValue
        }
      }),
      this.prisma.auditLog.create({
        data: {
          action: 'receptionist.draft.execute',
          targetType: 'receptionistActionDraft',
          targetId: draft.id,
          actorType: 'visitor',
          actorId: input.sessionId,
          metadata: { action: draft.action }
        }
      })
    ]);
    return result;
  }

  private describeAction(action: ReceptionistAction, payload: Record<string, unknown>) {
    if (action === ReceptionistAction.CREATE_BOOKING)
      return `Please confirm: book ${(payload as { name: string }).name} at ${(payload as { appointmentAt: string }).appointmentAt}. We will use email ${(payload as { email: string }).email} and phone ${(payload as { phone: string }).phone}.`;
    if (action === ReceptionistAction.UPDATE_BOOKING)
      return `Please confirm: update the booking to ${(payload as { appointmentAt: string }).appointmentAt}.`;
    return 'Please confirm: cancel this booking.';
  }
}

function conversationContext(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
