
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

        // =====================================
        // 1. AUTHENTICATE WITH SHOPIFY
        // =====================================

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

        // =====================================
        // 2. RETRIEVE BRANDS FROM SUPABASE
        // =====================================

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

        // =====================================
        // 3. RETRIEVE SHOPIFY PRODUCTS
        // =====================================

        let products = [];
        let cursor = null;
        let hasNextPage = true;
        let shopCurrencyCode = null;

        while (hasNextPage) {

          const graphqlQuery = `
            query GetProducts($cursor: String) {
              shop {
                currencyCode
              }

              products(first: 10, after: $cursor) {
                edges {
                  node {
                    id
                    title
                    handle
                    vendor
                    status
                    descriptionHtml
                    productType
                    tags
                    updatedAt

                    featuredImage {
                      url
                      altText
                    }

                    images(first: 20) {
                      edges {
                        node {
                          url
                          altText
                        }
                      }
                    }

                    variants(first: 50) {
                      edges {
                        node {
                          id
                          title
                          sku
                          barcode
                          price
                          compareAtPrice
                          position
                          inventoryQuantity
                          inventoryPolicy

                          selectedOptions {
                            name
                            value
                          }

                          inventoryItem {
                            tracked
                          }
                        }
                      }

                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                    }
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
                variables: { cursor }
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

          shopCurrencyCode =
            shopifyData.data.shop.currencyCode;

          const edges = shopifyData.data.products.edges;

          // Collect products and their initial variants
          for (const edge of edges) {

            const product = edge.node;

            product.allVariants =
              product.variants.edges.map(edge => edge.node);

            let variantCursor =
              product.variants.pageInfo.endCursor;

            let hasMoreVariants =
              product.variants.pageInfo.hasNextPage;

            // Retrieve additional variant pages
            while (hasMoreVariants) {

              const variantQuery = `
                query GetMoreVariants(
                  $productId: ID!,
                  $cursor: String
                ) {
                  node(id: $productId) {
                    ... on Product {
                      variants(first: 250, after: $cursor) {
                        edges {
                          node {
                            id
                            title
                            sku
                            barcode
                            price
                            compareAtPrice
                            position
                            inventoryQuantity
                            inventoryPolicy

                            selectedOptions {
                              name
                              value
                            }

                            inventoryItem {
                              tracked
                            }
                          }
                        }

                        pageInfo {
                          hasNextPage
                          endCursor
                        }
                      }
                    }
                  }
                }
              `;

              const variantResponse = await fetch(
                `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-10/graphql.json`,
                {
                  method: "POST",
                  headers: shopifyHeaders,
                  body: JSON.stringify({
                    query: variantQuery,
                    variables: {
                      productId: product.id,
                      cursor: variantCursor
                    }
                  })
                }
              );

              const variantData = await variantResponse.json();

              if (!variantResponse.ok || variantData.errors) {
                return Response.json(
                  {
                    error: "Shopify variant retrieval failed",
                    product: product.title,
                    details: variantData.errors || variantData
                  },
                  { status: 502 }
                );
              }

              const variantConnection =
                variantData.data.node.variants;

              product.allVariants.push(
                ...variantConnection.edges.map(edge => edge.node)
              );

              hasMoreVariants =
                variantConnection.pageInfo.hasNextPage;

              variantCursor =
                variantConnection.pageInfo.endCursor;
            }

            products.push(product);
          }

          hasNextPage =
            shopifyData.data.products.pageInfo.hasNextPage;

          cursor =
            shopifyData.data.products.pageInfo.endCursor;
        }

        // =====================================
        // 4. MATCH PRODUCTS TO BRANDS
        // =====================================

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

          const productImages =
            product.images.edges.map(edge => ({
              url: edge.node.url,
              altText: edge.node.altText
            }));

          matchedProducts.push({
            brand_id: brandId,
            shopify_product_id: product.id,

            title: product.title,
            handle: product.handle,
            description: product.descriptionHtml,
            vendor: product.vendor,
            product_type: product.productType,

            tags: product.tags,

            featured_image_url:
              product.featuredImage?.url || null,

            images: productImages,

            sales_channel: "both",
            status: product.status.toLowerCase(),

            shopify_updated_at: product.updatedAt,
            updated_at: new Date().toISOString(),

            variants: product.allVariants
          });
        }

        // =====================================
        // 5. SAVE PRODUCTS TO SUPABASE
        // =====================================

        let syncedProductCount = 0;
        let syncedVariantCount = 0;

        const productIdMap = {};

        for (let i = 0; i < matchedProducts.length; i += 100) {

          const batch = matchedProducts.slice(i, i + 100);

          const productRecords = batch.map(product => {
            const { variants, ...record } = product;
            return record;
          });

          const syncResponse = await fetch(
            `${env.SUPABASE_URL}/rest/v1/products?on_conflict=shopify_product_id`,
            {
              method: "POST",
              headers: {
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates,return=representation"
              },
              body: JSON.stringify(productRecords)
            }
          );

          if (!syncResponse.ok) {
            const syncError = await syncResponse.text();

            return Response.json(
              {
                error: "Supabase product synchronization failed",
                details: syncError,
                successfullyProcessedBeforeFailure: syncedProductCount
              },
              { status: 502 }
            );
          }

          const savedProducts = await syncResponse.json();

          for (const savedProduct of savedProducts) {
            productIdMap[savedProduct.shopify_product_id] =
              savedProduct.id;
          }

          syncedProductCount += savedProducts.length;
        }

        // =====================================
        // 6. PREPARE VARIANT RECORDS
        // =====================================

        const variantRecords = [];

        for (const product of matchedProducts) {

          const internalProductId =
            productIdMap[product.shopify_product_id];

          if (!internalProductId) {
            return Response.json(
              {
                error: "Could not retrieve saved product ID",
                product: product.title
              },
              { status: 502 }
            );
          }

          for (const variant of product.variants) {

            variantRecords.push({
              product_id: internalProductId,

              shopify_variant_id: variant.id,

              title: variant.title,
              sku: variant.sku,
              barcode: variant.barcode,

              price: variant.price,
              compare_at_price: variant.compareAtPrice,
              currency_code: shopCurrencyCode,

              options: variant.selectedOptions,

              position: variant.position,

              inventory_quantity: variant.inventoryQuantity,
              inventory_tracked: variant.inventoryItem?.tracked ?? null,
              inventory_policy:
                variant.inventoryPolicy?.toLowerCase() || null,

              updated_at: new Date().toISOString()
            });
          }
        }

        // =====================================
        // 7. SAVE VARIANTS TO SUPABASE
        // =====================================

        for (let i = 0; i < variantRecords.length; i += 100) {

          const batch = variantRecords.slice(i, i + 100);

          const variantResponse = await fetch(
            `${env.SUPABASE_URL}/rest/v1/product_variants?on_conflict=shopify_variant_id`,
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

          if (!variantResponse.ok) {
            const variantError = await variantResponse.text();

            return Response.json(
              {
                error: "Supabase variant synchronization failed",
                details: variantError,
                successfullyProcessedBeforeFailure: syncedVariantCount
              },
              { status: 502 }
            );
          }

          syncedVariantCount += batch.length;
        }

        // =====================================
        // 8. RETURN SYNCHRONIZATION REPORT
        // =====================================

        return Response.json({
          message: "Product and variant synchronization successful!",

          shopifyProductsFound: products.length,
          productsSynced: syncedProductCount,
          productsSkipped: skippedProducts.length,

          variantsSynced: syncedVariantCount,

          currency: shopCurrencyCode,

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
    // SHOPIFY ORDERS ACCESS TEST (READ-ONLY)
    // =========================================

    if (url.pathname === "/api/orders-test") {
      if (
        request.method !== "POST" ||
        request.headers.get("Authorization") !== `Bearer ${env.SYNC_SECRET}`
      ) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
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
            { error: "Shopify authentication failed", details: tokenData },
            { status: 502 }
          );
        }

        const testQuery = `
          query OrdersAccessTest {
            orders(first: 3, sortKey: CREATED_AT, reverse: true) {
              edges {
                node {
                  id
                  name
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  shippingAddress {
                    name
                    firstName
                    lastName
                    address1
                    address2
                    city
                    province
                    provinceCode
                    zip
                    country
                    countryCodeV2
                    phone
                  }
                  lineItems(first: 10) {
                    edges {
                      node {
                        title
                        quantity
                        sku
                        variant {
                          title
                          product {
                            vendor
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const testResponse = await fetch(
          `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-10/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": tokenData.access_token
            },
            body: JSON.stringify({ query: testQuery })
          }
        );

        const testData = await testResponse.json();

        if (!testResponse.ok || testData.errors) {
          return Response.json(
            {
              error: "Shopify orders access test failed",
              details: testData.errors || testData
            },
            { status: 502 }
          );
        }

        const orders = testData.data.orders.edges.map(({ node }) => ({
          orderName: node.name,
          createdAt: node.createdAt,
          financialStatus: node.displayFinancialStatus,
          fulfillmentStatus: node.displayFulfillmentStatus,
          shippingAddress: node.shippingAddress,
          items: node.lineItems.edges.map(({ node: item }) => ({
            title: item.title,
            quantity: item.quantity,
            sku: item.sku,
            variantTitle: item.variant?.title ?? null,
            vendor: item.variant?.product?.vendor ?? null
          }))
        }));

        return Response.json({
          message: "Shopify orders access test successful",
          ordersReturned: orders.length,
          protectedShippingFieldsIncluded: orders.some(
            order => order.shippingAddress !== null
          ),
          orders
        });

      } catch (error) {
        return Response.json(
          { error: "Orders access test error", details: error.message },
          { status: 500 }
        );
      }
    }


    // =========================================
    // SHOPIFY → SUPABASE BRAND ORDER SYNC
    // Preview by default; add ?confirm=true to save
    // =========================================

    if (url.pathname === "/api/orders-sync") {
      if (
        request.method !== "POST" ||
        request.headers.get("Authorization") !== `Bearer ${env.SYNC_SECRET}`
      ) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const confirmed = url.searchParams.get("confirm") === "true";

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

        if (!tokenResponse.ok || !tokenData.access_token) {
          return Response.json(
            { error: "Shopify authentication failed" },
            { status: 502 }
          );
        }

        const shopifyHeaders = {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenData.access_token
        };

        async function shopifyGraphQL(query, variables = {}) {
          const response = await fetch(
            `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-10/graphql.json`,
            {
              method: "POST",
              headers: shopifyHeaders,
              body: JSON.stringify({ query, variables })
            }
          );

          const data = await response.json();

          if (!response.ok || data.errors) {
            throw new Error(
              `Shopify GraphQL error: ${JSON.stringify(data.errors || data)}`
            );
          }

          return data.data;
        }

        async function supabaseRequest(path, options = {}) {
          const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
            ...options,
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              ...(options.headers || {})
            }
          });

          if (!response.ok) {
            const details = await response.text();
            throw new Error(`Supabase request failed (${response.status}): ${details}`);
          }

          if (response.status === 204) return null;

          const text = await response.text();
          return text ? JSON.parse(text) : null;
        }

        // 2. Build a Shopify product ID → Supabase product mapping.
        // Product sync must have run first for each product to be recognized.
        const [productRows, brandRows] = await Promise.all([
          supabaseRequest(
            "products?select=id,brand_id,shopify_product_id&shopify_product_id=not.is.null&limit=10000"
          ),
          supabaseRequest("brands?select=id,name&limit=1000")
        ]);

        const brandNames = new Map(
          (brandRows || []).map(brand => [brand.id, brand.name])
        );

        const productMap = new Map();
        for (const product of productRows || []) {
          productMap.set(product.shopify_product_id, {
            productId: product.id,
            brandId: product.brand_id,
            brandName: brandNames.get(product.brand_id) || "Unknown brand"
          });
        }

        // 3. Retrieve Shopify orders from the last 60 days
        const sixtyDaysAgo = new Date(
          Date.now() - 60 * 24 * 60 * 60 * 1000
        ).toISOString().slice(0, 10);

        const searchQuery = `created_at:>=${sixtyDaysAgo}`;

        const previewOrders = [];
        const skippedLineItems = [];
        let shopifyOrdersFound = 0;
        let skippedOrders = 0;

        let cursor = null;
        let hasNextPage = true;

        while (hasNextPage) {
          const orderQuery = `
            query GetOrders($cursor: String, $searchQuery: String!) {
              orders(
                first: 50,
                after: $cursor,
                sortKey: CREATED_AT,
                reverse: true,
                query: $searchQuery
              ) {
                edges {
                  node {
                    id
                    name
                    createdAt
                    displayFinancialStatus
                    displayFulfillmentStatus

                    totalPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }

                    shippingAddress {
                      name
                      firstName
                      lastName
                      address1
                      address2
                      city
                      province
                      provinceCode
                      zip
                      country
                      countryCodeV2
                      phone
                    }

                    lineItems(first: 100) {
                      edges {
                        node {
                          id
                          title
                          quantity
                          sku

                          variant {
                            title
                            product {
                              id
                            }
                          }

                          discountedTotalSet {
                            shopMoney {
                              amount
                              currencyCode
                            }
                          }

                          originalUnitPriceSet {
                            shopMoney {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }

                      pageInfo {
                        hasNextPage
                      }
                    }
                  }
                }

                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          `;

          const orderData = await shopifyGraphQL(orderQuery, {
            cursor,
            searchQuery
          });

          const connection = orderData.orders;
          shopifyOrdersFound += connection.edges.length;

          for (const edge of connection.edges) {
            const order = edge.node;

            // Do not silently process an incomplete order.
            if (order.lineItems.pageInfo.hasNextPage) {
              throw new Error(
                `Order ${order.name} has more than 100 line items. ` +
                "It needs additional line-item pagination before syncing."
              );
            }

            // Group this Shopify checkout by its individual brands.
            const brandGroups = new Map();

            for (const edge of order.lineItems.edges) {
              const item = edge.node;
              const shopifyProductId = item.variant?.product?.id;
              const matchedProduct = shopifyProductId
                ? productMap.get(shopifyProductId)
                : null;

              if (!matchedProduct) {
                skippedLineItems.push({
                  order: order.name,
                  product: item.title,
                  shopifyProductId: shopifyProductId || null,
                  reason: "Product not found in synced Supabase products"
                });
                continue;
              }

              const quantity = Number(item.quantity) || 0;

              const discountedTotal = Number(
                item.discountedTotalSet?.shopMoney?.amount
              );

              const originalUnitPrice = Number(
                item.originalUnitPriceSet?.shopMoney?.amount
              );

              const lineTotal = Number.isFinite(discountedTotal)
                ? discountedTotal
                : originalUnitPrice * quantity;

              const unitPrice = quantity > 0
                ? lineTotal / quantity
                : 0;

              const currency =
                item.discountedTotalSet?.shopMoney?.currencyCode ||
                order.totalPriceSet.shopMoney.currencyCode;

              if (!brandGroups.has(matchedProduct.brandId)) {
                brandGroups.set(matchedProduct.brandId, {
                  brandId: matchedProduct.brandId,
                  brandName: matchedProduct.brandName,
                  subtotal: 0,
                  currency,
                  shippingAddress: order.shippingAddress || null,
                  items: []
                });
              }

              const group = brandGroups.get(matchedProduct.brandId);

              group.subtotal += lineTotal;

              group.items.push({
                shopifyLineItemId: item.id,
                productId: matchedProduct.productId,
                productTitle: item.title,
                variantTitle: item.variant?.title || null,
                sku: item.sku || null,
                quantity,
                unitPrice,
                totalPrice: lineTotal
              });
            }

            if (brandGroups.size === 0) {
              skippedOrders++;
              continue;
            }

            previewOrders.push({
              shopifyOrderId: order.id,
              orderNumber: order.name,
              orderedAt: order.createdAt,
              financialStatus: order.displayFinancialStatus,
              fulfillmentStatus: order.displayFulfillmentStatus,
              totalAmount: Number(order.totalPriceSet.shopMoney.amount),
              currency: order.totalPriceSet.shopMoney.currencyCode,
              brandOrders: Array.from(brandGroups.values()).map(group => ({
                ...group,
                subtotal: Number(group.subtotal.toFixed(2))
              }))
            });
          }

          hasNextPage = connection.pageInfo.hasNextPage;
          cursor = connection.pageInfo.endCursor;
        }

        // 4. Build a summary of the proposed brand separation
        const brandOrderCount = previewOrders.reduce(
          (total, order) => total + order.brandOrders.length,
          0
        );

        const orderItemCount = previewOrders.reduce(
          (total, order) =>
            total + order.brandOrders.reduce(
              (count, brandOrder) => count + brandOrder.items.length,
              0
            ),
          0
        );

    
        // 5. Preview mode: return results without writing to Supabase
        if (!confirmed) {
          return Response.json({
            message: "Order synchronization preview successful. No database changes were made.",
            mode: "preview",
            shopifyOrdersFound,
            ordersWithMatchedProducts: previewOrders.length,
            brandOrdersToCreate: brandOrderCount,
            orderItemsToCreate: orderItemCount,
            skippedOrders,
            skippedLineItems,
            orders: previewOrders.map(order => ({
              orderNumber: order.orderNumber,
              orderedAt: order.orderedAt,
              brandOrders: order.brandOrders.map(brandOrder => ({
                brandName: brandOrder.brandName,
                subtotal: brandOrder.subtotal,
                currency: brandOrder.currency,
                itemCount: brandOrder.items.length,
                shippingAddressIncluded: Boolean(
                  brandOrder.shippingAddress
                ),
                items: brandOrder.items.map(item => ({
                  productTitle: item.productTitle,
                  variantTitle: item.variantTitle,
                  sku: item.sku,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice
                }))
              }))
            }))
          });
        }

        // 6. Never save incomplete orders
        if (skippedLineItems.length > 0) {
          return Response.json({
            error: "Synchronization stopped. Some Shopify line items could not be matched to Supabase products.",
            message: "Run product synchronization first, then preview the orders again.",
            skippedLineItems,
            databaseChangesMade: false
          }, { status: 409 });
        }

        // 7. Save the parent Shopify orders and separate brand orders
        let syncedOrders = 0;
        let syncedBrandOrders = 0;
        let syncedOrderItems = 0;

        for (const order of previewOrders) {
          // Parent order is for internal reconciliation only.
          // Do not copy customer address or email into this table.
          const savedOrders = await supabaseRequest(
            "orders?on_conflict=shopify_order_id",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates,return=representation"
              },
              body: JSON.stringify([{
                shopify_order_id: order.shopifyOrderId,
                order_number: order.orderNumber,
                financial_status: order.financialStatus,
                fulfillment_status: order.fulfillmentStatus,
                total_amount: order.totalAmount,
                currency: order.currency,
                ordered_at: order.orderedAt,
                updated_at: new Date().toISOString()
              }])
            }
          );

          const parentOrder = savedOrders?.[0];

          if (!parentOrder?.id) {
            throw new Error(
              `Could not retrieve Supabase order ID for ${order.orderNumber}`
            );
          }

          syncedOrders++;


for (const brandOrder of order.brandOrders) {
  // Omit vendor_status, tracking_number and shipping_carrier.
  // This preserves existing vendor fulfillment data on repeat sync.
  await supabaseRequest(
    "brand_orders?on_conflict=order_id,brand_id",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify([{
        order_id: parentOrder.id,
        brand_id: brandOrder.brandId,
        order_number: order.orderNumber,
        ordered_at: order.orderedAt,
        shipping_address: brandOrder.shippingAddress,
        subtotal: brandOrder.subtotal,
        currency: brandOrder.currency,
        updated_at: new Date().toISOString()
      }])
    }
  );
}


            syncedBrandOrders++;

            const itemRecords = brandOrder.items.map(item => ({
              order_id: parentOrder.id,
              brand_id: brandOrder.brandId,
              product_id: item.productId,
              shopify_line_item_id: item.shopifyLineItemId,
              product_title: item.productTitle,
              variant_title: item.variantTitle,
              sku: item.sku,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              total_price: item.totalPrice
            }));

            // Save line items in batches of 100.
            for (let i = 0; i < itemRecords.length; i += 100) {
              const batch = itemRecords.slice(i, i + 100);

              await supabaseRequest(
                "order_items?on_conflict=shopify_line_item_id",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Prefer: "resolution=merge-duplicates,return=minimal"
                  },
                  body: JSON.stringify(batch)
                }
              );

              syncedOrderItems += batch.length;
            }
          }
        }

        return Response.json({
          message: "Brand-separated order synchronization successful.",
          mode: "saved",
          syncedOrders,
          syncedBrandOrders,
          syncedOrderItems,
          skippedOrders,
          skippedLineItems
        });

      } catch (error) {
        return Response.json({
          error: "Order synchronization failed",
          details: error.message
        }, { status: 500 });
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
