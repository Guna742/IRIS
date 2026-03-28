/**
 * I.R.I.S — Cinematic Page Transition Engine (V12 - FINAL FIXED)
 * Fixes Double-Animation / Rebuilding Glitch.
 */

'use strict';

const PageTransition = (() => {
    // ── Configuration ──
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

    const DEPARTURE_DELAY = 1000; 
    const ARRIVAL_HOLD    = 800;  
    const EXCLUDE_SELECTORS = ['[target="_blank"]', '[href^="#"]', '[href^="javascript:"]', '.no-transition'];

    let loader = null;
    let pageName = null;
    let isNavigating = false;

    // ── FIX 3 — Stop overlay rebuilding glitch ──
    function buildOverlay() {
        const existing = document.getElementById('page-loader');
        if (existing) {
            loader = existing;
            pageName = document.getElementById('pageName');
            return;
        }

        loader = document.createElement('div');
        loader.id = 'page-loader';
        loader.innerHTML = `<div class="ipl-page-name" id="pageName"></div>`;

        const transitionLabel = sessionStorage.getItem('transition');
        const alreadyPlayed = sessionStorage.getItem('transitionPlayed');

        if (transitionLabel && alreadyPlayed === 'false') {
            loader.classList.add('active'); // Maintain state
            document.documentElement.style.overflow = 'hidden';
        }

        const inject = () => {
            if (document.body) {
                document.body.prepend(loader);
                pageName = document.getElementById('pageName');
                handleArrival();
            }
        };

        if (document.body) inject();
        else {
            const observer = new MutationObserver(() => {
                if (document.body) {
                    observer.disconnect();
                    inject();
                }
            });
            observer.observe(document.documentElement, { childList: true });
        }
    }

    // ── Departure logic (Page A) ──
    function navigateTo(href, customLabel) {
        if (isNavigating) return;
        isNavigating = true;

        const label = customLabel || getLabelFor(href);

        // 🔧 FIX 2 — Mark transition stage
        sessionStorage.setItem('transition', label);
        sessionStorage.setItem('transitionPlayed', 'false');

        if (pageName) {
            pageName.textContent = label;
            pageName.style.transition = 'none';
            pageName.style.opacity = '1';
            void pageName.offsetHeight; 
            pageName.style.transition = ''; 
        }

        if (loader) {
            loader.classList.remove('ipl-hiding');
            loader.classList.add('active');
        }

        setTimeout(() => { window.location.href = href; }, DEPARTURE_DELAY);
    }

    // ── Arrival logic (Page B) ──
    function handleArrival() {
        const transitionLabel = sessionStorage.getItem('transition');
        const alreadyPlayed = sessionStorage.getItem('transitionPlayed');

        if (!transitionLabel || alreadyPlayed === 'true') {
            revealPage();
            return;
        }

        // ✅ FIX 4 — Avoid instant re-animation (Static Visibility)
        if (pageName) {
            pageName.textContent = transitionLabel;
            pageName.style.opacity = '1';
        }

        // Mark as played to prevent re-animation on reload or back
        sessionStorage.setItem('transitionPlayed', 'true');
        sessionStorage.removeItem('transition');

        const finalize = () => {
            revealPage();
            // Holding center for 0.8s while blurred before fade out
            setTimeout(performFadeOut, ARRIVAL_HOLD);
        };

        if (document.readyState === 'complete') finalize();
        else window.addEventListener('load', finalize);
        
        setTimeout(() => { if (!document.body.classList.contains('ready')) finalize(); }, 4000);
    }

    function revealPage() {
        document.body.classList.add('ready');
        document.documentElement.style.overflow = '';
    }

    function performFadeOut() {
        if (!loader || !pageName) return;
        
        // Final dissolve
        pageName.style.opacity = '0';
        pageName.style.transform = 'scale(1.1)';
        pageName.style.transition = 'opacity 0.8s ease, transform 0.8s ease';

        setTimeout(() => {
            loader.classList.add('ipl-hiding');
        }, 300);

        setTimeout(() => {
            loader.style.display = 'none';
        }, 3000);
    }

    function getLabelFor(href) {
        try {
            const url = new URL(href, window.location.href);
            const file = url.pathname.split('/').pop() || 'dashboard.html';
            return (PAGE_NAMES[file] || file.replace('.html', '').replace(/-/g, ' ')).toUpperCase();
        } catch { return 'IRIS'; }
    }

    function init() {
        buildOverlay();
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link || !link.href || e.defaultPrevented) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

            const isExcluded = EXCLUDE_SELECTORS.some(sel => {
                try { return link.matches(sel); } catch { return false; }
            });
            if (isExcluded) return;

            const url = new URL(link.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;
            
            e.preventDefault();
            navigateTo(link.href);
        });
    }

    return { init, navigateTo };
})();

// Auto-run
PageTransition.init();
