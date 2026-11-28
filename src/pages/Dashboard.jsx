
export default function Dashboard({
  profile,
  currentBrand,
  totalProducts,
  activeProducts,
  draftProducts,
  archivedProducts,
}) {
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
}
