import { getAuth } from "@/lib/auth/server";

/** Better Auth endpoints: GitHub OAuth, magic links, and sessions. */
export function GET(request: Request) {
  return getAuth().handler(request);
}

export function POST(request: Request) {
  return getAuth().handler(request);
}
