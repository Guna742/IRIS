/**
 * InternTrack — Student Profile Logic (V3 - REWARDS)
 * Enhanced with Q&A Stats (Questions, Answers, Points, Badges).
 */

'use strict';

(() => {
    const session = Auth.requireAuth();
    if (!session) return;

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
    if (badge) { badge.textContent = 'Intern'; badge.className = 'badge badge-user'; }

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
                <div class="empty-title">Access Denied</div>
                <div class="empty-desc">Your profile could not be loaded. Please try logging in again.</div>
            </div>`;
        }
    } else {
        if (outputEl) {
            outputEl.hidden = false;
            outputEl.innerHTML = buildStudentHTML(p, session, currentProjectIdx);
            setupEventListeners(p, session);
            loadRewards(session.userId);
            SidebarEngine.init(session, 'student-profile.html');
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

    // ── Build HTML ──
    function buildStudentHTML(p, session, currentProjectIdx) {
        const intern = p.internship || {};
        const links = p.socialLinks || {};
        const projects = Storage.getProjects() || [];
        const myProjects = projects.filter(pr => String(pr.userId || pr.ownerId) === String(session.userId));
        const skillCount = (p.skills || []).length;
        const pct = computeCompletion(p);
        const isActive = intern.endDate ? new Date(intern.endDate) >= new Date() : !!intern.company;
        
        // Dynamic stats including Q&A
        const stats = [
            { id: 'skill-stat-card', label: 'Skills Listed', value: skillCount, icon: 'bolt', color: 'cyan' },
            { id: 'project-stat-card', label: 'Projects', value: myProjects.length, icon: 'folder', color: 'blue', clickable: true },
            { id: 'q-stat-card', label: 'Wall Questions', value: '...', icon: 'quiz', color: 'orange' },
            { id: 'a-stat-card', label: 'Wall Answers', value: '...', icon: 'forum', color: 'purple' }
        ];

        return `
        <div class="student-profile-wrap">

            <!-- Hero -->
            <div class="student-hero reveal">
                <div class="student-hero-banner">
                    <div class="student-orb student-orb-1"></div>
                    <div class="student-orb student-orb-2"></div>
                </div>
                <div class="student-hero-body">
                    <div class="student-avatar-wrap">
                        <div class="student-avatar" id="student-avatar">
                            ${p.avatar
                                ? `<img src="${p.avatar}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
                                : `<span>${(p.name || 'I')[0].toUpperCase()}</span>`}
                        </div>
                        ${isActive ? `<div class="student-status-dot" title="Active Intern"></div>` : ''}
                    </div>
                    <div class="student-info">
                        <div class="student-display-name">
                            <div style="position: relative;">
                                ${Storage.getInternRank && Storage.getInternRank(session.userId) === 1 ? '<span class="student-crown-icon">👑</span>' : ''}
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span class="student-name-text">${p.name || 'Your Name'}</span>
                                    <span class="student-rank-wrapper" id="rank-badge-placeholder"></span>
                                </div>
                            </div>
                        </div>
                        <div class="student-tagline">${p.tagline || 'Intern at I.R.I.S'}</div>
                        <div class="student-meta-row">
                             ${p.location ? `<span class="student-meta-item"><span class="material-symbols-outlined" style="font-size: 14px;">location_on</span>${p.location}</span>` : ''}
                            ${intern.company ? `<span class="student-meta-item"><span class="material-symbols-outlined" style="font-size: 14px;">domain</span>${intern.company}</span>` : ''}
                        </div>
                    </div>
                    <div class="student-hero-actions">
                        <button id="edit-profile-btn" class="btn btn-secondary btn-sm"><span class="material-symbols-outlined" style="font-size: 16px;">edit</span>Edit Profile</button>
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
                        <div class="student-stat-icon" style="background:rgba(${s.color === 'cyan' ? '34,211,238' : s.color === 'blue' ? '79,124,255' : s.color === 'orange' ? '251,188,5' : '139,92,246'},.1)">
                            <span class="material-symbols-outlined" style="color:var(--clr-${s.color})">${s.icon}</span>
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
                            <div class="student-section-icon" style="background:rgba(79,124,255,.12)"><span class="material-symbols-outlined" style="color:var(--clr-blue)">description</span></div>
                            <h2 class="student-section-title">About Me</h2>
                        </div>
                        <div class="student-section-body">
                            <p class="bio-text">${p.bio || 'Please share a brief professional bio in your settings.'}</p>
                        </div>
                    </section>

                    <!-- Skills -->
                    <section class="student-section reveal anim-d2">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(34,211,238,.1)"><span class="material-symbols-outlined" style="color:var(--clr-cyan)">bolt</span></div>
                            <h2 class="student-section-title">Technical Skills</h2>
                            <button class="add-skill-btn" id="add-skill-btn" title="Add skill"><span class="material-symbols-outlined" style="font-size: 16px;">add</span></button>
                        </div>
                        <div class="student-section-body">
                            <div class="inline-form" id="inline-skill-form" hidden style="margin-bottom:var(--sp-4)">
                                <div class="inline-form-row" style="gap: 8px;">
                                    <input type="text" id="new-skill-input" class="field-input" placeholder="Skill (e.g. React)" style="flex:2">
                                    <input type="number" id="new-skill-level" class="field-input" placeholder="%" style="flex:1" min="1" max="100">
                                    <button class="btn btn-primary btn-sm" id="save-skill-btn">Add</button>
                                </div>
                            </div>
                            <div class="skills-cloud">
                                ${(p.skills || []).map(s => `
                                    <span class="skill-badge">${typeof s === 'object' ? s.name : s} ${typeof s === 'object' ? `<span class="skill-pct-tag">${s.level}%</span>` : ''}
                                        <button class="skill-remove-btn" data-skill="${typeof s === 'object' ? s.name : s}">&times;</button>
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    </section>
                </div>

                <!-- Right Sidebar -->
                <div>
                     <!-- Points & Badges -->
                    <section class="student-section reveal anim-d1" id="rewards-section">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(139,92,246,.1)"><span class="material-symbols-outlined" style="color:var(--clr-accent)">military_tech</span></div>
                            <h2 class="student-section-title">Rewards & Badges</h2>
                        </div>
                        <div class="student-section-body">
                            <div id="rewards-content" style="display:flex;flex-direction:column;gap:var(--sp-4);">
                                <div style="display:flex;align-items:center;gap:var(--sp-3)">
                                    <div class="points-pill" id="points-display">⚡ Loading pts...</div>
                                    <a href="leaderboard.html" class="text-xs text-accent" style="text-decoration:none">View Rank ↗</a>
                                </div>
                                <div>
                                    <div style="font-size:10px;color:var(--clr-text-muted);margin-bottom:var(--sp-2);text-transform:uppercase;letter-spacing:.05em">Unlocked Highlights</div>
                                    <div class="badge-showcase" id="badges-display">Loading...</div>
                                </div>
                                <a href="doubts.html" class="btn btn-secondary btn-sm" style="width:100%">
                                    <span class="material-symbols-outlined" style="font-size:16px">chat</span>
                                    The Wall
                                </a>
                            </div>
                        </div>
                    </section>

                    <!-- Details -->
                    <section class="student-section reveal anim-d2">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(16,185,129,.1)"><span class="material-symbols-outlined" style="color:var(--clr-success)">assignment</span></div>
                            <h2 class="student-section-title">Details</h2>
                        </div>
                        <div class="student-section-body">
                            <div class="info-list">
                                <div class="info-row"><div class="info-label">Full Name</div><div class="info-value">${p.name || '—'}</div></div>
                                <div class="info-row"><div class="info-label">Email</div><div class="info-value">${p.email || '—'}</div></div>
                                <div class="info-row"><div class="info-label">Current Role</div><div class="info-value">${intern.role || '—'}</div></div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <!-- Settings -->
            <section class="student-section reveal anim-d3" id="account-settings-section">
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
        const ptsEl     = document.getElementById('points-display');
        const badgesEl  = document.getElementById('badges-display');
        const qValueEl  = document.getElementById('q-stat-card-value');
        const aValueEl  = document.getElementById('a-stat-card-value');
        const rankBatch = document.getElementById('rank-badge-placeholder');

        try {
            const { points, badges, qaStats } = await BadgeEngine.getUserRewards(userId);
            
            if (ptsEl)     ptsEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">bolt</span> ${points} Points`;
            if (badgesEl)  badgesEl.innerHTML = BadgeEngine.renderBadges(badges);
            if (qValueEl)  qValueEl.textContent = qaStats.questionsAsked || 0;
            if (aValueEl)  aValueEl.textContent = qaStats.answersPosted || 0;

            if (rankBatch && Storage.getInternRank) {
                const rank = Storage.getInternRank(userId);
                if (rank) rankBatch.innerHTML = `<span class="student-rank-badge">#${rank} Rank</span>`;
            }
        } catch (err) {
            console.warn('[Profile] loadRewards error:', err);
        }
    }

    function initReveal() {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => { 
                if (e.isIntersecting) { 
                    e.target.classList.add('visible'); 
                    obs.unobserve(e.target); 
                } 
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
        
        // Simple saves
        document.getElementById('name-save-btn')?.addEventListener('click', async () => {
            p.name = document.getElementById('name-edit-field').value.trim();
            Storage.saveProfile(session.userId, p);
            if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
            showToast('Updated!', 'success');
            refresh(p, session);
        });
        document.getElementById('bio-save-btn')?.addEventListener('click', async () => {
             p.bio = document.getElementById('bio-edit-field').value.trim();
             Storage.saveProfile(session.userId, p);
             if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
             showToast('Bio updated!', 'success');
             refresh(p, session);
        });

        // Add skill UI
        document.getElementById('add-skill-btn')?.addEventListener('click', () => {
            const form = document.getElementById('inline-skill-form');
            if(form) form.hidden = false;
        });
        document.getElementById('save-skill-btn')?.addEventListener('click', async () => {
            const input = document.getElementById('new-skill-input');
            const levelInput = document.getElementById('new-skill-level');
            const val = input ? input.value.trim() : '';
            const level = levelInput ? parseInt(levelInput.value) || 0 : 0;
            
            if (val) {
                if (!level || level < 1 || level > 100) {
                    showToast('Please enter a skill level between 1-100%', 'error');
                    return;
                }
                if (!p.skills) p.skills = [];
                p.skills.push({ name: val, level: level });
                Storage.saveProfile(session.userId, p);
                if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
                refresh(p, session);
            }
        });

        // Remove skill
        document.querySelectorAll('.skill-remove-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name = btn.dataset.skill;
                p.skills = (p.skills || []).filter(s => (typeof s === 'object' ? s.name : s) !== name);
                Storage.saveProfile(session.userId, p);
                if (Storage.syncInternProfile) await Storage.syncInternProfile(session.userId, p);
                refresh(p, session);
            });
        });
    }

    function refresh(p, session) {
        const outputEl = document.getElementById('profile-output');
        if (outputEl) {
            outputEl.innerHTML = buildStudentHTML(p, session, currentProjectIdx);
            setupEventListeners(p, session);
            loadRewards(session.userId);
            SidebarEngine.init(session, 'student-profile.html');
            initReveal();
        }
    }

    function showToast(m, t='info') {
        const tc = document.getElementById('toast-container');
        if (!tc) return;
        const toast = document.createElement('div');
        toast.className = `toast ${t}`;
        toast.innerHTML = `<span class="material-symbols-outlined">${t==='success'?'check':'info'}</span><span>${m}</span>`;
        tc.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Sidebar logic handled by global SidebarEngine in sidebar-engine.js

})();
