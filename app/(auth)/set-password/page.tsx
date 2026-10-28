import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6">
        <h1 className="text-xl font-semibold">Choose your password</h1>
        {token ? (
          <SetPasswordForm token={token} />
        ) : (
          <p className="mt-3 text-sm text-muted">This link is incomplete. Open the link from your email again.</p>
        )}
      </div>
    </main>
  );
}
