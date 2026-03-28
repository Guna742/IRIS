/**
 * I.R.I.S — Page Transition System
 * Shows a branded loader with the destination page name before every navigation.
 * Inject this script FIRST on every page (before storage.js, auth.js, etc.)
 */

'use strict';

const PageTransition = (() => {
    // ── Page name map (href basename → display label) ──
    const PAGE_NAMES = {
        'dashboard.html':        'Dashboard',
        'students.html':         'Intern Directory',
        'student-profile.html':  'Student Profile',
        'admin-profile.html':    'My Profile',
        'profile-builder.html':  'Profile Builder',
        'leaderboard.html':      'Leaderboard',
        'projects.html':         'Project Showcase',
        'doubts.html':           'The Wall',
        'report-submission.html':'Report Submission',
        'student-analytics.html':'Analytics',
        'login.html':            'Login',
        'info.html':             'Info',
    };

    const EXCLUDE_SELECTORS = [
        '[target="_blank"]',
        '[href^="#"]',
        '[href^="javascript:"]',
        '[href^="mailto:"]',
        '[href^="tel:"]',
        '.no-transition',
    ];

    let overlay = null;
    let nameEl  = null;

    // ── Build Loader DOM ──
    function buildOverlay() {
        if (document.getElementById('iris-page-loader')) return;

        overlay = document.createElement('div');
        overlay.id = 'iris-page-loader';
        overlay.innerHTML = `
            <div class="ipl-content">
                <div class="ipl-logo">
                    <img src="img/site-logo.png" alt="I.R.I.S" class="ipl-logo-img">
                    <span class="ipl-logo-text">I.R.I.S</span>
                </div>
                <div class="ipl-spinner">
                    <span class="ipl-arc"></span>
                </div>
                <div class="ipl-page-name" id="ipl-page-name">Loading…</div>
                <div class="ipl-bar-wrap"><div class="ipl-bar"></div></div>
            </div>`;
        document.body.appendChild(overlay);
        nameEl = overlay.querySelector('#ipl-page-name');
    }

    // ── Show loader (exit animation) ──
    function show(label) {
        if (!overlay) buildOverlay();
        if (nameEl) {
            nameEl.textContent = label || 'Loading…';
            // Reset animation
            nameEl.classList.remove('ipl-name-in');
            void nameEl.offsetWidth;
            nameEl.classList.add('ipl-name-in');
        }
        overlay.classList.add('ipl-visible');
    }

    // ── Hide loader (entry animation) ──
    function hide() {
        if (!overlay) return;
        overlay.classList.add('ipl-hiding');
        overlay.addEventListener('transitionend', () => {
            overlay.classList.remove('ipl-visible', 'ipl-hiding');
        }, { once: true });
    }

    // ── Navigate with loader ──
    function navigateTo(href, label) {
        // Derive label from page map if not provided
        if (!label) {
            const base = href.split('/').pop().split('?')[0].split('#')[0];
            label = PAGE_NAMES[base] || base.replace('.html', '').replace(/-/g, ' ');
            label = label.charAt(0).toUpperCase() + label.slice(1);
        }
        show(label);
        setTimeout(() => {
            window.location.href = href;
        }, 900); // sweet spot: loader visible long enough to read
    }

    // ── Intercept <a> clicks ──
    function handleLinkClick(e) {
        const link = e.target.closest('a');
        if (!link || !link.href) return;
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

        const isExcluded = EXCLUDE_SELECTORS.some(sel => link.matches(sel));
        if (isExcluded) return;

        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin) return;

        // Same page + same hash? Don't intercept
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;

        e.preventDefault();
        navigateTo(link.href);
    }

    // ── Init ──
    function init() {
        buildOverlay();

        // Hide loader when the new page has finished loading
        window.addEventListener('load', () => {
            document.body.classList.add('page-loaded');
            hide();
        });

        // Bfcache support (back/forward button)
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                document.body.classList.add('page-loaded');
                hide();
            }
        });

        // Intercept all internal links
        document.addEventListener('click', handleLinkClick);

        // Info button shortcut
        document.addEventListener('click', (e) => {
            const infoBtn = e.target.closest('#info-btn');
            if (infoBtn) {
                e.preventDefault();
                navigateTo('info.html', 'Info');
            }
        });
    }

    // Public API
    return { init, navigateTo, show, hide };
})();

// Expose globally for onclick usage
window.navigateWithLoader = (href, name) => PageTransition.navigateTo(href, name);

// Auto-start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', PageTransition.init);
} else {
    PageTransition.init();
}
