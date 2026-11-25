
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

// Shopify connection test
if (url.pathname === "/api/shopify-test") {

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

// Shopify -> Supabase product synchronization
if (url.pathname === "/api/products-sync") {

  // Require POST and a valid secret
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

    // Serve React application
    return env.ASSETS.fetch(request);
  }
};
