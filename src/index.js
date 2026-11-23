// Serves the static site in ./public under the path prefix /yemot
// (route: smti.uk/yemot*). On *.workers.dev the site is also served from the root,
// which is handy for testing.

const PREFIX = '/yemot';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isWorkersDev = url.hostname.endsWith('.workers.dev');
    let path = url.pathname;
    let prefix = '';

    if (path === PREFIX) {
      // Without the trailing slash, relative links (style.css etc.) would resolve outside /yemot
      url.pathname = PREFIX + '/';
      return Response.redirect(url.toString(), 301);
    }

    if (path.startsWith(PREFIX + '/')) {
      prefix = PREFIX;
      path = path.slice(PREFIX.length);
    } else if (!isWorkersDev) {
      // e.g. /yemotXYZ, which also matches the route pattern
      return new Response('Not found', { status: 404 });
    }

    const assetUrl = new URL(url);
    assetUrl.pathname = path;
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));

    // Asset redirects (e.g. /ymgr.html -> /ymgr) point to the root path; put the prefix back.
    const location = response.headers.get('Location');
    if (prefix && location && location.startsWith('/')) {
      const headers = new Headers(response.headers);
      headers.set('Location', prefix + location);
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};
