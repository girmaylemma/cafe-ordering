// Worker entry point. Cloudflare needs the Durable Object class exported from here.
// Every request is 404 on purpose: routing tablets to their café needs device-token
// auth first (slice 4). See the SECURITY note in src/cafe/connection.ts.
export { CafeDO } from "./cafe/CafeDO";

export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
