import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NEXT_COOKIE, nextFromCookie, safeNext } from "@/lib/next-path";
import { encryptToken, tokenKeyConfigured } from "@/lib/gcal/crypto";

/* Landing route for the OAuth and PKCE flows: Google sign-in, and magic links
   opened in the same browser. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const queryNext = searchParams.get("next");
  const next = queryNext
    ? safeNext(queryNext)
    : nextFromCookie(request.cookies.get(NEXT_COOKIE)?.value);

  const providerError = searchParams.get("error_description");
  if (providerError && !code) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "oauth");
    url.searchParams.set("message", providerError.slice(0, 200));
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      /* Google only hands over a refresh token when calendar access is
         approved. Keep it, encrypted, so the calendar can load later. */
      const refresh = data.session?.provider_refresh_token;
      const userId = data.session?.user.id;
      if (refresh && userId && tokenKeyConfigured()) {
        await supabase.from("google_connections").upsert(
          {
            user_id: userId,
            refresh_token_enc: encryptToken(refresh),
            connected_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      }
      const res = NextResponse.redirect(new URL(next, origin));
      res.cookies.delete(NEXT_COOKIE);
      return res;
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
