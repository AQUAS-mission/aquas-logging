'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import GoogleSignIn from '@/components/GoogleSignIn';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get('registered');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    if (result?.ok) {
      router.push('/');
    } else {
      setError('Invalid email or password.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="bg-card border border-border backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md transition-all hover:shadow-primary/30">
        <h1 className="text-3xl font-bold text-center text-primary mb-6">
          AQUAS Login
        </h1>
        {registered && (
          <p className="text-green-400 text-sm text-center bg-green-950 border border-green-800 rounded-lg px-3 py-2 mb-4">
            Account created! You can now sign in.
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
          />
          <p className={`text-destructive text-sm text-center transition-opacity duration-300 ${error ? 'opacity-100' : 'opacity-0'}`}>
            {error || ' '}
          </p>
          <button
            type="submit"
            className="mt-2 bg-primary hover:bg-primary/90 hover:cursor-pointer text-primary-foreground font-semibold py-2 rounded-lg transition-all"
          >
            Sign In
          </button>
          <GoogleSignIn />
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <a href="/register" className="text-primary hover:underline">
              Register
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
