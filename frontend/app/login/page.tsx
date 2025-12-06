'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await signIn('credentials', {
      redirect: false,
      username,
      password,
    });

    if (result?.ok) {
      router.push('/');
    } else {
      alert('Invalid credentials');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="bg-card border border-border backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md transition-all hover:shadow-primary/30">
        <h1 className="text-3xl font-bold text-center text-primary mb-6">
          AQUAS Admin Login
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
          />
          <button
            type="submit"
            className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 rounded-lg transition-all"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
