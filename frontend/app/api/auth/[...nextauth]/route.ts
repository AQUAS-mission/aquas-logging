import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { SignJWT } from "jose";

// The API verifies HS256 tokens signed with NEXTAUTH_SECRET (see backend/auth.py),
// so the secret must be identical on both sides.
async function signApiToken(payload: {
  sub: string;
  name?: string | null;
  role?: string;
}): Promise<string | undefined> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return undefined;
  return new SignJWT({ name: payload.name ?? null, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(secret));
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminUser = {
          id: "1",
          name: "Admin",
          username: process.env.ADMIN_USERNAME,
          password: process.env.ADMIN_PASSWORD,
        };

        if (
          credentials?.username === adminUser.username &&
          credentials?.password === adminUser.password
        ) {
          return { id: adminUser.id, name: adminUser.name, role: "admin" };
        }
        return null;
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.id = token.id;
      // Signed on each session read so the 8h expiry stays fresh.
      session.user.accessToken = await signApiToken({
        sub: String(token.id ?? token.sub ?? "unknown"),
        name: token.name,
        role: token.role,
      });
      return session;
    },
  },
});

export { handler as GET, handler as POST };
