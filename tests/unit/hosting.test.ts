import { describe, expect, it, vi } from "vitest";
import { validateHostingEnvironment } from "../../scripts/lib/hosting";
import {
  checkSupabaseConnection,
  workspaceTables,
} from "../../scripts/lib/supabase-probe";

const projectRef = "abcdefghijklmnopqrst";
const publicKey = "sb_publishable_synthetic_key_for_local_tests_only";
const environment = {
  NEXT_PUBLIC_DEMO_MODE: "false",
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
};
const legacyKey = (claims: Record<string, unknown>) =>
  `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic_signature`;

describe("hosted build configuration", () => {
  it("accepts public credentials without requiring administrative credentials", () => {
    expect(validateHostingEnvironment(environment)).toEqual({
      url: environment.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: publicKey,
    });
  });

  it.each([undefined, "true", "FALSE"])(
    "rejects implicit or demo mode (%s)",
    (mode) => {
      expect(() =>
        validateHostingEnvironment({
          ...environment,
          NEXT_PUBLIC_DEMO_MODE: mode,
        }),
      ).toThrow("NEXT_PUBLIC_DEMO_MODE=false");
    },
  );

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])(
    "rejects missing %s",
    (name) => {
      expect(() =>
        validateHostingEnvironment({ ...environment, [name]: "" }),
      ).toThrow("Set NEXT_PUBLIC_SUPABASE_URL");
    },
  );

  it.each([
    `http://${projectRef}.supabase.co`,
    `https://${projectRef}.supabase.co/rest/v1`,
    `https://password@${projectRef}.supabase.co`,
    `https://${projectRef}.supabase.co?key=value`,
    `https://${projectRef}.supabase.co.attacker.example`,
  ])("rejects a URL that isn't the hosted project's origin (%s)", (url) => {
    expect(() =>
      validateHostingEnvironment({
        ...environment,
        NEXT_PUBLIC_SUPABASE_URL: url,
      }),
    ).toThrow("Project URL");
  });

  it.each([
    "private-key-placeholder-must-not-be-printed",
    legacyKey({ role: "service_role", ref: projectRef }),
    legacyKey({ role: "authenticated", ref: projectRef }),
  ])("rejects privileged/user credentials without echoing them", (key) => {
    let message = "";
    try {
      validateHostingEnvironment({
        ...environment,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("must never be used here");
    expect(message).not.toContain(key);
  });

  it("accepts a matching legacy anon key", () => {
    const key = legacyKey({ role: "anon", ref: projectRef });
    expect(
      validateHostingEnvironment({
        ...environment,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      }).publishableKey,
    ).toBe(key);
  });

  it("rejects a legacy key from a different project", () => {
    expect(() =>
      validateHostingEnvironment({
        ...environment,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyKey({
          role: "anon",
          ref: "otherproject",
        }),
      }),
    ).toThrow("different Supabase project");
  });

  it("rejects expired legacy keys", () => {
    expect(() =>
      validateHostingEnvironment({
        ...environment,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyKey({
          role: "anon",
          ref: projectRef,
          exp: 1,
        }),
      }),
    ).toThrow("expired");
  });
});

function stubProject(
  options: {
    signups?: boolean;
    visibleRows?: number;
    missingTable?: boolean;
    invalidKey?: boolean;
    rpcStatus?: number;
  } = {},
) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/settings") {
      if (options.invalidKey)
        return Response.json({ message: "Invalid API key" }, { status: 401 });
      return Response.json({
        external: { email: true, anonymous_users: false },
        disable_signup: !options.signups,
      });
    }
    if (url.pathname === "/rest/v1/rpc/load_workspace") {
      return Response.json(
        { code: "42501" },
        { status: options.rpcStatus ?? 401 },
      );
    }
    expect(init?.method).toBe("HEAD");
    if (options.missingTable) return new Response(null, { status: 404 });
    return new Response(null, {
      headers: { "content-range": `*/${options.visibleRows ?? 0}` },
    });
  });
}

describe("Supabase read-only connection probes", () => {
  const config = validateHostingEnvironment(environment);

  it("uses GET/HEAD and keeps publishable keys out of the bearer header", async () => {
    const fetcher = stubProject();
    const checks = await checkSupabaseConnection(config, fetcher);
    expect(checks).toHaveLength(workspaceTables.length + 4);
    expect(checks.every((check) => check.ok)).toBe(true);
    for (const [, options] of fetcher.mock.calls) {
      expect(["GET", "HEAD"]).toContain(options?.method);
      expect(new Headers(options?.headers).get("authorization")).toBeNull();
      expect(new Headers(options?.headers).get("apikey")).toBe(publicKey);
      expect(options?.redirect).toBe("error");
    }
  });

  it("fails on enabled public signups", async () => {
    const checks = await checkSupabaseConnection(
      config,
      stubProject({ signups: true }),
    );
    expect(
      checks.find((check) => check.name === "Public signups disabled")?.ok,
    ).toBe(false);
  });

  it("does not treat an invalid key as evidence that access is restricted", async () => {
    const fetcher = stubProject({ invalidKey: true });
    const checks = await checkSupabaseConnection(config, fetcher);
    expect(checks).toHaveLength(1);
    expect(checks[0].ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails on anonymously readable rows without downloading their contents", async () => {
    const checks = await checkSupabaseConnection(
      config,
      stubProject({ visibleRows: 1 }),
    );
    expect(
      checks
        .filter((check) => check.name.startsWith("Anonymous access:"))
        .every((check) => !check.ok),
    ).toBe(true);
  });

  it("does not treat a missing table as restricted access", async () => {
    const checks = await checkSupabaseConnection(
      config,
      stubProject({ missingTable: true }),
    );
    expect(
      checks
        .filter((check) => check.name.startsWith("Anonymous access:"))
        .every((check) => !check.ok),
    ).toBe(true);
  });

  it.each([200, 404])(
    "fails when the RPC responds with HTTP %s instead of permission denied",
    async (rpcStatus) => {
      const checks = await checkSupabaseConnection(
        config,
        stubProject({ rpcStatus }),
      );
      expect(
        checks.find(
          (check) => check.name === "Workspace RPC requires authentication",
        )?.ok,
      ).toBe(false);
    },
  );

  it("reports network failures without including sensitive error details", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error(`Network error with ${publicKey}`);
    });
    const checks = await checkSupabaseConnection(config, fetcher);
    expect(checks[0].ok).toBe(false);
    expect(JSON.stringify(checks)).not.toContain(publicKey);
  });
});
