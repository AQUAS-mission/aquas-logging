import NextAuth, { DefaultSession, DefaultUser } from "next-auth";

// Extend User type
declare module "next-auth" {
  interface User extends DefaultUser {
    id?: string;
    role?: string;
  }

  interface Session extends DefaultSession {
    user: {
      id?: string;
      role?: string;
      accessToken?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}
