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
   * @param {string} role — 'admin' | 'employee' | 'user'
   * @returns {Promise<{ success: boolean, user?: object, error?: string }>}
   */
  async function login(email, password, role) {
    try {
      const cred = await fbAuth.signInWithEmailAndPassword(email.trim().toLowerCase(), password);
      const firebaseUser = cred.user;

      // Look up role from Firestore
      let storedRole = null;
      let displayName = firebaseUser.displayName || '';
      let data = null; 
      try {
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
              // Ensure users/{uid} has role:'admin' so Firestore security rules work correctly.
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

      // ── VERIFICATION CHECK FOR EMPLOYEES ──
      if (storedRole === 'employee' && data && data.verified === false) {
        await fbAuth.signOut();
        return { success: false, error: "Account pending verification. Please contact your administrator." };
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
      
      if (err.code) {
        const isCredentialError = ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/user-disabled', 'auth/invalid-email'].includes(err.code);
        if (isCredentialError) {
          msg = 'Invalid email or password. Please check your credentials.';
        } else if (err.code === 'auth/too-many-requests') {
          msg = 'Too many failed attempts. Please try again later.';
        } else if (err.code === 'auth/network-request-failed') {
          msg = 'Network error. Please check your internet connection.';
        } else {
          msg = `Login Error: ${err.message} (${err.code})`;
        }
      } else {
        msg = `System Error: ${err.name} - ${err.message}`;
      }
      
      return { success: false, error: msg };
    }
  }

  /** Clear session and redirect to login. */
  async function logout() {
    try { await fbAuth.signOut(); } catch (_) { }
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
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
   * Guard: require auth.
   * @param {string[]} [allowedRoles]
   */
  function requireAuth(allowedRoles) {
    const session = getSession();
    if (!session) {
      // Save return URL
      sessionStorage.setItem('iris_return_url', window.location.href);
      window.location.replace('login.html');
      return null;
    }
    if (allowedRoles && !allowedRoles.includes(session.role)) {
      redirectByRole();
      return null;
    }
    return session;
  }

  /** Redirect authenticated users based on role. */
  function redirectByRole() {
    const session = getSession();
    if (session) {
      // Check for a saved return URL first
      const returnUrl = sessionStorage.getItem('iris_return_url');
      if (returnUrl) {
        sessionStorage.removeItem('iris_return_url');
        window.location.replace(returnUrl);
        return;
      }

      if (session.role === 'admin') {
        window.location.replace('dashboard.html');
      } else if (session.role === 'employee') {
        window.location.replace('dashboard.html');
      } else {
        window.location.replace('dashboard.html');
      }
    } else {
      window.location.replace('login.html');
    }
  }

  // ── Automatic Auth Guard ──
  (() => {
    const path = window.location.pathname;
    const isLoginPage = path.endsWith('login.html') || path === '/' || path.endsWith('/') || path.endsWith('index.html');
    const session = getSession();

    if (!isLoginPage && !session) {
      sessionStorage.setItem('iris_return_url', window.location.href);
      window.location.replace('login.html');
      return;
    } 
    document.documentElement.style.visibility = '';
  })();

  return { login, logout, getSession, getRole, isAuthenticated, isAdmin, requireAuth, redirectByRole };
})();
