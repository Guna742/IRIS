/**
 * I.R.I.S — Page Transition System
 * Shows a branded loader with the destination page name on navigation.
 * Must be loaded in <head> to inject the overlay before first paint.
 */

'use strict';

const PageTransition = (() => {
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
    let isNavigating = false;

    // ── Build the loader DOM and inject it immediately ──
    function buildOverlay() {
        if (document.getElementById('iris-page-loader')) return;

        overlay = document.createElement('div');
        overlay.id = 'iris-page-loader';
        // Inline critical styles so it works even before CSS loads
        overlay.style.cssText = `
            position:fixed;inset:0;
            background:radial-gradient(ellipse at center,#0e0b1e 0%,#060912 100%);
            display:flex;align-items:center;justify-content:center;
            z-index:99999;opacity:0;pointer-events:none;
            transition:opacity 0.35s ease;
        `;
        overlay.innerHTML = `
            <div class="ipl-content">
                <div class="ipl-logo">
                    <img src="img/site-logo.png" alt="I.R.I.S" class="ipl-logo-img">
                    <span class="ipl-logo-text">I.R.I.S</span>
                </div>
                <div class="ipl-spinner"><span class="ipl-arc"></span></div>
                <div class="ipl-page-name" id="ipl-page-name">Loading…</div>
                <div class="ipl-bar-wrap"><div class="ipl-bar" id="ipl-bar"></div></div>
            </div>`;

        // Inject as soon as body exists
        const inject = () => {
            document.body.appendChild(overlay);
            nameEl = document.getElementById('ipl-page-name');
        };

        if (document.body) {
            inject();
        } else {
            document.addEventListener('DOMContentLoaded', inject);
        }
    }

    // ── Activate loader (exit: leaving current page) ──
    function show(label) {
        if (!overlay) buildOverlay();

        // Reset bar animation by cloning
        const bar = document.getElementById('ipl-bar');
        if (bar) {
            bar.style.animation = 'none';
            void bar.offsetWidth;
            bar.style.animation = '';
        }

        if (nameEl) {
            nameEl.textContent = label || 'Loading…';
            nameEl.classList.remove('ipl-name-in');
            void nameEl.offsetWidth;
            nameEl.classList.add('ipl-name-in');
        }

        if (overlay) {
            overlay.style.opacity = '1';
            overlay.style.pointerEvents = 'all';
        }
    }

    // ── Deactivate loader (entry: new page has loaded) ──
    function hide() {
        if (!overlay) return;
        overlay.style.transition = 'opacity 0.5s ease 0.1s';
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
    }

    // ── Navigate with loader ──
    function navigateTo(href, label) {
        if (isNavigating) return;
        isNavigating = true;

        if (!label) {
            const base = href.split('/').pop().split('?')[0].split('#')[0];
            label = PAGE_NAMES[base] || base.replace('.html', '').replace(/-/g, ' ');
            label = label.charAt(0).toUpperCase() + label.slice(1);
        }
        show(label);
        setTimeout(() => { window.location.href = href; }, 900);
    }

    // ── Intercept all internal <a> clicks ──
    function handleLinkClick(e) {
        const link = e.target.closest('a');
        if (!link || !link.href) return;
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

        const isExcluded = EXCLUDE_SELECTORS.some(sel => {
            try { return link.matches(sel); } catch { return false; }
        });
        if (isExcluded) return;

        try {
            const url = new URL(link.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            // Same page (ignore hash-only changes)
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;
            e.preventDefault();
            navigateTo(link.href);
        } catch { /* ignore malformed URLs */ }
    }

    // ── Init ──
    function init() {
        buildOverlay();

        // Hide loader when new page finishes loading
        window.addEventListener('load', () => {
            // Small delay so the user briefly sees the new page name
            setTimeout(hide, 150);
        });

        // Bfcache (back/forward button)
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                isNavigating = false;
                hide();
            }
        });

        // Intercept internal links
        document.addEventListener('click', handleLinkClick, true); // capture phase

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

// Expose for onclick usage
window.navigateWithLoader = (href, name) => PageTransition.navigateTo(href, name);

// Auto-start - run immediately since this is in <head>
PageTransition.init();
