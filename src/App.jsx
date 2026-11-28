

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import './style.css';

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);

  // Products
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Orders
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');

  const [activePage, setActivePage] = useState('Dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // =========================================
  // AUTHENTICATION
  // =========================================

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data?.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // =========================================
  // LOAD ACCOUNT, PRODUCTS AND ORDERS
  // =========================================

  useEffect(() => {
    async function loadAccount() {
      if (!session?.user) {
        setProfile(null);
        setMemberships([]);
        setProducts([]);
        setVariants([]);
        setSelectedProduct(null);
        setProductsError('');
        setProductsLoading(false);
        setOrders([]);
        setOrdersError('');
        setOrdersLoading(false);
        return;
      }

      const userId = session.user.id;

      setError('');
      setSelectedProduct(null);

      setProducts([]);
      setVariants([]);
      setProductsError('');
      setProductsLoading(true);

      setOrders([]);
      setOrdersError('');
      setOrdersLoading(false);

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, platform_role')
        .eq('id', userId)
        .single();

      if (profileError) {
        setError(profileError.message);
        setProductsLoading(false);
        return;
      }

      // Load brand memberships
      const { data: membershipData, error: membershipError } = await supabase
        .from('brand_memberships')
        .select('brand_id, role, brands(name, slug)')
        .eq('user_id', userId);

      if (membershipError) {
        setError(membershipError.message);
        setProductsLoading(false);
        return;
      }

      setProfile(profileData);
      setMemberships(membershipData ?? []);

      const brandIds = (membershipData ?? []).map(
        (membership) => membership.brand_id
      );

      // =========================================
      // LOAD BRAND PRODUCTS
      // =========================================

      if (brandIds.length > 0) {
        setProductsLoading(true);
        setProductsError('');

        const { data: productData, error: productError } = await supabase
          .from('products')
          .select(`
            id,
            title,
            handle,
            sales_channel,
            status,
            created_at,
            description,
            vendor,
            product_type,
            tags,
            featured_image_url,
            images,
            shopify_updated_at
          `)
          .in('brand_id', brandIds)
          .order('created_at', { ascending: false });

        if (productError) {
          setProductsError(productError.message);
          setProducts([]);
          setVariants([]);
        } else {
          const loadedProducts = productData ?? [];
          setProducts(loadedProducts);

          const productIds = loadedProducts.map(
            (product) => product.id
          );

          if (productIds.length > 0) {
            const { data: variantData, error: variantError } =
              await supabase
                .from('product_variants')
                .select(`
                  id,
                  product_id,
                  title,
                  sku,
                  barcode,
                  price,
                  compare_at_price,
                  currency_code,
                  options,
                  inventory_quantity,
                  inventory_tracked,
                  inventory_policy
                `)
                .in('product_id', productIds);

            if (variantError) {
              setProductsError(
                `Products loaded, but variant information could not be loaded: ${variantError.message}`
              );
              setVariants([]);
            } else {
              setVariants(variantData ?? []);
            }
          } else {
            setVariants([]);
          }
        }
      } else {
        setProducts([]);
        setVariants([]);
      }

      setProductsLoading(false);

      // =========================================
      // LOAD BRAND ORDERS
      // =========================================

      setOrders([]);
      setOrdersError('');
      setOrdersLoading(true);

      if (brandIds.length > 0) {
        const { data: brandOrderData, error: brandOrderError } =
          await supabase
            .from('brand_orders')
            .select(`
              id,
              order_id,
              brand_id,
              order_number,
              ordered_at,
              vendor_status,
              subtotal,
              currency,
              shipping_address,
              tracking_number,
              shipping_carrier
            `)
            .in('brand_id', brandIds)
            .order('ordered_at', { ascending: false });

        if (brandOrderError) {
          setOrdersError(brandOrderError.message);
          setOrders([]);
        } else {
          const loadedBrandOrders = brandOrderData ?? [];

          const orderIds = [
            ...new Set(
              loadedBrandOrders.map((order) => order.order_id)
            ),
          ];

          if (orderIds.length > 0) {
            const { data: itemData, error: itemError } = await supabase
              .from('order_items')
              .select(`
                id,
                order_id,
                brand_id,
                product_title,
                variant_title,
                sku,
                quantity,
                unit_price,
                total_price
              `)
              .in('order_id', orderIds)
              .in('brand_id', brandIds);

            if (itemError) {
              setOrdersError(itemError.message);
              setOrders(loadedBrandOrders);
            } else {
              const loadedItems = itemData ?? [];

              const ordersWithItems = loadedBrandOrders.map((order) => ({
                ...order,
                items: loadedItems.filter(
                  (item) =>
                    item.order_id === order.order_id &&
                    item.brand_id === order.brand_id
                ),
              }));

              setOrders(ordersWithItems);
            }
          } else {
            setOrders([]);
          }
        }
      } else {
        setOrders([]);
      }

      setOrdersLoading(false);

      // Reset page after account loading
      setActivePage('Dashboard');
      setError('');
    }

    loadAccount();
  }, [session]);

  // =========================================
  // LOGIN
  // =========================================

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  }

  // =========================================
  // LOGOUT
  // =========================================

  async function handleLogout() {
    await supabase.auth.signOut();

    setProfile(null);
    setMemberships([]);

    setProducts([]);
    setVariants([]);
    setSelectedProduct(null);
    setProductsError('');
    setProductsLoading(false);

    setOrders([]);
    setOrdersError('');
    setOrdersLoading(false);

    setPassword('');
    setSearchTerm('');
    setStatusFilter('all');
    setActivePage('Dashboard');
    setError('');
  }

  // =========================================
  // LOADING SCREEN
  // =========================================

  if (loading) {
    return <main className="app"><p>Loading...</p></main>;
  }

  // =========================================
  // LOGIN SCREEN
  // =========================================

  if (!session) {
    return (
      <main className="app">
        <section className="login-panel">
          <p className="eyebrow">MULTI-BRAND PLATFORM</p>
          <h1>Vendor Portal</h1>
          <p className="intro">
            Sign in to access your brand management portal.
          </p>

          <form onSubmit={handleLogin}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />

            {error && <p className="error-message">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="footer-note">Private vendor access</p>
        </section>
      </main>
    );
  }

  // =========================================
  // BRAND INFORMATION
  // =========================================

  const brandNames = memberships
    .map((membership) => membership.brands?.name)
    .filter(Boolean);

  const currentBrand = brandNames[0] || 'Your Brand';

  // =========================================
  // PRODUCT SUMMARY
  // =========================================

  const totalProducts = products.length;

  const activeProducts = products.filter(
    (product) => product.status === 'active'
  ).length;

  const draftProducts = products.filter(
    (product) => product.status === 'draft'
  ).length;

  const archivedProducts = products.filter(
    (product) => product.status === 'archived'
  ).length;

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.handle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_type?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || product.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // =========================================
  // PRODUCT HELPERS
  // =========================================

  function getProductVariants(productId) {
    return variants.filter(
      (variant) => variant.product_id === productId
    );
  }

  function formatPrice(value, currency = 'USD') {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(Number(value));
  }

  function getProductImage(product) {
    if (product.featured_image_url) {
      return product.featured_image_url;
    }

    if (Array.isArray(product.images) && product.images.length > 0) {
      return product.images[0]?.url || '';
    }

    return '';
  }

  function getProductPrice(product) {
    const productVariants = getProductVariants(product.id);

    const prices = productVariants
      .map((variant) => Number(variant.price))
      .filter((price) => Number.isFinite(price));

    if (prices.length === 0) return '—';

    const currency = productVariants.find(
      (variant) => variant.currency_code
    )?.currency_code || 'USD';

    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);

    if (lowest === highest) {
      return formatPrice(lowest, currency);
    }

    return `${formatPrice(lowest, currency)} – ${formatPrice(highest, currency)}`;
  }

  function getProductInventory(product) {
    const productVariants = getProductVariants(product.id);

    const trackedVariants = productVariants.filter(
      (variant) => variant.inventory_tracked
    );

    if (trackedVariants.length === 0) return '—';

    return trackedVariants.reduce(
      (total, variant) =>
        total + (Number(variant.inventory_quantity) || 0),
      0
    );
  }

  // =========================================
  // PAGE RENDERING
  // =========================================

  function renderPage() {
    switch (activePage) {

      // =========================================
      // DASHBOARD
      // =========================================

      case 'Dashboard':
        return (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">OVERVIEW</p>
                <h1>Dashboard</h1>
                <p className="page-description">
                  Welcome back, {profile?.display_name || 'Vendor'}.
                </p>
              </div>
            </div>

            <div className="welcome-panel">
              <p className="eyebrow">MY PAGE</p>
              <h2>{currentBrand}</h2>
              <p>
                Welcome to your brand workspace. Your product catalogue
                is connected and ready to manage.
              </p>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-card">
                <span className="card-label">Total products</span>
                <strong>{totalProducts}</strong>
                <span className="card-note">Products in your catalogue</span>
              </div>

              <div className="dashboard-card">
                <span className="card-label">Active products</span>
                <strong>{activeProducts}</strong>
                <span className="card-note">Currently active</span>
              </div>

              <div className="dashboard-card">
                <span className="card-label">Draft products</span>
                <strong>{draftProducts}</strong>
                <span className="card-note">Not yet published</span>
              </div>
            </div>

            <div className="content-panel">
              <h3>Catalogue overview</h3>
              <p>
                Your Shopify product catalogue is synchronized with the
                vendor portal. You can view product information, pricing,
                variants and inventory from the Products section.
              </p>
              <p>
                {archivedProducts} archived products in your catalogue.
              </p>
            </div>
          </>
        );

      // =========================================
      // PRODUCTS
      // =========================================

      case 'Products': {
        if (selectedProduct) {
          const product = selectedProduct;
          const productVariants = getProductVariants(product.id);
          const image = getProductImage(product);

          return (
            <section className="products-page">
              <button
                className="back-button"
                onClick={() => setSelectedProduct(null)}
              >
                ← Back to products
              </button>

              <div className="product-detail-header">
                {image ? (
                  <img
                    src={image}
                    alt={product.title}
                    className="product-detail-image"
                  />
                ) : (
                  <div className="product-detail-image product-image-placeholder">
                    No image
                  </div>
                )}

                <div className="product-detail-info">
                  <p className="eyebrow">PRODUCT DETAILS</p>
                  <h1>{product.title}</h1>

                  <span className={`status-label status-${product.status}`}>
                    {product.status}
                  </span>

                  <p className="product-detail-price">
                    {getProductPrice(product)}
                  </p>

                  <p className="page-description">
                    {product.product_type || 'Product type not specified'}
                  </p>
                </div>
              </div>

              <div className="product-detail-grid">
                <div className="content-panel">
                  <h3>Product information</h3>

                  <div className="product-information-list">
                    <p>
                      <strong>Vendor</strong>
                      <span>{product.vendor || '—'}</span>
                    </p>
                    <p>
                      <strong>Handle</strong>
                      <span>{product.handle || '—'}</span>
                    </p>
                    <p>
                      <strong>Sales channel</strong>
                      <span>{product.sales_channel || '—'}</span>
                    </p>
                    <p>
                      <strong>Inventory</strong>
                      <span>{getProductInventory(product)}</span>
                    </p>
                    <p>
                      <strong>Variants</strong>
                      <span>{productVariants.length}</span>
                    </p>
                  </div>
                </div>

                <div className="content-panel">
                  <h3>Description</h3>
                  <div className="product-description">
                    {product.description ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: product.description,
                        }}
                      />
                    ) : (
                      <p>No description available.</p>
                    )}
                  </div>

                  {Array.isArray(product.tags) && product.tags.length > 0 && (
                    <div className="product-tags">
                      {product.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="content-panel product-variants-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">INVENTORY</p>
                    <h3>Variants</h3>
                  </div>
                  <span>{productVariants.length} variants</span>
                </div>

                {productVariants.length === 0 ? (
                  <div className="empty-state">
                    No variant information is available for this product yet.
                  </div>
                ) : (
                  <div className="products-table-wrapper">
                    <table className="products-table">
                      <thead>
                        <tr>
                          <th>Variant</th>
                          <th>SKU</th>
                          <th>Price</th>
                          <th>Compare at</th>
                          <th>Inventory</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productVariants.map((variant) => (
                          <tr key={variant.id}>
                            <td>{variant.title || 'Default'}</td>
                            <td>{variant.sku || '—'}</td>
                            <td>
                              {formatPrice(
                                variant.price,
                                variant.currency_code || 'USD'
                              )}
                            </td>
                            <td>
                              {formatPrice(
                                variant.compare_at_price,
                                variant.currency_code || 'USD'
                              )}
                            </td>
                            <td>
                              {variant.inventory_tracked
                                ? variant.inventory_quantity ?? 0
                                : 'Not tracked'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          );
        }

        const activeCount = products.filter(
          (product) => product.status === 'active'
        ).length;

        const draftCount = products.filter(
          (product) => product.status === 'draft'
        ).length;

        return (
          <section className="products-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">CATALOGUE</p>
                <h1>Products</h1>
                <p className="page-description">
                  Manage the products belonging to {currentBrand}.
                </p>
              </div>
            </div>

            <div className="product-summary-grid">
              <div className="dashboard-card">
                <span className="card-label">Total products</span>
                <strong>{products.length}</strong>
              </div>

              <div className="dashboard-card">
                <span className="card-label">Active</span>
                <strong>{activeCount}</strong>
              </div>

              <div className="dashboard-card">
                <span className="card-label">Draft</span>
                <strong>{draftCount}</strong>
              </div>
            </div>

            <div className="products-toolbar">
              <input
                type="search"
                className="product-search"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />

              <select
                className="product-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>

              <span className="product-result-count">
                {filteredProducts.length} products
              </span>
            </div>

            {productsError && (
              <p className="error-message">{productsError}</p>
            )}

            {productsLoading ? (
              <div className="empty-state">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="empty-state">
                <h3>No products yet</h3>
                <p>
                  Products assigned to {currentBrand} will appear here.
                </p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="empty-state">
                <h3>No matching products</h3>
                <p>Try changing your search or status filter.</p>
              </div>
            ) : (
              <div className="products-table-wrapper">
                <table className="products-table catalogue-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Type</th>
                      <th>Variants</th>
                      <th>Price</th>
                      <th>Inventory</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProducts.map((product) => {
                      const image = getProductImage(product);
                      const productVariants = getProductVariants(product.id);

                      return (
                        <tr
                          key={product.id}
                          className="product-row"
                          onClick={() => setSelectedProduct(product)}
                        >
                          <td>
                            <div className="product-table-item">
                              {image ? (
                                <img
                                  src={image}
                                  alt=""
                                  className="product-thumbnail"
                                />
                              ) : (
                                <div className="product-thumbnail product-image-placeholder">
                                  —
                                </div>
                              )}

                              <div>
                                <strong>{product.title}</strong>
                                <span>{product.handle || 'No handle'}</span>
                              </div>
                            </div>
                          </td>

                          <td>{product.product_type || '—'}</td>
                          <td>{productVariants.length}</td>
                          <td>{getProductPrice(product)}</td>
                          <td>{getProductInventory(product)}</td>

                          <td>
                            <span
                              className={`status-label status-${product.status}`}
                            >
                              {product.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      }

      // =========================================
      // ORDERS
      // =========================================

      case 'Orders':
        return (
          <section className="content-panel">
            <p className="eyebrow">SALES</p>
            <h1>Orders</h1>
            <p>
              Orders containing {currentBrand} products will appear here.
            </p>

            {ordersError && (
              <p className="error-message">{ordersError}</p>
            )}

            {ordersLoading ? (
              <div className="empty-state">
                Loading orders...
              </div>
            ) : (
              <div className="empty-state">
                <h3>
                  {orders.length > 0
                    ? `${orders.length} orders loaded`
                    : 'No orders yet'}
                </h3>
                <p>
                  {orders.length > 0
                    ? 'Your brand orders have been loaded successfully. The order display is our next step.'
                    : 'Orders containing your brand products will appear here.'}
                </p>
              </div>
            )}
          </section>
        );

      // =========================================
      // FULFILLMENT
      // =========================================

      case 'Fulfillment':
        return (
          <section className="content-panel">
            <p className="eyebrow">DELIVERY</p>
            <h1>Fulfillment</h1>
            <p>Manage preparation, shipping and tracking.</p>

            <div className="empty-state">
              <h3>Fulfillment tools are coming next</h3>
              <p>
                Vendors will be able to update processing status,
                shipping carrier and tracking information here.
              </p>
            </div>
          </section>
        );

      // =========================================
      // ACCOUNT
      // =========================================

      case 'Account':
        return (
          <section className="content-panel">
            <p className="eyebrow">PROFILE</p>
            <h1>Account</h1>

            <div className="account-details">
              <p>
                <strong>Name</strong>
                <span>{profile?.display_name || 'Not assigned'}</span>
              </p>
              <p>
                <strong>Email</strong>
                <span>{session.user.email}</span>
              </p>
              <p>
                <strong>Platform role</strong>
                <span>{profile?.platform_role || 'Not assigned'}</span>
              </p>
              <p>
                <strong>Brand</strong>
                <span>{brandNames.join(', ') || 'Not assigned'}</span>
              </p>
            </div>

            <button className="logout-button" onClick={handleLogout}>
              Sign out
            </button>
          </section>
        );

      default:
        return null;
    }
  }

  // =========================================
  // NAVIGATION
  // =========================================

  const navigation = [
    'Dashboard',
    'Products',
    'Orders',
    'Fulfillment',
    'Account',
  ];

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">MULTI-BRAND PLATFORM</p>
          <h2>Vendor Portal</h2>
        </div>

        <div className="sidebar-workspace">
          <span className="workspace-label">WORKSPACE</span>
          <strong>{currentBrand}</strong>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-label">MENU</span>

          {navigation.map((item) => (
            <button
              key={item}
              className={`nav-item ${activePage === item ? 'active' : ''}`}
              onClick={() => setActivePage(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>{profile?.display_name || 'Vendor'}</span>
          <button onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <span>{currentBrand} Workspace</span>
          <span className="topbar-role">
            {profile?.platform_role || 'Vendor'}
          </span>
        </header>

        <div className="page-content">
          {error && <p className="error-message">{error}</p>}
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

