import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { ALL_PERMS, type PermKey, type Role } from "@/lib/permissions";
import {
  authenticate,
  findUser,
  isInvited,
  isOwnerEmail,
  normalizeEmail,
} from "@/lib/portal-users";

/**
 * The full Node-side auth config.
 *
 * Two ways in:
 *  - Google, for the owner and anyone the owner has invited.
 *  - Email + password issued by the owner, for staff without a Google account.
 *
 * Both funnel through the same signIn gate: an address that is neither an
 * owner nor an invited member is refused, so a stray Google account cannot
 * wander into the portal.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    ...authConfig.providers,

    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const email = typeof raw?.email === "string" ? raw.email : "";
        const password = typeof raw?.password === "string" ? raw.password : "";
        if (!email || !password) return null;

        const user = await authenticate(email, password);
        if (!user) return null;

        return {
          id: user.email,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user }) {
      const email = normalizeEmail(user?.email ?? "");
      if (!email) return false;
      // The allow-list is the whole access model. Everything downstream trusts
      // that whoever holds a session was deliberately let in.
      return isInvited(email);
    },

    /**
     * Bake role and permissions into the token at sign-in.
     *
     * This is what lets the proxy gate every route without a database round
     * trip. The cost is staleness: a permission change takes effect when the
     * member next signs in. `trigger === "update"` lets the team screen force
     * a refresh for the current user.
     */
    async jwt({ token, user, trigger }) {
      const shouldLoad = Boolean(user) || trigger === "update" || !token.role;
      if (!shouldLoad) return token;

      const email = normalizeEmail(
        (user?.email as string | undefined) ?? (token.email as string) ?? "",
      );
      if (!email) return token;

      if (isOwnerEmail(email)) {
        token.role = "owner" satisfies Role;
        token.permissions = [...ALL_PERMS];
        return token;
      }

      const record = await findUser(email);
      token.role = (record?.role ?? "member") as Role;
      token.permissions = (record?.permissions ?? []) as PermKey[];
      return token;
    },
  },
});
