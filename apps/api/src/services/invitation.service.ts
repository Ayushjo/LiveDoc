import { randomBytes } from 'crypto';
import { db } from '../db';
import { sendInvitationEmail } from '../lib/email';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors';
import type { WorkspaceRole } from '@prisma/client';

const INVITATION_TTL_DAYS = 7;

// ─── Service ──────────────────────────────────────────────────────────────────

export const invitationService = {
  /**
   * Creates an invitation and sends the invite email.
   * Requires ADMIN or OWNER role. Prevents duplicate pending invitations.
   */
  async invite(
    workspaceId: string,
    actorId: string,
    email: string,
    role: WorkspaceRole,
  ) {
    // Permission check
    const actor = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
      select: { role: true, user: { select: { name: true } } },
    });

    if (!actor) throw new NotFoundError('Workspace');
    if (actor.role === 'MEMBER') {
      throw new ForbiddenError('Only ADMINs and OWNERs can invite members');
    }

    // Prevent inviting someone already in the workspace
    const existingMember = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        workspaces: { where: { workspaceId }, select: { id: true } },
      },
    });

    if (existingMember?.workspaces.length) {
      throw new ConflictError('This person is already a member of this workspace');
    }

    // Cancel any existing pending invitation for this email
    await db.workspaceInvitation.deleteMany({
      where: {
        workspaceId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    // Create the invitation
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await db.workspaceInvitation.create({
      data: {
        workspaceId,
        email,
        role,
        token,
        invitedById: actorId,
        expiresAt,
      },
      include: {
        workspace: { select: { name: true } },
      },
    });

    // Send the invite email
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const acceptUrl = `${frontendUrl}/invite/${token}`;

    await sendInvitationEmail({
      to: email,
      inviterName: actor.user.name,
      workspaceName: invitation.workspace.name,
      role,
      acceptUrl,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  },

  /**
   * Returns details of a pending invitation by token (public — no auth required).
   * Used to render the accept-invitation page for the invitee.
   */
  async getByToken(token: string) {
    const invitation = await db.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: { select: { id: true, name: true } },
      },
    });

    if (!invitation) throw new NotFoundError('Invitation');
    if (invitation.acceptedAt) throw new BadRequestError('This invitation has already been accepted');
    if (invitation.expiresAt < new Date()) throw new BadRequestError('This invitation has expired');

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      workspaceId: invitation.workspace.id,
      workspaceName: invitation.workspace.name,
      expiresAt: invitation.expiresAt,
    };
  },

  /**
   * Accepts an invitation. The authenticated user's email must match the invite email.
   * Adds the user as a workspace member and marks the invitation accepted.
   */
  async accept(token: string, userId: string) {
    const invitation = await db.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, name: true } } },
    });

    if (!invitation) throw new NotFoundError('Invitation');
    if (invitation.acceptedAt) throw new BadRequestError('This invitation has already been accepted');
    if (invitation.expiresAt < new Date()) throw new BadRequestError('This invitation has expired');

    // Verify accepting user's email matches invite
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) throw new NotFoundError('User');
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenError(
        `This invitation was sent to ${invitation.email}. Please sign in with that email address.`,
      );
    }

    // Already a member? Just mark accepted and return
    const alreadyMember = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
    });

    await db.$transaction(async (tx) => {
      if (!alreadyMember) {
        await tx.workspaceMember.create({
          data: {
            workspaceId: invitation.workspaceId,
            userId,
            role: invitation.role,
          },
        });
      }

      await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    });

    return { workspaceId: invitation.workspaceId, workspaceName: invitation.workspace.name };
  },

  /**
   * Cancels a pending invitation. Requires ADMIN+ role.
   */
  async cancel(workspaceId: string, invitationId: string, actorId: string) {
    const actor = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
      select: { role: true },
    });

    if (!actor) throw new NotFoundError('Workspace');
    if (actor.role === 'MEMBER') {
      throw new ForbiddenError('Only ADMINs and OWNERs can cancel invitations');
    }

    const invitation = await db.workspaceInvitation.findUnique({
      where: { id: invitationId },
      select: { workspaceId: true },
    });

    if (!invitation || invitation.workspaceId !== workspaceId) {
      throw new NotFoundError('Invitation');
    }

    await db.workspaceInvitation.delete({ where: { id: invitationId } });
  },

  /**
   * Lists all pending (not expired, not accepted) invitations for a workspace.
   */
  async list(workspaceId: string, actorId: string) {
    const actor = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
      select: { role: true },
    });

    if (!actor) throw new NotFoundError('Workspace');

    return db.workspaceInvitation.findMany({
      where: {
        workspaceId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
