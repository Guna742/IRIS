/**
 * I.R.I.S — Sidebar Engine
 * Centralized logic for sidebar navigation, user info population, and mobile toggling.
 */

'use strict';

const SidebarEngine = (() => {
    const init = () => {
        const session = Auth.getSession();
        if (!session) return;

        const isAdmin = session.role === 'admin';

        // ── DOM refs ──
        const sidebarNav = document.getElementById('sidebar-nav');
        const userAvatarSb = document.getElementById('user-avatar-sidebar');
        const userNameSb = document.getElementById('user-name-sidebar');
        const userRoleSb = document.getElementById('user-role-sidebar');
        const roleBadgeTopbar = document.getElementById('topbar-role-badge');
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const appSidebar = document.getElementById('app-sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const logoutBtn = document.getElementById('logout-btn');

        // ── Populate User Info ──
        const adminProfile = isAdmin ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null) : null;
        const userProfile = !isAdmin ? (Storage.getProfile ? Storage.getProfile(session.userId) : null) : null;
        const currentName = (isAdmin ? adminProfile?.name : userProfile?.name) || session.displayName || 'User';
        const currentAvatar = isAdmin ? adminProfile?.avatar : userProfile?.avatar;

        if (userAvatarSb) {
            if (currentAvatar) {
                userAvatarSb.innerHTML = `<img src="${currentAvatar}" alt="${currentName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                userAvatarSb.textContent = currentName[0].toUpperCase();
            }
        }
        if (userNameSb) userNameSb.textContent = currentName;
        if (userRoleSb) userRoleSb.textContent = isAdmin ? (adminProfile?.role || 'Administrator') : 'Intern';
        
        // ── Global Role Badges ──
        const roleBadges = [document.getElementById('topbar-role-badge'), document.getElementById('role-badge-main')];
        roleBadges.forEach(badge => {
            if (badge) {
                badge.textContent = isAdmin ? 'Admin' : 'Intern';
                badge.className = `badge ${isAdmin ? 'badge-admin' : 'badge-user'}`;
            }
        });

        // ── Global Role Banners ──
        const roleBanner = document.getElementById('role-banner');
        if (roleBanner) {
            roleBanner.classList.remove('admin', 'user');
            roleBanner.classList.add(isAdmin ? 'admin' : 'user');
        }

        // ── Notification Logic ──
        const projects = typeof Storage !== 'undefined' ? Storage.getProjects() : [];
        let projectAlertCount = 0;
        
        projects.forEach(p => {
            const lastSeen = parseInt(localStorage.getItem(`iris_seen_${p.id}`) || '0', 10);
            const activityTime = p.comments?.length 
                ? p.comments[p.comments.length - 1].timestamp 
                : (p.updatedAt || 0);

            if (activityTime > lastSeen) {
                if (isAdmin) {
                    // Admins see a dot if a project was Resubmitted
                    if (p.status === 'Resubmitted') projectAlertCount++;
                } else {
                    // Interns see a dot if THEIR project has 'Changes Requested' or a new Admin comment
                    if (String(p.userId || p.ownerId) === String(session.userId)) {
                        const hasAdminCmt = p.comments?.length && p.comments[p.comments.length - 1].role === 'admin';
                        if (p.status === 'Changes Requested' || hasAdminCmt) projectAlertCount++;
                    }
                }
            }
        });

        const hasProjectAlert = projectAlertCount > 0;

        const NAV_INTERN = [
            { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view', tooltip: 'Your control center 🚀' },
            { label: 'My Profile', href: 'student-profile.html', icon: 'person', tooltip: 'Your identity 👤' },
            { label: 'Leaderboard', href: 'leaderboard.html', icon: 'leaderboard', tooltip: 'Glory board 🏆' },
            { label: 'Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics', tooltip: 'Performance tracking 📈' },
            { label: 'Submit Report', href: 'report-submission.html', icon: 'description', tooltip: 'Drop your progress 📝' },
            { label: 'Projects', href: 'projects.html', icon: 'folder', tooltip: 'The vault 📂', alertCount: projectAlertCount },
            { label: 'The Wall', href: 'doubts.html', icon: 'chat', tooltip: 'Community hub 💬' }, 
        ];

        const NAV_ADMIN = [
            { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view', tooltip: 'Main control center 🚀' },
            { label: 'My Profile', href: 'admin-profile.html', icon: 'person', tooltip: 'Admin sanctuary 🏰' },
            { label: 'Interns', href: 'students.html', icon: 'group', tooltip: 'Success registry 📂' },
            { label: 'Projects', href: 'projects.html', icon: 'folder', tooltip: 'The vault 📂', alertCount: projectAlertCount },
            { label: 'The Wall', href: 'doubts.html', icon: 'chat', tooltip: 'Community hub 💬' }, 
        ];

        const navItems = isAdmin ? NAV_ADMIN : NAV_INTERN;
        const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';

        if (sidebarNav) {
            let navHTML = `<div class="nav-section-label">Menu</div>`;
            navItems.forEach(item => {
                const itemBase = item.href.split('?')[0];
                const isActive = (currentPath === itemBase) || (currentPath === 'index.html' && itemBase === 'dashboard.html');
                const badgeHTML = item.alertCount ? `
                    <span class="nav-dot" style="position:absolute; top:-4px; right:-6px; width:16px; height:16px; background:var(--clr-accent, #8b5cf6); border-radius:50%; border:2px solid var(--clr-bg-surface); box-shadow:0 0 10px var(--clr-accent); color:white; font-size:9px; font-weight:800; display:flex; align-items:center; justify-content:center;">
                        ${item.alertCount}
                    </span>` : '';
                
                navHTML += `
                    <a class="nav-item${isActive ? ' active' : ''}" href="${item.href}" aria-current="${isActive ? 'page' : 'false'}" title="${item.tooltip || item.label}">
                        <span class="nav-icon" aria-hidden="true" style="position:relative;">
                            <span class="material-symbols-outlined">${item.icon}</span>
                            ${badgeHTML}
                        </span>
                        <span>${item.label}</span>
                    </a>`;
            });
            sidebarNav.innerHTML = navHTML;
        }

        // ── Update Topbar Title with Mobile Support ──
        const topbarTitle = document.querySelector('.topbar-title');
        if (topbarTitle) {
            const activeItem = navItems.find(item => {
                const itemBase = item.href.split('?')[0];
                return (currentPath === itemBase) || (currentPath === 'index.html' && itemBase === 'dashboard.html');
            }) || { label: 'I.R.I.S', icon: 'auto_awesome' };

            topbarTitle.innerHTML = `
                <div class="desktop-title-wrap desktop-title">
                    <span class="material-symbols-outlined topbar-title-icon">${activeItem.icon}</span>
                    <span>${activeItem.label}</span>
                </div>
                <span class="mobile-title material-symbols-outlined" style="font-size:24px;">${activeItem.icon}</span>
            `;
        }

        // ── Sidebar Toggling ──
        const openSidebar = () => {
            if (appSidebar) appSidebar.classList.add('open');
            if (sidebarOverlay) {
                sidebarOverlay.classList.add('visible');
                // Force display if inline styles were used previously
                sidebarOverlay.style.display = 'block';
            }
            if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'true');
            // Prevent body scroll when open
            document.body.style.overflow = 'hidden';
        };

        const closeSidebar = () => {
            if (appSidebar) appSidebar.classList.remove('open');
            if (sidebarOverlay) {
                sidebarOverlay.classList.remove('visible');
                sidebarOverlay.style.display = 'none';
            }
            if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        };

        if (hamburgerBtn) {
            hamburgerBtn.onclick = (e) => {
                e.stopPropagation();
                const isOpen = appSidebar && appSidebar.classList.contains('open');
                isOpen ? closeSidebar() : openSidebar();
            };
        }

        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', closeSidebar);
        }

        // ── Logout ──
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof Auth !== 'undefined') Auth.logout();
            });
        }

        // ── Ensure Admin Popup is initialized for this page ──
        if (typeof AdminPopup !== 'undefined' && AdminPopup.init) {
            AdminPopup.init();
        }
    };

    return { init };
})();

// Initialize on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', SidebarEngine.init);
} else {
    SidebarEngine.init();
}

// Global listener for dynamic data updates (e.g. marking as read)
window.addEventListener('iris-data-sync', (e) => {
    console.log('[Sidebar] Data sync event received:', e.detail);
    SidebarEngine.init();
});
