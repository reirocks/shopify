export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Shopify API routes
    if (url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({
          message: "Backend runtime is working."
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Serve the React application
    return env.ASSETS.fetch(request);
  }
};
