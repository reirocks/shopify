export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Temporary Shopify connection test
    if (url.pathname === "/api/shopify-test") {
      try {
        // Request an access token from Shopify
        const tokenResponse = await fetch(
          `https://${env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json"
            },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: env.SHOPIFY_CLIENT_ID,
              client_secret: env.SHOPIFY_CLIENT_SECRET
            })
          }
        );

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
          return Response.json(
            { error: "Shopify authentication failed", details: tokenData },
            { status: 502 }
          );
        }

        // Query Shopify products using the access token
        const shopifyResponse = await fetch(
          `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-10/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": tokenData.access_token
            },
            body: JSON.stringify({
              query: `{
                products(first: 5) {
                  edges {
                    node {
                      id
                      title
                      handle
                    }
                  }
                }
              }`
            })
          }
        );

        const shopifyData = await shopifyResponse.json();

        if (!shopifyResponse.ok || shopifyData.errors) {
          return Response.json(
            {
              error: "Shopify product query failed",
              details: shopifyData
            },
            { status: 502 }
          );
        }

        // Return the test results
        return Response.json({
          message: "Shopify connection successful!",
          store: env.SHOPIFY_STORE_DOMAIN,
          products: shopifyData.data.products.edges.map(
            edge => edge.node
          )
        });

      } catch (error) {
        return Response.json(
          {
            error: "Connection error",
            details: error.message
          },
          { status: 500 }
        );
      }
    }

    // Serve the React application
    return env.ASSETS.fetch(request);
  }
};
