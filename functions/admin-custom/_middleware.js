export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Hash fragments are not sent to the server, but we can include it
  // in the Location header so the browser lands on the right view.
  const target = new URL("/admin/#payment-links", url.origin);
  target.search = url.search;

  return Response.redirect(target.toString(), 301);
}
