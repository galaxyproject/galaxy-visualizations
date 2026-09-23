/** A fetch that signs requests to the model endpoint, so the key never enters Python. */
export function authorizedFetch(fetchImpl, llm) {
    if (!llm || !llm.apiKey || !llm.baseUrl) {
        return fetchImpl;
    }
    return (url, options) => {
        if (!String(url).startsWith(llm.baseUrl)) {
            return fetchImpl(url, options);
        }
        const plain = (value) => (value instanceof Map ? Object.fromEntries(value) : { ...(value || {}) });
        const init = plain(options);
        const headers = { ...plain(init.headers), Authorization: `Bearer ${llm.apiKey}` };
        return fetchImpl(url, { ...init, headers });
    };
}
