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
        // call POST /robots/claim on submit
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
    };

    return (
        <div>
        <h1>Claim a Robot</h1>

        <form onSubmit={handleSubmit}>
            <input
            type="text"
            placeholder="Serial number"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            />

            <button type="submit">
            Claim Robot
            </button>
        </form>
        {errorMsg && <p className="text-red-500">{errorMsg}</p>}
        {successMsg && <p className="text-green-500">{successMsg}</p>}
        </div>
    );
}