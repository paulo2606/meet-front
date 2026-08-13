"use client";

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
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="flex items-center px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pb-20">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-2xl font-medium text-zinc-900">
            Criar conta
          </h1>
          <p className="mb-6 text-sm text-zinc-500">
            comece a usar o Meet hoje mesmo
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              nome
              <input
                type="text"
                required
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              senha
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-full bg-blue-700 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? "criando..." : "criar conta"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-zinc-600">
            ja tem conta?{" "}
            <a
              href="/login"
              className="font-medium text-blue-700 hover:underline"
            >
              entrar
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
