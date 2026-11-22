
export async function onRequest(context) {
  const { request, env } = context;

  const username = env.BASIC_AUTH_USER;
  const password = env.BASIC_AUTH_PASSWORD;

  // Block access until credentials are configured.
  if (!username || !password) {
    return new Response("Site configuration incomplete", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const authorization = request.headers.get("Authorization") || "";
  const expected = "Basic " + btoa(username + ":" + password);

  const encoder = new TextEncoder();
  const hash = async (value) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value))
    );

  const actualHash = await hash(authorization);
  const expectedHash = await hash(expected);

  let difference = 0;
  for (let i = 0; i < actualHash.length; i++) {
    difference |= actualHash[i] ^ expectedHash[i];
  }

  if (difference !== 0) {
    return new Response("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Family Registry"',
        "Cache-Control": "no-store"
      }
    });
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
