import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyBearer } from "@/lib/mcp/auth";
import { registerTools } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => registerTools(server),
  { serverInfo: { name: "jefi-records", version: "1.0.0" } }
);

/* Every request must carry an access token issued by this project's Supabase
   Auth after the person approved the connection. */
const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    const who = await verifyBearer(bearer);
    if (!who) return undefined;
    return {
      token: who.token,
      clientId: "jefi-connector",
      scopes: [],
      extra: { userId: who.userId, email: who.email },
    };
  },
  {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
  }
);

export { authed as GET, authed as POST, authed as DELETE };
