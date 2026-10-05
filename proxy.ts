import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/next-path";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  /* /api/push/send is called by the database and protects itself with a
     shared secret. /api/mcp and /.well-known/ serve the Claude connector,
     which signs in with its own access token instead of a browser session. */
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/push/") ||
    path.startsWith("/api/mcp") ||
    path.startsWith("/.well-known/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    const back = path + request.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    if (path !== "/") url.searchParams.set("next", back);
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    const target = new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url);
    url.pathname = target.pathname;
    url.search = target.search;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
