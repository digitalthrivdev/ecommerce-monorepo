import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicSettings } from "@/lib/dal";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "no-access": "Your account does not have access to the dashboard. Contact an administrator.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const appName = await getPublicSettings()
    .then((settings) => settings.appName)
    .catch(() => null);

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{appName ? `${appName} dashboard` : "Dashboard"}</CardTitle>
          <CardDescription>Sign in with your email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            next={typeof next === "string" ? next : undefined}
            initialError={typeof error === "string" ? ERRORS[error] : undefined}
          />
        </CardContent>
      </Card>
    </main>
  );
}
