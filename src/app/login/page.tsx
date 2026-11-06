"use client";
import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isConfigured, isDemo } from "@/lib/config";
export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#eaf0e2] p-16 lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/icon.svg" alt="" width={38} height={38} />
          <span className="text-xl font-semibold tracking-tight">
            maatri-shishu
          </span>
        </div>
        <div>
          <div className="mb-7 flex size-16 items-center justify-center rounded-2xl bg-[#dfe8d3]">
            <Heart className="size-7 stroke-[1.4] text-[#556846]" />
          </div>
          <h1 className="max-w-md text-5xl font-medium leading-[1.17] tracking-[-2px]">
            A little care.
            <br />A lasting difference.
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-loose text-[#5b6652]">
            A shared workspace for the people who connect mothers, children, and
            care in their community.
          </p>
        </div>
        <p className="text-xs text-[#5c6555]">
          Made for care. Rooted in community.
        </p>
      </div>
      <div className="flex items-center justify-center p-7">
        <div className="w-full max-w-sm">
          <Image
            src="/icon.svg"
            width={40}
            height={40}
            alt="Maatri-Shishu"
            className="mb-8 lg:hidden"
          />
          <div className="mb-8">
            <span className="text-[10px] font-medium uppercase tracking-[2px] text-[#58654d]">
              Your care workspace
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Welcome back
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Sign in with your assigned health-post account.
            </p>
          </div>
          {isDemo ? (
            <div className="rounded-xl border border-[#e0e8d7] bg-[#f1f5eb] p-5">
              <h3 className="font-medium">Explore the practice workspace</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                No account is needed for the local demo. All people and care
                records are synthetic.
              </p>
              <Button className="mt-5 w-full" onClick={() => router.push("/")}>
                Open demo workspace
              </Button>
            </div>
          ) : !isConfigured ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900"
            >
              This workspace has not been connected yet. Ask the administrator
              to configure Supabase and assign staff accounts.
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-xs font-medium"
                >
                  Staff email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="you@healthpost.org"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-xs font-medium"
                >
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="text-xs leading-relaxed text-red-700"
                >
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {busy ? "Signing in…" : "Sign in to workspace"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Need access? Contact your health-post administrator.
              </p>
            </form>
          )}
          <p className="mt-8 flex items-start gap-2 text-[10px] leading-relaxed text-[#5d6456]">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Individual accounts. Assigned records. Care you can trust.
          </p>
        </div>
      </div>
    </main>
  );
}
