'use client';

import { useState } from 'react';
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ClaimRobotPage() {
    const [serialNumber, setSerialNumber] = useState('');
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const { data: session } = useSession();
    const router = useRouter();
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!serialNumber.trim()) {
            setErrorMsg("Please enter a serial number");
            return;
        }

        if (!session?.user?.accessToken) {
            setErrorMsg("You must be logged in.");
            return;
        }

        setLoading(true);
        setErrorMsg("");
        setSuccessMsg("");
        // call POST /robots/claim on submit
        try {
            const response = await fetch(`${API_BASE}/robots/claim`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session?.user?.accessToken}`,
                },
                body: JSON.stringify({
                    serial_number: serialNumber,
                }),
            });
            if (response.status === 200) {
                const data = await response.json();
                setSuccessMsg(`Successfully claimed ${data.name}`);
                setErrorMsg("");
                setTimeout(() => {
                    router.push("/");
            }, 1000);

            } else if (response.status === 404) {
                setErrorMsg("Robot not found — check the serial number");
                setSuccessMsg("");

            } else if (response.status === 409) {
                setErrorMsg("This robot is already claimed");
                setSuccessMsg("");

            } else {
                setErrorMsg("Something went wrong. Please try again.");
                setSuccessMsg("");
            }
            // your existing status handling here
        } finally {
            setLoading(false);
        }
        
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
            <div className="bg-card border border-border backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md transition-all hover:shadow-primary/30">
            <h1 className="text-3xl font-bold text-center text-primary mb-6">
                Claim a Robot
            </h1>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <input
                type="text"
                placeholder="Serial number"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="p-3 rounded-lg bg-input text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/60"
                />

                <button
                type="submit"
                disabled={loading}
                className="mt-4 bg-primary hover:bg-primary/90 hover:shadow-lg hover:scale-[1.02] active:scale-[0.97] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 text-primary-foreground font-semibold py-2 rounded-lg transition-all duration-150"
                >
                {loading ? "Claiming..." : "Claim Robot"}
                </button>

                {errorMsg ? (
                <p className="text-sm text-red-500">{errorMsg}</p>
                ) : null}

                {successMsg ? (
                <p className="text-sm text-green-500">{successMsg}</p>
                ) : null}
            </form>

            <div className="mt-4 text-center">
                <button
                type="button"
                onClick={() => router.push("/")}
                className="text-sm text-muted-foreground hover:underline cursor-pointer"
                >
                Back to dashboard
                </button>
            </div>
            </div>
        </div>
    );
}