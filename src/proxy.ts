import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",                // <- make homepage public (important)
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

function isVoiceTestBypass(req: Request): boolean {
  const configuredApiKey = process.env.VOICE_TEST_API_KEY?.trim();
  if (!configuredApiKey) {
    return false;
  }

  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/bluum/voice/session/")) {
    return false;
  }

  const providedApiKey = req.headers.get("x-voice-test-api-key")?.trim();
  return Boolean(providedApiKey && providedApiKey === configuredApiKey);
}

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req) && !isVoiceTestBypass(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
