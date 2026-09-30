/** Whether `url` addresses the configured endpoint: same origin, path at or under its base. */
function atEndpoint(baseUrl, url) {
  let base;
  let target;
  try {
    base = new URL(baseUrl);
    target = new URL(String(url));
  } catch {
    return false;
  }
  if (target.origin !== base.origin) {
    return false;
  }
  const prefix = base.pathname.replace(/\/+$/, "");
  return target.pathname === prefix || target.pathname.startsWith(`${prefix}/`);
}

/** A fetch that signs requests to the model endpoint, so the key never enters Python. */
export function authorizedFetch(fetchImpl, llm) {
  if (!llm || !llm.apiKey || !llm.baseUrl) {
    return fetchImpl;
  }
  return (url, options) => {
    if (!atEndpoint(llm.baseUrl, url)) {
      return fetchImpl(url, options);
    }
    const plain = (value) =>
      value instanceof Map ? Object.fromEntries(value) : { ...(value || {}) };
    const init = plain(options);
    const headers = { ...plain(init.headers), Authorization: `Bearer ${llm.apiKey}` };
    return fetchImpl(url, { ...init, headers });
  };
}
