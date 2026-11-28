
export default function Products({
  products,
  currentBrand,
  selectedProduct,
  setSelectedProduct,
  productsLoading,
  productsError,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  filteredProducts,
  getProductVariants,
  getProductImage,
  getProductPrice,
  getProductInventory,
  formatPrice,
}) {
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
