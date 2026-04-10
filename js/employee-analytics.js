/**
 * I.R.I.S — Employee Analytics
 * Wraps the student-analytics logic for employees.
 * Auth: allows 'employee' role (self-view only) and 'admin' (any user).
 *
 * Strategy: override the session role check inline before delegating to
 * the shared analytics renderer. All chart/report logic is unchanged.
 */

'use strict';

// Patch Auth.requireAuth for this page ONLY — accept employees
(async () => {
    const session = Auth.getSession();
    if (!session) {
        window.location.replace('login.html');
        return;
    }

    // Employees can only see their OWN analytics
    if (session.role === 'employee') {
        // Force targetUid to self
        const url = new URL(window.location.href);
        if (!url.searchParams.get('student')) {
            url.searchParams.set('student', session.userId);
            window.history.replaceState({}, '', url.toString());
        } else if (url.searchParams.get('student') !== session.userId) {
            // Block employees viewing other profiles
            url.searchParams.set('student', session.userId);
            window.history.replaceState({}, '', url.toString());
        }
    }

    if (!['admin', 'employee'].includes(session.role)) {
        window.location.replace('dashboard.html');
        return;
    }

    // ── Now load the shared analytics engine ──
    // The student-analytics.js expects requireAuth(['admin','user']).
    // We workaround by temporarily patching the session role for the page load.
    const originalRole = session.role;

    // Patch: treat employee as 'user' for analytics rendering so all
    // intern-facing UI (self-only view, no admin controls) renders correctly.
    if (session.role === 'employee') {
        const patchedSession = { ...session, role: 'user' };
        sessionStorage.setItem('iris_session', JSON.stringify(patchedSession));

        // Restore after analytics script runs (3s safety delay)
        setTimeout(() => {
            const restored = { ...patchedSession, role: 'employee' };
            sessionStorage.setItem('iris_session', JSON.stringify(restored));
        }, 3000);
    }

    // ── Post-render: relabel "Intern" -> "Employee" in the DOM ──
    function relabelForEmployee() {
        if (originalRole !== 'employee') return;

        // Fix topbar badge
        const badge = document.getElementById('topbar-role-badge');
        if (badge) { badge.textContent = 'Employee'; badge.className = 'badge badge-employee'; }

        // Fix role banner sub text
        document.querySelectorAll('.role-banner-sub, .role-banner-title').forEach(el => {
            if (el.textContent.includes('Technical Intern')) {
                el.textContent = el.textContent.replace(/Technical Intern/g, 'Employee');
            }
        });

        // Fix table "Role" column cells
        document.querySelectorAll('td span').forEach(el => {
            if (el.textContent.trim() === 'Technical Intern') {
                el.textContent = 'Employee';
            }
        });

        // Fix back button link
        const backBtn = document.querySelector('a[href="students.html"]');
        if (backBtn) backBtn.href = 'employee-profile.html';

        // Fix "Edit Project" submit report link for employees
        const submitLink = document.querySelector('a[href="report-submission.html"]');
        if (submitLink) submitLink.href = 'employee-report.html';
    }

    // Run relabeling after analytics renders (phased)
    setTimeout(relabelForEmployee, 500);
    setTimeout(relabelForEmployee, 2500);
    setTimeout(relabelForEmployee, 4000);

})();
