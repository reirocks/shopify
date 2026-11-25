
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================================
    // SHOPIFY → SUPABASE PRODUCT SYNCHRONIZATION
    // =========================================

    if (url.pathname === "/api/products-sync") {

      // Require POST and a valid shared secret
      if (
        request.method !== "POST" ||
        request.headers.get("Authorization") !== `Bearer ${env.SYNC_SECRET}`
      ) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      try {

        // 1. Authenticate with Shopify
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

        const shopifyHeaders = {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenData.access_token
        };

        // 2. Retrieve brands from Supabase
        const brandsResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/brands?select=id,name`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );

        const brands = await brandsResponse.json();

        if (!brandsResponse.ok) {
          return Response.json(
            { error: "Failed to retrieve brands", details: brands },
            { status: 502 }
          );
        }

        const brandMap = {};

        for (const brand of brands) {
          brandMap[brand.name.trim().toLowerCase()] = brand.id;
        }

        // 3. Retrieve all Shopify products using pagination
        let products = [];
        let cursor = null;
        let hasNextPage = true;

        while (hasNextPage) {

          const graphqlQuery = `
            query GetProducts($cursor: String) {
              products(first: 100, after: $cursor) {
                edges {
                  node {
                    id
                    title
                    handle
                    vendor
                    status
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          `;

          const shopifyResponse = await fetch(
            `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-10/graphql.json`,
            {
              method: "POST",
              headers: shopifyHeaders,
              body: JSON.stringify({
                query: graphqlQuery,
                variables: {
                  cursor
                }
              })
            }
          );

          const shopifyData = await shopifyResponse.json();

          if (!shopifyResponse.ok || shopifyData.errors) {
            return Response.json(
              {
                error: "Shopify product retrieval failed",
                details: shopifyData.errors || shopifyData
              },
              { status: 502 }
            );
          }

          const edges = shopifyData.data.products.edges;

          products.push(...edges.map(edge => edge.node));

          hasNextPage =
            shopifyData.data.products.pageInfo.hasNextPage;

          cursor =
            shopifyData.data.products.pageInfo.endCursor;
        }

        // 4. Match products to brands and prepare records
        const matchedProducts = [];
        const skippedProducts = [];

        for (const product of products) {

          const vendorKey = (product.vendor || "")
            .trim()
            .toLowerCase();

          const brandId = brandMap[vendorKey];

          if (!brandId) {
            skippedProducts.push({
              title: product.title,
              vendor: product.vendor
            });

            continue;
          }

          matchedProducts.push({
            brand_id: brandId,
            shopify_product_id: product.id,
            title: product.title,
            handle: product.handle,
            sales_channel: "both",
            status: product.status.toLowerCase()
          });
        }

        // 5. Upsert products into Supabase
        let syncedCount = 0;

        for (let i = 0; i < matchedProducts.length; i += 100) {

          const batch = matchedProducts.slice(i, i + 100);

          const syncResponse = await fetch(
            `${env.SUPABASE_URL}/rest/v1/products?on_conflict=shopify_product_id`,
            {
              method: "POST",
              headers: {
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates,return=minimal"
              },
              body: JSON.stringify(batch)
            }
          );

          if (!syncResponse.ok) {
            const syncError = await syncResponse.text();

            return Response.json(
              {
                error: "Supabase product synchronization failed",
                details: syncError,
                successfullyProcessedBeforeFailure: syncedCount
              },
              { status: 502 }
            );
          }

          syncedCount += batch.length;
        }

        // 6. Return synchronization report
        return Response.json({
          message: "Product synchronization successful!",
          shopifyProductsFound: products.length,
          productsSynced: syncedCount,
          productsSkipped: skippedProducts.length,
          skippedProducts
        });

      } catch (error) {
        return Response.json(
          {
            error: "Product synchronization error",
            details: error.message
          },
          { status: 500 }
        );
      }
    }

    // =========================================
    // UNKNOWN API ROUTES
    // =========================================

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "API endpoint not found" },
        { status: 404 }
      );
    }

    // =========================================
    // SERVE REACT APPLICATION
    // =========================================

    return env.ASSETS.fetch(request);
  }
};
