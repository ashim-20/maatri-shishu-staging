import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg p-12 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-3 text-muted-foreground">
        Return to your care workspace.
      </p>
      <Link href="/" className="mt-6 inline-block text-primary underline">
        Back to Today
      </Link>
    </main>
  );
}
