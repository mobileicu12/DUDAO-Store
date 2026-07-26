import type { PermKey, Role } from "@/lib/permissions";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: Role;
      permissions: PermKey[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    permissions?: PermKey[];
  }
}
