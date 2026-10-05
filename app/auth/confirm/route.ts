import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NEXT_COOKIE, nextFromCookie } from "@/lib/next-path";

/*
 * Magic link landing route. Works on any device or browser, which matters
 * when a link requested on the Mac is opened on the iPhone.
 * Requires the Supabase "Magic Link" email template to point here
 * (see README).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      const res = NextResponse.redirect(
        new URL(nextFromCookie(request.cookies.get(NEXT_COOKIE)?.value), origin)
      );
      res.cookies.delete(NEXT_COOKIE);
      return res;
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
