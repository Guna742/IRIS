/**
 * I.R.I.S — Employee Profile Logic
 * Mirrors student-profile-v2.js but for role='employee'.
 * All "Intern / Technical Intern" labels are replaced with "Employee".
 */

'use strict';

(() => {
    const session = Auth.requireAuth();
    if (!session) return;

    // Guard: employees and admins allowed
    if (!['employee', 'admin'].includes(session.role)) {
        if (session.role === 'user') window.location.replace('student-profile.html');
        else window.location.replace('login.html');
        return;
    }

    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    // Real-time Cloud Sync Listener
    window.addEventListener('iris-data-sync', (e) => {
        if (e.detail.type === 'users') {
            const updatedP = Storage.getProfile(session.userId);
            if (updatedP) refresh(updatedP, session);
        }
    });

    let currentProjectIdx = 0;

    // Topbar badge
    const badge = document.getElementById('topbar-role-badge');
    if (badge) { badge.textContent = 'Employee'; badge.className = 'badge badge-employee'; }

    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    // ── Load profile ──
    const loadingEl = document.getElementById('profile-loading');
    const outputEl = document.getElementById('profile-output');

    if (loadingEl) loadingEl.remove();
    const p = Storage.getProfile(session.userId);

    if (!p) {
        if (outputEl) {
            outputEl.hidden = false;
            outputEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><span class="material-symbols-outlined" style="font-size: 48px;">warning</span></div>
                <div class="empty-title">Profile Not Found</div>
                <div class="empty-desc">Your employee profile could not be loaded. Please contact your administrator.</div>
            </div>`;
        }
    } else {
        if (outputEl) {
            outputEl.hidden = false;
            outputEl.innerHTML = buildEmployeeHTML(p, session);
            setupEventListeners(p, session);
            loadRewards(session.userId);
        }

        // Animate fill bar
        setTimeout(() => {
            const fill = document.getElementById('completion-fill');
            const pctEl = document.getElementById('completion-pct');
            const pct = computeCompletion(p);
            if (fill) fill.style.width = pct + '%';
            if (pctEl) pctEl.textContent = pct + '%';
        }, 100);

        initReveal();
    }

    // ── Compute profile completion ──
    function computeCompletion(p) {
        const fields = [
            p.name, p.email, p.tagline, p.bio, p.location,
            p.skills?.length > 0,
            p.internship?.company, p.internship?.role,
            p.socialLinks?.github || p.socialLinks?.linkedin
        ];
        const filled = fields.filter(Boolean).length;
        return Math.round((filled / fields.length) * 100);
    }

    // ── Build profile HTML ──
    function buildEmployeeHTML(p, session) {
        const emp = p.internship || {};
        const links = p.socialLinks || {};
        const projects = Storage.getProjects() || [];
        const myProjects = projects.filter(pr => String(pr.userId || pr.ownerId) === String(session.userId));
        const skillCount = (p.skills || []).length;
        const pct = computeCompletion(p);
        const isActive = emp.endDate ? new Date(emp.endDate) >= new Date() : !!emp.company;

        const stats = [
            { id: 'skill-stat-card',   label: 'Skills Listed',  value: skillCount,      icon: 'bolt',      color: 'cyan' },
            { id: 'project-stat-card', label: 'Projects',        value: myProjects.length, icon: 'folder', color: 'blue', clickable: true },
            { id: 'q-stat-card',       label: 'Wall Questions',  value: '...',           icon: 'quiz',      color: 'orange' },
            { id: 'a-stat-card',       label: 'Wall Answers',    value: '...',           icon: 'forum',     color: 'purple' },
        ];

        return `
        <div class="student-profile-wrap">

            <!-- Hero -->
            <div class="student-hero reveal">
                <div class="student-hero-banner">
                    <div class="student-orb student-orb-1"></div>
                    <div class="student-orb student-orb-2"></div>
                    <div class="student-orb student-orb-3"></div>
                </div>
                <div class="student-hero-body">
                    <div class="student-avatar-wrap">
                        <div class="student-avatar" id="student-avatar">
                            ${p.avatar
                                ? `<img src="${p.avatar}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
                                : `<span>${(p.name || 'E')[0].toUpperCase()}</span>`}
                        </div>
                        ${isActive ? `<div class="student-status-dot" title="Active Employee" style="background:#3b82f6"></div>` : ''}
                    </div>
                    <div class="student-info">
                        <div class="student-display-name">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <span class="student-name-text">${p.name || 'Your Name'}</span>
                                <span class="student-rank-wrapper" id="rank-badge-placeholder"></span>
                            </div>
                        </div>
                        <div class="student-tagline">${p.tagline || (emp.role ? `${emp.role} at ${emp.company || 'I.R.I.S'}` : 'Employee at I.R.I.S')}</div>
                        <div class="student-meta-row">
                            ${p.location ? `<span class="student-meta-item"><span class="material-symbols-outlined" style="font-size:14px">location_on</span>${p.location}</span>` : ''}
                            ${emp.company ? `<span class="student-meta-item"><span class="material-symbols-outlined" style="font-size:14px">domain</span>${emp.company}</span>` : ''}
                            ${emp.role ? `<span class="student-meta-item" style="text-transform:uppercase;font-weight:700;color:#3b82f6"><span class="material-symbols-outlined" style="font-size:14px">badge</span>${emp.role}</span>` : ''}
                            ${emp.startDate ? `<span class="student-meta-item"><span class="material-symbols-outlined" style="font-size:14px">calendar_today</span>Since ${emp.startDate}</span>` : ''}
                        </div>
                    </div>
                    <div class="student-hero-actions">
                        <button id="edit-profile-btn" class="btn btn-secondary btn-sm">
                            <span class="material-symbols-outlined" style="font-size:16px">edit</span>Edit Profile
                        </button>
                        <a href="employee-analytics.html?student=${session.userId}" class="btn btn-primary btn-sm btn-glow">
                            <span class="material-symbols-outlined" style="font-size:16px">analytics</span>Analytics
                        </a>
                    </div>
                </div>

                <!-- Completion Bar -->
                <div class="completion-bar-wrap">
                    <span class="completion-label">Profile Completion</span>
                    <div class="completion-bar"><div class="completion-fill" id="completion-fill" style="width:0%"></div></div>
                    <span class="completion-pct" id="completion-pct">0%</span>
                </div>
            </div>

            <!-- Stats Row -->
            <div class="student-stats-row">
                ${stats.map(s => `
                    <div class="student-stat-card ${s.clickable ? 'clickable-stat' : ''}" id="${s.id}">
                        <div class="student-stat-icon" style="background:rgba(${s.color === 'cyan' ? '34,211,238' : s.color === 'blue' ? '59,130,246' : s.color === 'orange' ? '251,188,5' : '139,92,246'},.1)">
                            <span class="material-symbols-outlined" style="color:${s.color === 'blue' ? '#3b82f6' : `var(--clr-${s.color})`}">${s.icon}</span>
                        </div>
                        <div class="student-stat-info">
                            <div class="student-stat-value" id="${s.id}-value">${s.value}</div>
                            <div class="student-stat-label">${s.label}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Main Grid -->
            <div class="student-main-grid">
                <div>
                    <!-- About -->
                    <section class="student-section reveal anim-d1">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(59,130,246,.12)"><span class="material-symbols-outlined" style="color:#3b82f6">description</span></div>
                            <h2 class="student-section-title">About Me</h2>
                        </div>
                        <div class="student-section-body">
                            <p class="bio-text">${p.bio || 'Add a professional bio to introduce yourself to your team.'}</p>
                        </div>
                    </section>

                    <!-- Skills -->
                    <section class="student-section reveal anim-d2">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(34,211,238,.1)"><span class="material-symbols-outlined" style="color:var(--clr-cyan)">bolt</span></div>
                            <h2 class="student-section-title">Professional Skills</h2>
                        </div>
                        <div class="student-section-body">
                            <div class="inline-form" id="inline-skill-form" style="margin-bottom:var(--sp-4)">
                                <div class="inline-form-row" style="gap:8px;">
                                    <input type="text" id="new-skill-input" class="field-input" placeholder="Skill (e.g. Python)" style="flex:2">
                                    <input type="number" id="new-skill-level" class="field-input" placeholder="%" style="flex:1" min="1" max="100">
                                    <button class="btn btn-primary btn-sm" id="save-skill-btn">Add</button>
                                </div>
                            </div>
                            <div class="skills-cloud" id="skills-cloud-container">
                                ${(p.skills || []).map(s => `
                                    <span class="skill-badge">${typeof s === 'object' ? s.name : s} ${typeof s === 'object' ? `<span class="skill-pct-tag">${s.level}%</span>` : ''}
                                        <button class="skill-remove-btn" data-skill="${typeof s === 'object' ? s.name : s}">&times;</button>
                                    </span>
                                `).join('')}
                            </div>
                            ${(p.skills || []).length > 0 ? `<button id="clear-skills-btn" class="btn-text" style="color:var(--clr-danger);font-size:11px;margin-top:10px;display:flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px">delete_forever</span> Clear All Skills</button>` : ''}
                        </div>
                    </section>

                    <!-- Employment Details -->
                    <section class="student-section reveal anim-d3">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(59,130,246,.1)"><span class="material-symbols-outlined" style="color:#3b82f6">work</span></div>
                            <h2 class="student-section-title">Employment Details</h2>
                        </div>
                        <div class="student-section-body">
                            <div class="info-list">
                                <div class="info-row"><div class="info-label">Company</div><div class="info-value">${emp.company || '—'}</div></div>
                                <div class="info-row"><div class="info-label">Role / Designation</div><div class="info-value">${emp.role || '—'}</div></div>
                                <div class="info-row"><div class="info-label">Start Date</div><div class="info-value">${emp.startDate || '—'}</div></div>
                                ${emp.description ? `<div class="info-row"><div class="info-label">Description</div><div class="info-value">${emp.description}</div></div>` : ''}
                            </div>
                        </div>
                    </section>
                </div>

                <!-- Right Sidebar -->
                <div>
                    <!-- Points & Badges -->
                    <section class="student-section reveal anim-d1" id="rewards-section">
                        <div class="student-section-head" style="display:flex;justify-content:space-between;align-items:center;">
                            <div style="display:flex;align-items:center;gap:var(--sp-3);">
                                <div class="student-section-icon" style="background:rgba(59,130,246,.1)"><span class="material-symbols-outlined" style="color:#3b82f6">military_tech</span></div>
                                <h2 class="student-section-title">Rewards &amp; Badges</h2>
                            </div>
                            <button onclick="window.location.href='badges.html'" class="btn-icon-subtle" title="How points work"
                                style="background:none;border:none;color:#3b82f6;cursor:pointer;display:flex;align-items:center;">
                                <span class="material-symbols-outlined" style="font-size:20px">stars</span>
                            </button>
                        </div>
                        <div class="student-section-body">
                            <div id="rewards-content" style="display:flex;flex-direction:column;gap:var(--sp-4);">
                                <div style="display:flex;align-items:center;gap:var(--sp-3)">
                                    <div class="points-pill" id="points-display">⚡ Loading pts...</div>
                                </div>
                                <div>
                                    <div style="font-size:10px;color:var(--clr-text-muted);margin-bottom:var(--sp-2);text-transform:uppercase;letter-spacing:.05em">Unlocked Highlights</div>
                                    <div class="badge-showcase" id="badges-display" style="margin-bottom: 12px;">Loading...</div>
                                    <div style="font-size:11px;color:var(--clr-text-secondary);margin-bottom:var(--sp-3);line-height:1.4;background:rgba(255,255,255,0.03);padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
                                        Earn points and unlock prestigious badges through active collaboration, problem-solving, and continuous growth.
                                    </div>
                                    <a href="badges.html" class="btn btn-primary btn-sm" style="width:100%; margin-bottom: 8px; justify-content:center;">
                                        <span class="material-symbols-outlined" style="font-size:16px">explore</span>
                                        Explore About Badges
                                    </a>
                                </div>
                                <a href="doubts.html" class="btn btn-secondary btn-sm" style="width:100%">
                                    <span class="material-symbols-outlined" style="font-size:16px">chat</span>The Wall
                                </a>
                            </div>
                        </div>
                    </section>

                    <!-- Social Links -->
                    <section class="student-section reveal anim-d2">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(16,185,129,.1)"><span class="material-symbols-outlined" style="color:var(--clr-success)">link</span></div>
                            <h2 class="student-section-title">Contact &amp; Links</h2>
                        </div>
                        <div class="student-section-body">
                            <div class="info-list">
                                <div class="info-row"><div class="info-label">Email</div><div class="info-value">${p.email || '—'}</div></div>
                                ${links.github ? `<div class="info-row"><div class="info-label">GitHub</div><div class="info-value"><a href="${links.github}" target="_blank" style="color:#3b82f6">${links.github}</a></div></div>` : ''}
                                ${links.linkedin ? `<div class="info-row"><div class="info-label">LinkedIn</div><div class="info-value"><a href="${links.linkedin}" target="_blank" style="color:#3b82f6">${links.linkedin}</a></div></div>` : ''}
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <!-- Settings -->
            <section class="student-section reveal anim-d4" id="account-settings-section">
                <div class="student-section-head">
                    <div class="student-section-icon" style="background:rgba(255,255,255,0.05)"><span class="material-symbols-outlined">settings</span></div>
                    <h2 class="student-section-title">Profile Settings</h2>
                </div>
                <div class="student-section-body">
                    <div class="edit-fields-grid">
                        <div class="edit-field-group"><label class="field-label">Name</label><input type="text" id="name-edit-field" class="field-input" value="${p.name || ''}"><button id="name-save-btn" class="btn btn-primary btn-sm mt-s">Update</button></div>
                        <div class="edit-field-group"><label class="field-label">Bio (About)</label><textarea id="bio-edit-field" class="field-input" rows="3">${p.bio || ''}</textarea><button id="bio-save-btn" class="btn btn-primary btn-sm mt-s">Update Bio</button></div>
                    </div>
                </div>
            </section>
        </div>`;
    }

    async function loadRewards(userId) {
        if (typeof BadgeEngine === 'undefined') return;
        const ptsEl    = document.getElementById('points-display');
        const badgesEl = document.getElementById('badges-display');
        const qValueEl = document.getElementById('q-stat-card-value');
        const aValueEl = document.getElementById('a-stat-card-value');

        try {
            const { points, badges, qaStats } = await BadgeEngine.getUserRewards(userId);
            if (ptsEl)    ptsEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">bolt</span> ${points} Points`;
            if (badgesEl) badgesEl.innerHTML = BadgeEngine.renderBadges(badges);
            if (qValueEl) qValueEl.textContent = qaStats.questionsAsked || 0;
            if (aValueEl) aValueEl.textContent = qaStats.answersPosted || 0;
        } catch (err) {
            console.warn('[EmployeeProfile] loadRewards error:', err);
        }
    }

    function initReveal() {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.reveal').forEach(el => {
            if (el.dataset.revealingInit) return;
            el.dataset.revealingInit = 'true';
            obs.observe(el);
        });
    }

    function setupEventListeners(p, session) {
        document.getElementById('project-stat-card')?.addEventListener('click', () => window.location.href = 'projects.html');
        document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
            document.getElementById('account-settings-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        document.getElementById('name-save-btn')?.addEventListener('click', async () => {
            p.name = document.getElementById('name-edit-field').value.trim();
            Storage.saveProfile(session.userId, p);
            if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
            showToast('Name updated!', 'success');
            refresh(p, session);
        });

        document.getElementById('bio-save-btn')?.addEventListener('click', async () => {
            p.bio = document.getElementById('bio-edit-field').value.trim();
            Storage.saveProfile(session.userId, p);
            if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
            showToast('Bio updated!', 'success');
            refresh(p, session);
        });

        document.getElementById('save-skill-btn')?.addEventListener('click', async () => {
            const input = document.getElementById('new-skill-input');
            const levelInput = document.getElementById('new-skill-level');
            const val = input ? input.value.trim() : '';
            const level = levelInput ? parseInt(levelInput.value) || 0 : 0;
            if (val) {
                if (!level || level < 1 || level > 100) { showToast('Enter skill level 1-100%', 'error'); return; }
                if (!p.skills) p.skills = [];
                p.skills.push({ name: val, level });
                Storage.saveProfile(session.userId, p);
                if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
                refresh(p, session);
            }
        });

        document.querySelectorAll('.skill-remove-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name = btn.dataset.skill;
                p.skills = (p.skills || []).filter(s => (typeof s === 'object' ? s.name : s) !== name);
                Storage.saveProfile(session.userId, p);
                if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
                refresh(p, session);
            });
        });

        document.getElementById('clear-skills-btn')?.addEventListener('click', async () => {
            if (await IrisModal.confirm('Are you sure you want to delete ALL skills? This cannot be undone.')) {
                p.skills = [];
                Storage.saveProfile(session.userId, p);
                if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
                showToast('All skills cleared from database.', 'success');
                refresh(p, session);
            }
        });
    }

    function refresh(p, session) {
        const outputEl = document.getElementById('profile-output');
        if (outputEl) {
            outputEl.innerHTML = buildEmployeeHTML(p, session);
            setupEventListeners(p, session);
            loadRewards(session.userId);
            initReveal();
            setTimeout(() => {
                const fill = document.getElementById('completion-fill');
                const pctEl = document.getElementById('completion-pct');
                const pct = computeCompletion(p);
                if (fill) fill.style.width = pct + '%';
                if (pctEl) pctEl.textContent = pct + '%';
            }, 100);
        }
    }

    function showToast(m, t = 'info') {
        const tc = document.getElementById('toast-container');
        if (!tc) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${t}`;
        toast.innerHTML = `<span class="material-symbols-outlined">${t === 'success' ? 'check_circle' : 'info'}</span><span>${m}</span>`;
        tc.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

})();
