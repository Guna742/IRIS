/**
 * I.R.I.S — employees-admin.js
 * Keeps the Employee Directory roster on admin-profile.html in sync with
 * live Firestore updates (dispatched by storage.js iris-data-sync events).
 */

'use strict';

(() => {
    function getEmployeeProfiles() {
        return Object.values(Storage.getProfiles()).filter(p => p.role === 'employee');
    }

    function renderEmployeeRoster() {
        const rosterEl = document.getElementById('employee-roster');
        if (!rosterEl) return;

        const employees = getEmployeeProfiles();

        // Update the Total Employees stat card
        const statEl = document.getElementById('stat-employees');
        if (statEl) statEl.textContent = employees.length;

        if (employees.length === 0) {
            rosterEl.innerHTML = '<p class="text-muted text-sm" style="padding:12px 0;">No employee profiles yet.</p>';
            return;
        }

        rosterEl.innerHTML = employees.map(p => {
            const initials = (p.name || '?')[0].toUpperCase();
            const dept     = p.internship?.role || p.department || 'Employee';
            const company  = p.internship?.company || p.company || 'Not assigned';
            const avatarHtml = p.avatar
                ? `<div class="student-list-avatar"><img src="${p.avatar}" alt="${p.name} avatar"></div>`
                : `<div class="student-list-avatar" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6)">${initials}</div>`;
            return `
            <div class="student-list-item" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.07))">
                ${avatarHtml}
                <div class="student-list-info" style="flex:1;min-width:0">
                    <div class="student-list-name">${p.name || 'Unnamed'}</div>
                    <div class="student-list-role">${dept} · ${company}</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0">
                    <a href="student-analytics.html?student=${p.userId}"
                       class="btn btn-secondary btn-sm"
                       title="View analytics" aria-label="View analytics for ${p.name}"
                       style="padding:4px 10px">
                       <span class="material-symbols-outlined" style="font-size:16px">analytics</span>
                    </a>
                    <a href="profile-builder.html?student=${p.userId}"
                       class="btn btn-primary btn-sm"
                       title="Edit profile" aria-label="Edit profile for ${p.name}"
                       style="padding:4px 10px;background:linear-gradient(135deg,#3b82f6,#8b5cf6)">
                       <span class="material-symbols-outlined" style="font-size:16px">edit</span>
                    </a>
                </div>
            </div>`;
        }).join('');
    }

    // Initial render (once DOM + admin-profile.js has run)
    renderEmployeeRoster();

    // Live-sync: re-render whenever Firestore pushes new user data
    window.addEventListener('iris-data-sync', (e) => {
        if (e.detail && (e.detail.type === 'users')) {
            renderEmployeeRoster();
        }
    });
})();
