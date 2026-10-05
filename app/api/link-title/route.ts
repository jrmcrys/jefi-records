import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseGoogleFile } from "@/lib/google";

export const dynamic = "force-dynamic";

const SUFFIX = / - (Google (Docs|Sheets|Slides|Forms|Drive))$/;

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/* Looks up the name of a Google file so the Add form can fill it in. Only
   works for files that anyone with the link can view; for private files it
   returns no title and the person types one. The address is rebuilt from
   the file id, so this only ever calls Google. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("url") ?? "";
  const file = parseGoogleFile(raw);
  if (!file) return NextResponse.json({ title: null, type: null });

  let title: string | null = null;
  try {
    const res = await fetch(file.url, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; JefiRecords/1.0)" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (res.ok) {
      const html = (await res.text()).slice(0, 200_000);
      const m = /<title>([^<]{1,300})<\/title>/i.exec(html);
      if (m) {
        const t = decode(m[1]).trim().replace(SUFFIX, "").trim();
        if (t && !/^(Google (Docs|Sheets|Slides|Forms|Drive)|Sign in.*)$/i.test(t)) title = t;
      }
    }
  } catch {
    /* no title, the person types one */
  }

  return NextResponse.json({ title, type: file.type });
}
