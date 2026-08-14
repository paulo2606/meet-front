"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-context";
import { Logo } from "@/components/logo";
import { ApiError } from "@/lib/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(name, email, password);
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("email ja cadastrado");
      } else {
        setError("nao foi possivel criar a conta, tente novamente");
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
          <h1 className="font-display text-2xl font-semibold text-ink">
            Criar conta
          </h1>
          <p className="mb-6 text-sm text-ink-3">comece a usar o Meet hoje mesmo</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-name" className="text-sm font-medium text-ink">
                nome
              </label>
              <input
                id="register-name"
                type="text"
                required
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-box border border-line bg-surface px-3 py-2.5 text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-email" className="text-sm font-medium text-ink">
                email
              </label>
              <input
                id="register-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-box border border-line bg-surface px-3 py-2.5 text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-password" className="text-sm font-medium text-ink">
                senha
              </label>
              <input
                id="register-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
              {submitting ? "criando..." : "criar conta"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-ink-2">
            ja tem conta?{" "}
            <Link className="font-medium text-accent hover:underline" href="/login">
              entrar
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
