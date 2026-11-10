// Worker entry point. Cloudflare needs the Durable Object class exported from here.
// Routing tablets to their café (WebSocket) comes in slice 2; until then every request is 404.
export { CafeDO } from "./cafe/CafeDO";

export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
