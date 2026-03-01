'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName || undefined }),
    });

    if (res.status === 409) {
      setError('An account with that email already exists.');
      return;
    }

    if (!res.ok) {
      setError('Something went wrong. Please try again.');
      return;
    }

    router.push('/login?registered=1');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="bg-card border border-border backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md transition-all hover:shadow-primary/30">
        <h1 className="text-3xl font-bold text-center text-primary mb-6">
          Create Account
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
          />
          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            className="mt-2 bg-primary hover:bg-primary/90 hover:cursor-pointer text-primary-foreground font-semibold py-2 rounded-lg transition-all"
          >
            Register
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <a href="/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
