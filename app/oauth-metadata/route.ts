import {
  generateProtectedResourceMetadata,
  getPublicOrigin,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

/* Tells Claude which sign-in server (this project's Supabase Auth) issues
   access tokens for the connector. It lives in a normal folder and is reached
   at /.well-known/oauth-protected-resource through the rewrites in
   next.config.ts, because dot-folders are easy to lose when uploading. */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};

export function GET(req: Request) {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
  });
  return new Response(JSON.stringify(metadata), {
    headers: {
      ...CORS,
      "content-type": "application/json",
      "cache-control": "max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
