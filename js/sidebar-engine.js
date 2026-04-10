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
        const isEmployee = session.role === 'employee';

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
        const sidebarSlogan = document.querySelector('.sidebar-slogan');

        // FORCE "Employee" slogan/branding if on an employee-specific page
        const isEmployeePage = window.location.pathname.includes('employee-');
        
        if (sidebarSlogan) {
            // Slogan is "Internal" for professional roles (Employee, Admin) or on professional pages
            sidebarSlogan.textContent = (isEmployee || isAdmin || isEmployeePage) ? 'Internal Review & Intelligence System' : 'Intern Review & Intelligence System';
        }

        // ── Populate User Info ──
        const adminProfile = isAdmin ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null) : null;
        const userProfile = (isEmployee || !isAdmin) ? (Storage.getProfile ? Storage.getProfile(session.userId) : null) : null;
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
        
        const assignedRole = isAdmin 
            ? 'Administrator' 
            : isEmployee 
                ? (userProfile?.internship?.role || 'Employee')
                : (userProfile?.internship?.role || 'Technical Intern');
        
        // If on an employee page, we use 'Employee' as the label for any non-admin
        const isEmployeePage_label = window.location.pathname.includes('employee-');
        const levelTitle = (isEmployeePage_label && !isAdmin) ? 'Employee' : assignedRole;
        
        if (userRoleSb) {
            userRoleSb.innerHTML = `
                <div class="loop-container" style="display:flex; align-items:center; gap:6px;">
                    <div class="loop-text" style="display:flex; align-items:center; gap:6px;">
                        <span style="color:var(--clr-primary); font-weight:700;">${levelTitle}</span>
                        <span style="opacity:0.6; font-size:10px; display:flex; align-items:center; gap:3px;">
                            <span class="material-symbols-outlined" style="font-size:12px;">psychology</span>
                              Intelligence Active
                        </span>
                    </div>
                </div>
            `;
        }
        
        // ── Global Role Badges ──
        const roleBadges = [document.getElementById('topbar-role-badge'), document.getElementById('role-badge-main')];
        roleBadges.forEach(badge => {
            if (badge) {
                badge.textContent = isAdmin ? 'Admin' : isEmployee ? 'Employee' : assignedRole;
                badge.className = `badge ${isAdmin ? 'badge-admin' : (isEmployee || isEmployeePage) ? 'badge-employee' : 'badge-user'}`;
                // Double check: if we are on an employee page, the badge should probably say "Employee" unless it's an admin
                if (isEmployeePage && !isAdmin) {
                    badge.textContent = 'Employee';
                }
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
                    if (p.status === 'Resubmitted') projectAlertCount++;
                } else {
                    if (String(p.userId || p.ownerId) === String(session.userId)) {
                        const hasAdminCmt = p.comments?.length && p.comments[p.comments.length - 1].role === 'admin';
                        if (p.status === 'Changes Requested' || hasAdminCmt) projectAlertCount++;
                    }
                }
            }
        });

        // ── The Wall Alert Logic ──
        let wallAlertCount = 0;
        if (typeof Storage !== 'undefined' && Storage.getDoubts) {
            const doubts = Storage.getDoubts() || [];
            if (isAdmin) {
                wallAlertCount = doubts.filter(d => d.status === 'Open').length;
            } else {
                const myDoubts = doubts.filter(d => String(d.userId) === String(session.userId));
                wallAlertCount = myDoubts.filter(d => {
                    const lastSeen = parseInt(localStorage.getItem(`iris_wall_seen_${d.id}`) || '0', 10);
                    const activityTime = d.comments?.length 
                        ? d.comments[d.comments.length - 1].timestamp 
                        : (d.updatedAt || d.createdAt || 0);
                    return activityTime > lastSeen;
                }).length;
            }
        }

        const NAV_INTERN = [
            { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view', tooltip: 'Your control center' },
            { label: 'My Profile', href: 'student-profile.html', icon: 'person', tooltip: 'Your identity' },
            { label: 'Leaderboard', href: 'leaderboard.html', icon: 'leaderboard', tooltip: 'Glory board' },
            { label: 'Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics', tooltip: 'Performance tracking' },
            { label: 'Submit Report', href: 'report-submission.html', icon: 'description', tooltip: 'Drop your progress' },
            { label: 'Projects', href: 'projects.html', icon: 'folder', tooltip: 'The vault', alertCount: projectAlertCount },
            { label: 'The Wall', href: 'doubts.html', icon: 'chat', tooltip: 'Community hub', alertCount: wallAlertCount }, 
        ];

        const NAV_ADMIN = [
            { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view', tooltip: 'Main control center' },
            { label: 'My Profile', href: 'admin-profile.html', icon: 'person', tooltip: 'Admin sanctuary' },
            { label: 'Interns', href: 'students.html', icon: 'group', tooltip: 'Intern registry' },
            { label: 'Employees', href: 'employees.html', icon: 'badge', tooltip: 'Employee registry' },
            { label: 'Projects', href: 'projects.html', icon: 'folder', tooltip: 'The vault', alertCount: projectAlertCount },
            { label: 'The Wall', href: 'doubts.html', icon: 'chat', tooltip: 'Community hub', alertCount: wallAlertCount }, 
        ];

        const NAV_EMPLOYEE = [
            { label: 'Dashboard',    href: 'employee-profile.html',                              icon: 'home',         tooltip: 'Your workspace' },
            { label: 'Leaderboard', href: 'employee-leaderboard.html',                          icon: 'leaderboard',  tooltip: 'Employee rankings' },
            { label: 'Analytics',   href: `employee-analytics.html?student=${session.userId}`, icon: 'analytics',    tooltip: 'Performance tracking' },
            { label: 'Log Progress',href: 'employee-report.html',                               icon: 'description',  tooltip: 'Document your work' },
            { label: 'The Wall',    href: 'doubts.html',                                        icon: 'chat',         tooltip: 'Community hub', alertCount: wallAlertCount },
        ];

        const navItems = isAdmin ? NAV_ADMIN : (isEmployee || isEmployeePage) ? NAV_EMPLOYEE : NAV_INTERN;
        const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';

        if (sidebarNav) {
            let navHTML = `<div class="nav-section-label">Menu</div>`;
            navItems.forEach(item => {
                const itemBase = item.href.split('?')[0];
                // Match exact path or handle index.html -> dashboard mapping
                const isActive = (currentPath === itemBase) || (currentPath === 'index.html' && itemBase.includes('dashboard'));
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

        // ── Update Topbar Title ──
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
                sidebarOverlay.style.display = 'block';
            }
            if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'true');
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

        // ── Admin Popup ──
        if (typeof AdminPopup !== 'undefined' && AdminPopup.init) {
            AdminPopup.init();
        }
    };

    return { init };
})();

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', SidebarEngine.init);
} else {
    SidebarEngine.init();
}

window.addEventListener('iris-data-sync', (e) => {
    SidebarEngine.init();
});
