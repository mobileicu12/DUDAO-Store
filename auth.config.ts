import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { PermKey, Role } from "@/lib/permissions";

/**
 * The lean half of the auth config.
 *
 * This file is loaded by proxy.ts, which runs on every single request. It must
 * stay free of Prisma, node:crypto and anything else heavy — the proxy only
 * needs to read an already-decoded JWT, never to look a user up.
 *
 * Role and permissions are baked into the token at sign-in (see auth.ts), which
 * is what makes route gating a pure in-memory check.
 */
export const authConfig = {
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },

  callbacks: {
    /** Reshape the decoded token only — no I/O here. */
    session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.role = (token.role as Role) ?? "member";
        session.user.permissions = (token.permissions as PermKey[]) ?? [];
      }
      return session;
    },
  },

  trustHost: true,
} satisfies NextAuthConfig;
