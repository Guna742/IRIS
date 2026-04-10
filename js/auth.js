/**
 * I.R.I.S — Auth Module (Firebase-backed)
 * Central authentication & session management.
 * Uses Firebase Auth + Firestore (compat SDK via CDN).
 */

'use strict';

// ── INSTANT FLASH PREVENTION ──
// Hide the page immediately so no content is ever shown to unauthenticated users.
// The page will be revealed only after the auth guard below confirms access is allowed.
document.documentElement.style.visibility = 'hidden';

const Auth = (() => {
  const SESSION_KEY = 'iris_session';

  // ── Persist session to localStorage after Firebase sign-in ──
  function _persistSession(firebaseUser, role, displayName) {
    const session = {
      userId: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: displayName || firebaseUser.displayName || firebaseUser.email.split('@')[0],
      role: role,
      loginTime: Date.now(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  /**
   * Attempt login using Firebase Auth.
   * @param {string} email
   * @param {string} password
   * @param {string} role — 'admin' | 'user'
   * @returns {Promise<{ success: boolean, user?: object, error?: string }>}
   */
  async function login(email, password, role) {
    try {
      const cred = await fbAuth.signInWithEmailAndPassword(email.trim().toLowerCase(), password);
      const firebaseUser = cred.user;

      // Look up role from Firestore
      let storedRole = null;
      let displayName = firebaseUser.displayName || '';
      try {
        let data = null;
        const doc = await fbDb.collection('users').doc(firebaseUser.uid).get();
        if (doc.exists) {
          data = doc.data();
        }

        // Fetch role - prefer Firestore data
        if (data) {
          storedRole = data.role;
          displayName = data.displayName || data.name || displayName;
        }

        // If admin, also try admins/ collection for richer profile
        if (role === 'admin') {
          try {
            const adminDoc = await fbDb.collection('admins').doc(firebaseUser.uid).get();
            if (adminDoc.exists) {
              storedRole = 'admin'; // Confirm they are indeed an admin
              const adminData = adminDoc.data();
              displayName = adminData.name || displayName;
              if (typeof Storage !== 'undefined' && Storage.saveAdminProfile) {
                Storage.saveAdminProfile(firebaseUser.uid, adminData);
              }

              // ── CRITICAL FIX ──
              // Ensure users/{uid} has role:'admin' so Firestore security rules
              // (isAdmin() checks users/{uid}.role == 'admin') work correctly.
              // Without this, all admin Firestore writes return permission-denied.
              if (!data || data.role !== 'admin') {
                try {
                  await fbDb.collection('users').doc(firebaseUser.uid).set({
                    role: 'admin',
                    name: adminData.name || displayName,
                    email: firebaseUser.email,
                    userId: firebaseUser.uid,
                    updatedAt: Date.now()
                  }, { merge: true });
                  console.log('[Auth] Admin role synced to users/ collection for Firestore rules.');
                } catch (syncErr) {
                  console.warn('[Auth] Could not sync admin role to users/ collection:', syncErr.message);
                }
              }
            }
          } catch (_) { /* admin doc may not exist yet */ }
        }

        // Sync cloud profile to local storage for interns and employees
        if (data && (storedRole === 'user' || storedRole === 'employee') && typeof Storage !== 'undefined' && Storage.saveProfile) {
          Storage.saveProfile(firebaseUser.uid, data);
        }

      } catch (err) {
        console.warn('[Auth] Firestore profile fetch failed:', err);
      }

      // Verify role matches what the user selected
      if (!storedRole || storedRole !== role) {
        await fbAuth.signOut();
        const roleLabel = { admin: 'an Admin', employee: 'an Employee', user: 'an Intern' };
        const errorMessage = !storedRole 
          ? "Unauthorized access. This account has no assigned role in the system."
          : `This account is registered as ${roleLabel[storedRole] || storedRole}, not ${roleLabel[role] || role}.`;
        return { success: false, error: errorMessage };
      }

      // Sync everything from the cloud to local storage (force = true)
      if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        await Storage.fetchEverything(true);
      }

      const session = _persistSession(firebaseUser, storedRole, displayName);
      return { success: true, user: session };

    } catch (err) {
      console.error('Login error:', err);
      let msg = 'Sign in failed. Please try again.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password. Please check your credentials.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed attempts. Please try again later.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      return { success: false, error: msg };
    }
  }



  /** Clear session and redirect to login. */
  async function logout() {
    try { await fbAuth.signOut(); } catch (_) { }
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    // When logging out, clear any return path to avoid confusion
    sessionStorage.removeItem('iris_return_url');
    window.location.href = 'login.html';
  }

  /** Get current session object, or null if not authenticated. */
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Get current user role. */
  function getRole() {
    const s = getSession();
    return s ? s.role : null;
  }

  /** Returns true if authenticated. */
  function isAuthenticated() {
    return getSession() !== null;
  }

  /** Returns true if current user is admin. */
  function isAdmin() {
    return getRole() === 'admin';
  }

  /**
   * Guard: require auth. If not authenticated, redirect to login.
   * @param {string[]} [allowedRoles]
   */
  function requireAuth(allowedRoles) {
    const session = getSession();
    if (!session) {
      window.location.replace('login.html');
      return null;
    }
    if (allowedRoles && !allowedRoles.includes(session.role)) {
      redirectByRole(); // Smart redirect based on role
      return null;
    }
    return session;
  }

  /** Redirect authenticated users away from login page or on auth failure. */
  function redirectByRole() {
    const session = getSession();
    if (session) {
      // Check for a saved return URL first
      const returnUrl = sessionStorage.getItem('iris_return_url');
      if (returnUrl) {
        sessionStorage.removeItem('iris_return_url'); // Use once
        window.location.replace(returnUrl);
        return;
      }

      if (session.role === 'admin') {
        window.location.replace('dashboard.html');
      } else if (session.role === 'employee') {
        window.location.replace('employee-profile.html');
      } else {
        window.location.replace('dashboard.html');
      }
    } else {
      window.location.replace('login.html');
    }
  }

  // ── Automatic Auth Guard ──
  // Triggers immediately when Auth module loads to prevent unauthorized access.
  // Page is hidden (see top of file) and only revealed here if user is allowed.
  (() => {
    const path = window.location.pathname;
    // Robust check for login page: ends with login.html, is the root /, or is index.html
    const isLoginPage = path.endsWith('login.html') || path === '/' || path.endsWith('/') || path.endsWith('index.html');
    const session = getSession();

    if (!isLoginPage && !session) {
      // Not on login page & not logged in -> redirect to login immediately.
      // Save the current path to return here after login
      sessionStorage.setItem('iris_return_url', window.location.href);
      window.location.replace('login.html');
      return; // Don't reveal the page
    } 
    
    // If on login page and already have a session, maybe they want to go to their dashboard?
    // But we are respecting the "login page must come first" or manual access.
    // If the user is on login page but ALREADY has a returnUrl (from a previous session/redirect),
    // we keep it so redirectByRole can use it after login.

    // ── User is allowed on this page — reveal it ──
    document.documentElement.style.visibility = '';
  })();

  return { login, logout, getSession, getRole, isAuthenticated, isAdmin, requireAuth, redirectByRole };
})();
