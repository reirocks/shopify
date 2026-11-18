
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import './style.css';

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
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
    setError('');
  }

  if (loading) {
    return <main className="app"><p>Loading...</p></main>;
  }

  return (
    <main className="app">
      <section className="login-panel">
        <p className="eyebrow">MULTI-BRAND PLATFORM</p>
        <h1>Vendor Portal</h1>

        {!session ? (
          <>
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
          </>
        ) : (
          <div className="account-panel">
            <p className="welcome">Signed in successfully.</p>

            <h2>{profile?.display_name || session.user.email}</h2>
            <p className="account-email">{session.user.email}</p>

            <div className="account-details">
              <p>
                <strong>Account role</strong>
                <span>{profile?.platform_role || 'Not assigned'}</span>
              </p>

              <div className="brand-list">
                <strong>Assigned brand(s)</strong>

                {memberships.length > 0 ? (
                  memberships.map((membership) => (
                    <p className="brand-item" key={membership.brands?.slug}>
                      {membership.brands?.name || 'Unknown brand'}
                      <span>{membership.role}</span>
                    </p>
                  ))
                ) : (
                  <p>No brand assignments found.</p>
                )}
              </div>
            </div>

            {error && <p className="error-message">{error}</p>}

            <button className="logout-button" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}

        <p className="footer-note">Private vendor access</p>
      </section>
    </main>
  );
}

export default App;
