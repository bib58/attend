'use client';

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Auth } from "../lib/auth";
import { playSound } from "../lib/utils";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const role = searchParams.get("role") || "invigilator";
  const isAdmin = role === "admin";

  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");

  const passcodeRef = useRef(null);

  useEffect(() => {
    passcodeRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const enteredCode = passcode.trim();
    if (!enteredCode) return;

    try {
      const result = await Auth.login(enteredCode, role);

      playSound("success");

      if (result.role === "admin") {
       router.push("/admin");
      } else {
        router.push("/teacher");
      }
    } catch (err) {
      playSound("error");
      setError(err.message || "Failed to verify. Please try again.");
      setPasscode("");
      passcodeRef.current?.focus();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_center,_#1e293b,_#0f172a)] p-6">
      <div className="w-full max-w-md animate-in zoom-in-95 duration-500">
        <div className="rounded-[28px] border border-white/10 bg-slate-800/70 backdrop-blur-xl shadow-2xl px-10 py-12">
          <div className="text-center mb-10">
            <div
              className={`w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center shadow-inner ${
                isAdmin
                  ? "bg-blue-500/15 text-blue-500"
                  : "bg-emerald-500/15 text-emerald-500"
              }`}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h2 className="text-3xl font-bold text-white">
              {isAdmin ? "Admin Verification" : "Invigilator Gate"}
            </h2>
          </div>
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="mt-0.5 shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>

              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="mb-7">
              <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                {isAdmin ? "Admin Passcode" : "Assigned Passcode"}
              </label>

              <input
                ref={passcodeRef}
                type="password"
                maxLength={10}
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={isAdmin ? "••••" : "••••••"}
                className="w-full h-15 rounded-xl border-2 border-slate-700 bg-slate-900/60 text-center text-3xl font-extrabold tracking-[0.25em] text-white outline-none transition-all focus:border-indigo-500 focus:bg-slate-900/80 focus:ring-4 focus:ring-indigo-500/20"
              />
            </div>

            <button
              type="submit"
              className="h-13 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold text-lg shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:from-indigo-600 hover:to-blue-600 active:translate-y-0 cursor-pointer"
            >
              Verify Passcode
            </button>
          </form>
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-md font-medium text-slate-500 transition hover:text-slate-300"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>

              Back to portal selector
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_center,_#1e293b,_#0f172a)] text-white">
        <div className="text-xl font-medium animate-pulse">Loading login gateway...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}