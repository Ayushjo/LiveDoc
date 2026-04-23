import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
});

export const { signIn, signUp, signOut, useSession, resetPassword } = authClient;

// Alias: better-auth v1 uses requestPasswordReset (not forgetPassword)
export const forgetPassword = authClient.requestPasswordReset;
