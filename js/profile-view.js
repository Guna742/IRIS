/**
 * I.R.I.S — Profile View (Router)
 * This page acts as a router to send users to their specific profile pages.
 */

'use strict';

(() => {
  const session = Auth.requireAuth();
  if (!session) return;

  // Simple redirection logic based on session role
  if (session.role === 'admin') {
    window.location.replace('admin-profile.html');
  } else {
    // Standard intern profile view
    window.location.replace('student-profile.html');
  }
})();
