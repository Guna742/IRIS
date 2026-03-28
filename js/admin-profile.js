/**
 * InternTrack — Admin Profile Logic
 * Displays admin's own profile with live stats, intern directory, recent projects.
 */

'use strict';

(() => {
    // Guard: admin only
    const session = Auth.requireAuth(['admin']);
    if (!session) return;

    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    SidebarEngine.init();

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    // ── Edit Profile Button (Scroll to Account Info) ──
    const editProfileBtn = document.getElementById('edit-profile-btn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            const nameField = document.getElementById('name-edit-field');
            if (nameField) {
                nameField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    nameField.focus();
                    nameField.classList.add('anim-pulse');
                    setTimeout(() => nameField.classList.remove('anim-pulse'), 1500);
                }, 600);
            }
        });
    }

    // ── Populate admin info ──
    const adminProfile = Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null;
    let currentAdminData = adminProfile || {
        name: session.displayName || 'Admin',
        email: session.email || 'admin@interntrack.com',
        role: 'Administrator',
        avatar: ''
    };

    const displayName = currentAdminData.name;
    const email = currentAdminData.email;

    function updateProfileUI() {
        setEl('admin-display-name', `<span class="anim-title"><span>${currentAdminData.name}</span></span>`);
        setEl('admin-email', currentAdminData.email);
        setEl('info-email', currentAdminData.email);
        setEl('user-name-sidebar', currentAdminData.name);
        setEl('admin-role-tag-text', currentAdminData.role || 'Administrator');
        setEl('user-role-sidebar', currentAdminData.role || 'Administrator');

        const sideAvatar = document.getElementById('user-avatar-sidebar');
        if (sideAvatar) {
            if (currentAdminData.avatar) {
                sideAvatar.innerHTML = `<img src="${currentAdminData.avatar}" alt="${currentAdminData.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                sideAvatar.textContent = currentAdminData.name[0].toUpperCase();
            }
        }

        const avatarEl = document.getElementById('admin-avatar');
        if (currentAdminData.avatar) {
            avatarEl.innerHTML = `<img src="${currentAdminData.avatar}" alt="${currentAdminData.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
            avatarEl.innerHTML = `<span>${currentAdminData.name[0].toUpperCase()}</span>`;
        }
    }

    updateProfileUI();

    // Session time
    if (session.loginTime) {
        const loginDate = new Date(session.loginTime);
        setEl('info-session', loginDate.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }));
    }

    // ── Field Editors ──
    const nameField = document.getElementById('name-edit-field');
    const nameSaveBtn = document.getElementById('name-save-btn');
    const emailField = document.getElementById('email-edit-field');
    const emailSaveBtn = document.getElementById('email-save-btn');
    const roleField = document.getElementById('role-edit-field');
    const roleSaveBtn = document.getElementById('role-save-btn');

    if (nameField) nameField.value = currentAdminData.name;
    if (emailField) emailField.value = currentAdminData.email;
    if (roleField) roleField.value = currentAdminData.role || 'Administrator';

    function saveAdminData() {
        Storage.saveAdminProfile(session.userId, currentAdminData);
        // Sync to Firestore admins/{adminId}
        if (Storage.syncAdminProfile) {
            Storage.syncAdminProfile(session.userId, currentAdminData)
                .catch(err => console.warn('[AdminProfile] Firestore sync failed:', err));
        }
        // Also sync to session for sidebar name etc.
        const updatedSession = { ...session, displayName: currentAdminData.name, email: currentAdminData.email };
        sessionStorage.setItem('iris_session', JSON.stringify(updatedSession));
        localStorage.setItem('iris_session', JSON.stringify(updatedSession));
        updateProfileUI();
    }

    if (nameSaveBtn) {
        nameSaveBtn.addEventListener('click', () => {
            const newName = nameField.value.trim();
            if (!newName) { showToast('Name cannot be empty.', 'error'); return; }
            currentAdminData.name = newName;
            saveAdminData();
            showToast('Display name updated!', 'success');
        });
        nameField.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameSaveBtn.click(); });
    }

    if (emailSaveBtn) {
        emailSaveBtn.addEventListener('click', () => {
            const newEmail = emailField.value.trim();
            if (!newEmail) { showToast('Email cannot be empty.', 'error'); return; }
            currentAdminData.email = newEmail;
            saveAdminData();
            showToast('Email address updated!', 'success');
        });
        emailField.addEventListener('keydown', (e) => { if (e.key === 'Enter') emailSaveBtn.click(); });
    }

    if (roleSaveBtn) {
        roleSaveBtn.addEventListener('click', () => {
            const newRole = roleField.value.trim();
            if (!newRole) { showToast('Role cannot be empty.', 'error'); return; }
            currentAdminData.role = newRole;
            saveAdminData();
            showToast('Admin role updated!', 'success');
        });
        roleField.addEventListener('keydown', (e) => { if (e.key === 'Enter') roleSaveBtn.click(); });
    }

    // ── Approval Logic for Edit Requests ──
    const requestsListEl = document.getElementById('pending-requests-list');

    function refreshRequests() {
        if (!requestsListEl) return;
        const allRequests = Storage.getMissedReportRequests() || [];
        const pending = allRequests.filter(r => r.status === 'pending');

        if (pending.length === 0) {
            requestsListEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--clr-text-muted); font-size:0.9rem">No pending requests at the moment.</div>';
            return;
        }

        requestsListEl.innerHTML = pending.map(req => {
            const student = Storage.getProfile(req.userId) || { name: 'Unknown Intern' };
            const dateStr = new Date(req.createdAt).toLocaleDateString();
            return `
            <div class="student-list-item" style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--glass-border)">
                <div class="student-list-info" style="flex:1">
                    <div class="student-list-name" style="font-weight:600">${student.name}</div>
                    <div class="student-list-role" style="font-size:0.8rem; color:var(--clr-text-muted)">Request for ${dateStr}</div>
                </div>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-secondary btn-sm" onclick="handleRequest('${req.userId}', '${req.id}', 'denied')" style="padding:4px 8px; color:#ef4444">Deny</button>
                    <button class="btn btn-primary btn-sm" onclick="handleRequest('${req.userId}', '${req.id}', 'approved')" style="padding:4px 8px">Approve</button>
                </div>
            </div>`;
        }).join('');
    }

    window.handleRequest = function(uid, rid, status) {
        if (Storage.updateMissedReportRequestsStatus) {
            Storage.updateMissedReportRequestsStatus(uid, rid, status);
        } else {
            // Fallback if method name is slightly different in storage.js
            Storage.updateMissedReportRequestStatus(uid, rid, status);
        }
        showToast(`Request ${status}!`, status === 'approved' ? 'success' : 'info');
        refreshRequests();
    };

    refreshRequests();

    // ── Avatar Upload Logic removed ──

    // ── Compute & render stats ──
    const profiles = Storage.getProfiles();
    const allProfiles = Object.values(profiles);
    const projects = Storage.getProjects();

    const totalStudents = allProfiles.length;
    const totalSkills = allProfiles.reduce((acc, p) => acc + (p.skills?.length || 0), 0);
    const teams = new Set(allProfiles.map(p => p.internship?.company).filter(Boolean));
    const totalTeams = teams.size;

    // Animate counters
    animateCounter('stat-students', totalStudents, 0);
    animateCounter('stat-skills', totalSkills, 100);
    animateCounter('stat-companies', totalTeams, 200);

    // ── Intern Directory ──
    const rosterEl = document.getElementById('student-roster');
    if (rosterEl) {
        if (allProfiles.length === 0) {
            rosterEl.innerHTML = '<p class="text-muted text-sm">No intern profiles yet.</p>';
        } else {
            rosterEl.innerHTML = allProfiles.map(p => {
                const initials = (p.name || '?')[0].toUpperCase();
                const role = p.internship?.role || 'Intern';
                const company = p.internship?.company || 'Not assigned';
                const avatarHtml = p.avatar
                    ? `<div class="student-list-avatar"><img src="${p.avatar}" alt="${p.name} avatar"></div>`
                    : `<div class="student-list-avatar">${initials}</div>`;
                return `
                <div class="student-list-item" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--glass-border, rgba(255,255,255,0.07))">
                    ${avatarHtml}
                    <div class="student-list-info" style="flex:1;min-width:0">
                        <div class="student-list-name">${p.name || 'Unnamed'}</div>
                        <div class="student-list-role">${role} · ${company}</div>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0">
                        <a href="student-analytics.html?student=${p.userId}" class="btn btn-secondary btn-sm" title="View analytics" aria-label="View analytics for ${p.name}" style="padding:4px 10px"><span class="material-symbols-outlined" style="font-size: 16px;">analytics</span></a>
                        <a href="profile-builder.html?student=${p.userId}" class="btn btn-primary btn-sm" title="Edit profile" aria-label="Edit profile for ${p.name}" style="padding:4px 10px"><span class="material-symbols-outlined" style="font-size: 16px;">edit</span></a>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // ── Apply interactions ──
    const heroCard = document.getElementById('admin-hero');
    if (heroCard) {
        heroCard.classList.add('card-3d', 'anim-reveal');
        if (!heroCard.querySelector('.glare')) {
            const glare = document.createElement('div');
            glare.className = 'glare';
            heroCard.appendChild(glare);
        }
    }

    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.add('card-3d', 'admin-profile-stat');
        if (!card.querySelector('.glare')) {
            const glare = document.createElement('div');
            glare.className = 'glare';
            card.appendChild(glare);
        }
    });

    document.querySelectorAll('.btn, .quick-action-btn').forEach(btn => {
        btn.classList.add('btn-magnetic');
    });

    // Re-init animation engine
    if (typeof initMagneticButtons === 'function') initMagneticButtons();
    if (typeof init3DTilt === 'function') init3DTilt();
    if (typeof initScrollReveals === 'function') initScrollReveals();
    if (typeof initTextReveals === 'function') initTextReveals();

    // ── Recent Projects Removed ──

    // ── Scroll Reveal ──
    initReveal();

    // ─────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────

    function setEl(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function animateCounter(id, target, delay = 0) {
        const el = document.getElementById(id);
        if (!el) return;
        setTimeout(() => {
            let current = 0;
            const step = Math.ceil(target / 30);
            const interval = setInterval(() => {
                current = Math.min(current + step, target);
                el.textContent = current;
                if (current >= target) clearInterval(interval);
            }, 30);
        }, delay);
    }

    function initReveal() {
        const els = document.querySelectorAll('.reveal');
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
            });
        }, { threshold: 0.08 });
        els.forEach(el => obs.observe(el));
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const icons = { success: 'check_circle', error: 'error', info: 'info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon material-symbols-outlined" aria-hidden="true">${icons[type]}</span><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-12px)';
            toast.style.transition = 'all .3s ease';
            setTimeout(() => toast.remove(), 350);
        }, 3000);
    }

    // ── Sidebar ──
    SidebarEngine.init = function(session, activePage) {
        const nav = document.getElementById('sidebar-nav');
        const avatar = document.getElementById('user-avatar-sidebar');
        const nameEl = document.getElementById('user-name-sidebar');
        const roleEl = document.getElementById('user-role-sidebar');

        const isAdmin = session.role === 'admin';
        const p = isAdmin ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null) : Storage.getProfile(session.userId);
        const currentName = p?.name || session.displayName;

        if (avatar) {
            if (p?.avatar) {
                avatar.innerHTML = `<img src="${p.avatar}" alt="${currentName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                avatar.textContent = currentName[0].toUpperCase();
            }
        }
        if (nameEl) nameEl.textContent = currentName;
        if (roleEl) roleEl.textContent = 'Administrator';

        const items = [
            { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view' },
            { label: 'My Profile', href: 'admin-profile.html', icon: 'person', active: activePage === 'admin-profile.html' },
            { label: 'Interns', href: 'students.html', icon: 'group' },
            { label: 'Projects', href: 'projects.html', icon: 'folder' },
            { label: 'Doubts', href: 'doubts.html', icon: 'help_center' },
        ];

        if (nav) {
            nav.innerHTML = '<div class="nav-section-label">Menu</div>' +
                items.map(item => `
                <a class="nav-item${item.href === activePage ? ' active' : ''}" href="${item.href}" aria-current="${item.href === activePage ? 'page' : 'false'}">
                    <span class="nav-icon" aria-hidden="true"><span class="material-symbols-outlined">${item.icon}</span></span>
                    <span>${item.label}</span>
                </a>`).join('');
        }

        const hamburger = document.getElementById('hamburger-btn');
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (hamburger && sidebar && overlay) {
            hamburger.addEventListener('click', () => {
                const open = sidebar.classList.toggle('open');
                overlay.classList.toggle('visible', open);
                hamburger.setAttribute('aria-expanded', String(open));
            });
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('open');
                overlay.classList.remove('visible');
                hamburger.setAttribute('aria-expanded', 'false');
            });
        }
    }

})();
