// The one place the app talks to the API. Every request goes through api(),
// so headers and error handling are the same everywhere.
const BASE_URL = import.meta.env.VITE_API_URL;

export async function api(path, { method = 'GET', body } = {}) {
  // Content-Type is only sent when there is a body. On a GET it would make the
  // browser send an extra CORS "preflight" OPTIONS request first, for nothing.
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch() only throws when there's no response at all (server down, no internet).
    throw new Error("Can't reach the server. Check that the API is running and try again.");
  }

  if (response.status === 204) {
    return null; // No Content, e.g. after a DELETE
  }

  const data = await response.json().catch(() => null);

  // fetch() does NOT throw on 4xx/5xx, so we have to check ourselves.
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Request failed with status ${response.status}`);
    error.status = response.status; // lets a page treat 404 differently from other errors
    throw error;
  }

  return data;
}
