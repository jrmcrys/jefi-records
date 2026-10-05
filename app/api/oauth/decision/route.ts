import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Receives the Approve or Cancel button from /oauth/consent and sends the
   browser back to the app that asked, with a code or an error. */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const form = await request.formData();
  const authorizationId = form.get("authorization_id");
  const decision = form.get("decision");

  if (typeof authorizationId !== "string" || !authorizationId) {
    return NextResponse.redirect(new URL("/oauth/consent", origin), 303);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(back)}`, origin),
      303
    );
  }

  const options = { skipBrowserRedirect: true };
  const result =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
      : await supabase.auth.oauth.denyAuthorization(authorizationId, options);

  if (result.error || !result.data?.redirect_url) {
    const url = new URL("/oauth/consent", origin);
    url.searchParams.set("authorization_id", authorizationId);
    return NextResponse.redirect(url, 303);
  }

  return NextResponse.redirect(result.data.redirect_url, 303);
}
