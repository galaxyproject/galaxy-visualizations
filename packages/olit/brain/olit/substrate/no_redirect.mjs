// A fetch that never follows a redirect, so a request carrying the api key cannot leave its origin.
export function noRedirect(input, init) {
  const request = input instanceof Request && !init ? input : new Request(input, init);
  return fetch(new Request(request, { redirect: "manual" }));
}
