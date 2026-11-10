/** Small HTTP helpers for the public Worker. */
import { INTERNAL_HEADER_PREFIX } from "./cafe/connection";

/** Remove every X-Cafe-* header: only our own code may set them (D-40). */
export function stripInternalHeaders(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith(INTERNAL_HEADER_PREFIX)) headers.delete(name);
  }
  return new Request(request, { headers });
}
