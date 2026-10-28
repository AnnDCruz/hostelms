import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6">
        <h1 className="text-xl font-semibold">Sign in to HostelMS</h1>
        <p className="mt-1 text-sm text-muted">Use the email and password issued by your warden.</p>
        <LoginForm />
      </div>
    </main>
  );
}
