// Phase 1 — Better Auth handles all auth routes via auth.handler().
// This file mounts the Better Auth request handler under /api/auth/*.
// Wired up in src/index.ts once middleware is in place.
import { Router } from 'express';
import { auth } from '../auth';
import { toNodeHandler } from 'better-auth/node';

export const authRouter = Router();

// Better Auth handles everything under /api/auth/** (sign-in, sign-up, OAuth callbacks, sessions)
authRouter.all('/*', toNodeHandler(auth));
