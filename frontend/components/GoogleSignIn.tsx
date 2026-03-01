"use client";
import { signIn } from "next-auth/react";

const GoogleSignIn = () => { 
    return (
        <button type="button" className="hover:cursor-pointer bg-input hover:bg-border text-foreground font-semibold py-2 px-4 rounded-lg border border-border transition-all" onClick={() => signIn("google", { callbackUrl: "/" })}>
            Sign in with Google
        </button>
    );
}

export default GoogleSignIn;