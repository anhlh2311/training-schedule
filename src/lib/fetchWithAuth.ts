import { auth } from "./firebase";

/**
 * POST JSON to same-origin API routes with Firebase ID token.
 * Retries once with a forced token refresh on 401 (e.g. auth/id-token-expired after a long session).
 */
export async function postJsonWithAuth(
  path: string,
  body: unknown
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const post = (forceRefresh: boolean) =>
    user.getIdToken(forceRefresh).then((token) =>
      fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
    );

  let res = await post(false);
  if (res.status === 401) {
    res = await post(true);
  }
  return res;
}
