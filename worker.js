export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Shopify connection test
    if (url.pathname === "/api/shopify-test") {
      try {
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
            { error: "Shopify authentication failed" },
            { status: 502 }
          );
        }

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
            { error: "Shopify product query failed" },
            { status: 502 }
          );
        }

        return Response.json({
          message: "Shopify connection successful!",
          store: env.SHOPIFY_STORE_DOMAIN,
          products: shopifyData.data.products.edges.map(
            edge => edge.node
          )
        });

      } catch (error) {
        return Response.json(
          { error: "Shopify connection error", details: error.message },
          { status: 500 }
        );
      }
    }

    // Supabase connection test
    if (url.pathname === "/api/supabase-test") {
      try {
        const response = await fetch(
          `${env.SUPABASE_URL}/rest/v1/brands?select=id,name&limit=5`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              Accept: "application/json"
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          return Response.json(
            {
              error: "Supabase query failed",
              status: response.status,
              details: data
            },
            { status: 502 }
          );
        }

        return Response.json({
          message: "Supabase connection successful!",
          brands: data
        });

      } catch (error) {
        return Response.json(
          {
            error: "Supabase connection error",
            details: error.message
          },
          { status: 500 }
        );
      }
    }

    // Serve React application
    return env.ASSETS.fetch(request);
  }
};
