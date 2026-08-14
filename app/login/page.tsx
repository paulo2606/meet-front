"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-context";
import { Logo } from "@/components/logo";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("muitas tentativas, aguarde um minuto");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("email ou senha invalidos");
      } else {
        setError("nao foi possivel entrar, tente novamente");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center px-6 py-5">
        <Logo />
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-6 pb-20"
      >
        <div className="w-full max-w-md rounded-box border border-line bg-surface p-8 shadow-near">
          <h1 className="font-display text-2xl font-semibold text-ink">Entrar</h1>
          <p className="mb-6 text-sm text-ink-3">use sua conta Meet</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="text-sm font-medium text-ink">
                email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={error ? true : undefined}
                className="rounded-box border border-line bg-surface px-3 py-2.5 text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-password" className="text-sm font-medium text-ink">
                senha
              </label>
              <input
                id="login-password"
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
                className="rounded-box border border-line bg-surface px-3 py-2.5 text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
              <p className="text-xs text-ink-3">minimo de 8 caracteres</p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="mt-2 rounded-box bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "entrando..." : "entrar"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-ink-2">
            ainda nao tem conta?{" "}
            <Link className="font-medium text-accent hover:underline" href="/register">
              criar conta
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
