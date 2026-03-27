/**
 * InternTrack — Admin Profile Popup
 * Shared module: injects a slide-up profile card when the sidebar user-info is clicked.
 * Include AFTER auth.js and storage.js.
 */

'use strict';

const AdminPopup = (() => {

    let popupEl = null;
    let isOpen = false;

    function buildPopupHTML(session) {
        const isAdmin = session.role === 'admin';
        const p = isAdmin ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null) : Storage.getProfile(session.userId);
        const currentName = p?.name || session.displayName;

        const initial = currentName[0].toUpperCase();
        const avatarHtml = p?.avatar
            ? `<img src="${p.avatar}" alt="${currentName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : initial;

        const loginDate = new Date(session.loginTime).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const adminCapabilities = [
            { icon: 'edit', label: 'Profile Builder', desc: 'Create & edit intern profiles' },
            { icon: 'school', label: 'Student Management', desc: 'View all intern details' },
            { icon: 'folder_shared', label: 'Project Oversight', desc: 'Monitor all project submissions' },
        ];

        const internCapabilities = [
            { icon: 'person', label: 'My Profile', desc: 'View your own portfolio' },
            { icon: 'folder', label: 'Projects', desc: 'Submit & manage your projects' },
        ];

        const caps = isAdmin ? adminCapabilities : internCapabilities;

        return `
        <div class="apop-arrow" aria-hidden="true"></div>
        <div class="apop-header">
            <div class="apop-avatar" style="overflow:hidden">${avatarHtml}</div>
            <div class="apop-identity">
                <div class="apop-name">${currentName}</div>
                <div class="apop-email">${session.email}</div>
                <span class="apop-badge ${isAdmin ? 'apop-badge-admin' : 'apop-badge-user'}">
                    <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">${isAdmin ? 'shield' : 'school'}</span>
                    ${isAdmin ? 'Administrator' : 'Intern'}
                </span>
            </div>
        </div>
        <div class="apop-divider"></div>
        <div class="apop-section-label">Permissions</div>
        <ul class="apop-caps">
            ${caps.map(c => `
            <li class="apop-cap-item">
                <span class="apop-cap-icon material-symbols-outlined" aria-hidden="true">${c.icon}</span>
                <div>
                    <div class="apop-cap-label">${c.label}</div>
                    <div class="apop-cap-desc">${c.desc}</div>
                </div>
            </li>`).join('')}
        </ul>
        <div class="apop-divider"></div>
        <div class="apop-meta">
            <span class="apop-meta-icon material-symbols-outlined" aria-hidden="true" style="font-size: 14px; vertical-align: middle;">schedule</span>
            Logged in: ${loginDate}
        </div>
        <button class="apop-signout-btn" id="apop-signout-btn" aria-label="Sign out">
            <span class="material-symbols-outlined" style="font-size: 16px;">logout</span>
            Sign Out
        </button>`;
    }

    function open(session) {
        if (!popupEl) return;
        popupEl.innerHTML = buildPopupHTML(session);
        popupEl.classList.add('apop-visible');
        isOpen = true;

        document.getElementById('apop-signout-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            Auth.logout();
        });

        // close on outside click
        setTimeout(() => {
            document.addEventListener('click', closeOnOutside);
        }, 50);
    }

    function close() {
        if (!popupEl) return;
        popupEl.classList.remove('apop-visible');
        isOpen = false;
        document.removeEventListener('click', closeOnOutside);
    }

    function closeOnOutside(e) {
        if (popupEl && !popupEl.contains(e.target)) {
            close();
        }
    }

    function init() {
        const session = Auth.getSession();
        if (!session) return;

        const footer = document.querySelector('.sidebar-footer');
        if (!footer) return;

        // Create popup container anchored inside sidebar-footer
        popupEl = document.createElement('div');
        popupEl.className = 'admin-popup';
        popupEl.id = 'admin-popup';
        popupEl.setAttribute('role', 'dialog');
        popupEl.setAttribute('aria-label', 'User profile');
        footer.insertBefore(popupEl, footer.firstChild);

        // Wire click on user-info
        const userInfo = document.getElementById('user-info-sidebar');
        if (userInfo) {
            userInfo.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isOpen) {
                    close();
                } else {
                    open(session);
                }
            });

            // Keyboard support
            userInfo.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    userInfo.click();
                }
                if (e.key === 'Escape') close();
            });
        }

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) close();
        });
    }

    return { init, open, close };
})();

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => AdminPopup.init());
// Also init immediately in case DOMContentLoaded already fired
if (document.readyState !== 'loading') AdminPopup.init();
