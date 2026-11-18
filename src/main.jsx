
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import './style.css';

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activePage, setActivePage] = useState('Dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    async function loadAccount() {
      if (!session?.user) {
        setProfile(null);
        setMemberships([]);
        return;
      }

      const userId = session.user.id;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, platform_role')
        .eq('id', userId)
        .single();

      if (profileError) {
        setError(profileError.message);
        return;
      }

      const { data: membershipData, error: membershipError } = await supabase
        .from('brand_memberships')
        .select('role, brands(name, slug)')
        .eq('user_id', userId);

      if (membershipError) {
        setError(membershipError.message);
        return;
      }

      setProfile(profileData);
      setMemberships(membershipData ?? []);
      setActivePage('Dashboard');
      setError('');
    }

    loadAccount();
  }, [session]);

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

  async function handleLogout() {
    await supabase.auth.signOut();
    setProfile(null);
    setMemberships([]);
    setPassword('');
    setActivePage('Dashboard');
    setError('');
  }

  if (loading) {
    return <main className="app"><p>Loading...</p></main>;
  }

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

  const brandNames = memberships
    .map((membership) => membership.brands?.name)
    .filter(Boolean);

  const currentBrand = brandNames[0] || 'Your Brand';

  function renderPage() {
    switch (activePage) {
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
              <p className="eyebrow">YOUR BRAND</p>
              <h2>{currentBrand}</h2>
              <p>
                Your brand workspace is ready. Products, orders and
                fulfillment information will appear here as we connect
                the platform to Shopify.
              </p>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-card">
                <span className="card-label">Products</span>
                <strong>—</strong>
                <span className="card-note">Not connected yet</span>
              </div>

              <div className="dashboard-card">
                <span className="card-label">Orders</span>
                <strong>—</strong>
                <span className="card-note">Not connected yet</span>
              </div>

              <div className="dashboard-card">
                <span className="card-label">To fulfill</span>
                <strong>—</strong>
                <span className="card-note">Not connected yet</span>
              </div>
            </div>

            <div className="content-panel">
              <h3>Getting started</h3>
              <p>
                Your vendor portal is set up. We'll connect your Shopify
                products and order information in the next development
                stages.
              </p>
            </div>
          </>
        );

      case 'Products':
        return (
          <section className="content-panel">
            <p className="eyebrow">CATALOGUE</p>
            <h1>Products</h1>
            <p>
              Your {currentBrand} product catalogue will appear here.
            </p>
            <div className="empty-state">
              <h3>Product management is coming next</h3>
              <p>
                We'll connect this section to your Shopify products,
                including product details, sales channels and status.
              </p>
            </div>
          </section>
        );

      case 'Orders':
        return (
          <section className="content-panel">
            <p className="eyebrow">SALES</p>
            <h1>Orders</h1>
            <p>
              Orders containing {currentBrand} products will appear here.
            </p>
            <div className="empty-state">
              <h3>Order management is coming next</h3>
              <p>
                We'll bring in Shopify orders and show vendors only
                the order items belonging to their brand.
              </p>
            </div>
          </section>
        );

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

createRoot(document.getElementById('root')).render(<App />);
