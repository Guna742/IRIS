/**
 * InternTrack — Student Profile Logic
 * Enhanced read-only profile display for interns.
 * Features: hero with completion bar, animated stats, skills, timeline, projects preview.
 */

'use strict';

(() => {
    const session = Auth.requireAuth();
    if (!session) return;

    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    setupSidebar(session, 'student-profile.html');
    let currentProjectIdx = 0;

    // Topbar badge
    const badge = document.getElementById('topbar-role-badge');
    if (badge) { badge.textContent = 'Intern'; badge.className = 'badge badge-user'; }

    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    // ── Load profile ──
    const loadingEl = document.getElementById('profile-loading');
    const outputEl = document.getElementById('profile-output');

    // Render immediately (script is at end of body)
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
        // Handle skeletal profiles (new users)
        if (p._isSkeleton) {
            delete p._isSkeleton;
            Storage.saveProfile(session.userId, p);
        }

        if (outputEl) {
            outputEl.hidden = false;
            outputEl.innerHTML = buildStudentHTML(p, session, currentProjectIdx);
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

    // ── Build HTML ──
    function buildStudentHTML(p, session, currentProjectIdx) {
        const intern = p.internship || {};
        const links = p.socialLinks || {};
        const myProjects = Storage.getProjects().filter(pr => pr.ownerId === session.userId);
        const skillCount = (p.skills || []).length;
        const pct = computeCompletion(p);
        const isActive = intern.endDate ? new Date(intern.endDate) >= new Date() : !!intern.company;
        const stats = [
            { id: 'skill-stat-card', label: 'Skills Listed', value: skillCount, icon: 'bolt', color: 'cyan' },
            { id: 'project-stat-card', label: 'Projects', value: myProjects.length, icon: 'folder', color: 'blue', clickable: true },
            { id: 'intern-stat-card', label: isActive ? 'Active Intern' : 'Intern Status', value: isActive ? '✓' : '—', icon: 'domain', color: 'green' }
        ];

        return `
        <div class="student-profile-wrap">

            <!-- Hero -->
            <div class="student-hero reveal" aria-label="Profile summary">
                <div class="student-hero-banner">
                    <div class="student-orb student-orb-1"></div>
                    <div class="student-orb student-orb-2"></div>
                </div>
                <div class="student-hero-body">
                    <div class="student-avatar-wrap">
                        <div class="student-avatar" id="student-avatar" aria-label="${p.name || 'Intern'} avatar">
                            ${p.avatar
                ? `<img src="${p.avatar}" alt="${p.name} profile picture" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
                : `<span>${(p.name || 'I')[0].toUpperCase()}</span>`}
                        </div>
                        ${isActive ? `<div class="student-status-dot" title="Active Intern" aria-label="Active intern"></div>` : ''}
                    </div>
                    <div class="student-info">
                        <div class="student-display-name" style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px; position: relative;">
                            <div style="position: relative;">
                                ${Storage.getInternRank && Storage.getInternRank(session.userId) === 1 ? '<span class="student-crown-icon" title="Leaderboard #1" style="font-size: 2.2rem; position: absolute; bottom: calc(100% - 10px); left: 0; margin-bottom: 2px;">👑</span>' : ''}
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span class="student-name-text">
                                        ${p.name || 'Your Name'}
                                    </span>
                                    <span class="student-rank-wrapper">
                                        ${Storage.getInternRank ? (() => {
                const rank = Storage.getInternRank(session.userId);
                return rank ? `<span class="student-rank-badge" title="Leaderboard Rank">#${rank} Rank</span>` : '';
            })() : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="student-tagline">${p.tagline || 'Software Engineering Intern'}</div>
                        <div class="student-meta-row">
                             ${p.location ? `<span class="student-meta-item">
                                <span class="material-symbols-outlined" style="font-size: 14px;">location_on</span>
                                ${p.location}
                            </span>` : ''}
                            ${intern.company ? `<span class="student-meta-item">
                                <span class="material-symbols-outlined" style="font-size: 14px;">domain</span>
                                ${intern.company}
                            </span>` : ''}
                            ${links.github ? `<a class="student-meta-item" href="${links.github}" target="_blank" rel="noopener" aria-label="GitHub">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                                GitHub
                            </a>` : ''}
                            ${links.linkedin ? `<a class="student-meta-item" href="${links.linkedin}" target="_blank" rel="noopener" aria-label="LinkedIn">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                LinkedIn
                            </a>` : ''}
                        </div>
                    </div>
                    <div class="student-hero-actions">
                        <button id="edit-profile-btn" class="btn btn-secondary btn-sm">
                            <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                            Edit Profile
                        </button>
                        <a href="projects.html" class="btn btn-secondary btn-sm">
                            <span class="material-symbols-outlined" style="font-size: 16px;">folder</span>
                            My Projects
                        </a>
                    </div>
                </div>

                <!-- Completion Bar -->
                <div class="completion-bar-wrap">
                    <span class="completion-label">Profile Completion</span>
                    <div class="completion-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Profile completion ${pct}%">
                        <div class="completion-fill" id="completion-fill" style="width:0%"></div>
                    </div>
                    <span class="completion-pct" id="completion-pct">0%</span>
                </div>
            </div>

            <!-- Stats Row -->
            <div class="student-stats-row" role="region" aria-label="Profile stats">
                ${stats.map((s, i) => `
                    <div class="student-stat-card ${s.clickable ? 'clickable-stat' : ''}" ${s.id ? `id="${s.id}"` : ''}>
                        <div class="student-stat-icon" style="background:rgba(${s.color === 'cyan' ? '34,211,238' : s.color === 'blue' ? '79,124,255' : '16,185,129'},.1)" aria-hidden="true">
                            <span class="material-symbols-outlined" style="color:var(--clr-${s.color})">${s.icon}</span>
                        </div>
                        <div class="student-stat-info">
                            <div class="student-stat-value">${s.value}</div>
                            <div class="student-stat-label">${s.label}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Main Grid -->
            <div class="student-main-grid">

                <!-- Left Column -->
                <div>
                    <!-- About -->
                    <section class="student-section reveal anim-d1" aria-label="About">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(79,124,255,.12)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-blue)">description</span></div>
                            <h2 class="student-section-title">About Me</h2>
                        </div>
                        <div class="student-section-body">
                            <p class="bio-text">${p.bio || 'No bio available yet. Please add a brief introduction in your Account Settings.'}</p>
                        </div>
                    </section>

                    <!-- Skills -->
                    <section class="student-section reveal anim-d2" aria-label="Skills">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(34,211,238,.1)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-cyan)">bolt</span></div>
                            <h2 class="student-section-title">Technical Skills</h2>
                            <button class="add-skill-btn" id="add-skill-btn" title="Add new skill" aria-label="Add new skill" ${(p.skills || []).length === 0 ? 'hidden' : ''}>
                                <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
                            </button>
                        </div>
                        <div class="student-section-body">
                            <div class="inline-form" id="inline-skill-form" ${(p.skills || []).length === 0 ? '' : 'hidden'} style="margin-bottom:var(--sp-4)">
                                <div class="inline-form-row">
                                    <input type="text" id="new-skill-input" class="field-input" placeholder="e.g. React, Python" style="flex:1">
                                    <button class="btn btn-primary btn-sm" id="save-skill-btn">Add</button>
                                    <button class="btn btn-secondary btn-sm" id="cancel-skill-btn">Cancel</button>
                                </div>
                            </div>
                            ${(p.skills || []).length ? `
                            <div class="skills-cloud" role="list" aria-label="Skills list">
                                ${(p.skills).map(s => {
                const name = typeof s === 'object' ? s.name : s;
                const level = typeof s === 'object' ? s.level : null;
                return `<span class="skill-badge" role="listitem" title="${level ? `Proficiency: ${level}%` : 'Skill'}">
                                        ${name}
                                        ${level ? `<span class="skill-pct-tag">${level}%</span>` : ''}
                                        <button class="skill-remove-btn" data-skill="${name}" aria-label="Remove ${name} skill">
                                            <span class="material-symbols-outlined" style="font-size: 10px;">close</span>
                                        </button>
                                    </span>`;
            }).join('')}
                            </div>
                            ` : ''}
                        </div>
                    </section>

                    <!-- Project Progress -->
                    <section class="student-section reveal anim-d3" aria-label="Project progress">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(168,85,247,.1)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-violet)">analytics</span></div>
                            <h2 class="student-section-title">Project Progress</h2>
                            ${myProjects.length > 1 ? `
                            <div class="carousel-nav">
                                <button class="nav-arrow" id="next-proj-btn" title="See Next Project" aria-label="Next Project">
                                    <span class="material-symbols-outlined" style="font-size: 18px;">chevron_right</span>
                                </button>
                            </div>` : ''}
                        </div>
                        <div class="student-section-body">
                            ${myProjects.length > 0 ? (() => {
                try {
                    const idxSource = Number.isFinite(currentProjectIdx) ? currentProjectIdx : 0;
                    const safeIdx = Math.max(0, Math.min(idxSource, myProjects.length - 1));
                    const curr = myProjects[safeIdx];
                    if (!curr) return '<div class="empty-state-mini">Project not found.</div>';

                    const statusRaw = curr.status || 'Ongoing';
                    const statusValue = String(statusRaw);
                    const updates = Array.isArray(curr.updates) ? curr.updates : [];

                    return `
                                <div class="project-progress-card">
                                    <div class="pp-header">
                                        <div>
                                            <div class="pp-title">${curr.title || 'Untitled Project'}</div>
                                            <div class="pp-status-row">
                                                <span class="pp-status-badge ${(statusValue || 'Ongoing').toString().toLowerCase()}">${statusValue}</span>
                                                <span class="pp-date">Started ${fmtDate(curr.createdAt)}</span>
                                            </div>
                                        </div>
                                        ${updates.length > 0 ? `<button class="btn btn-primary btn-xs" id="add-progress-btn">Add Progress</button>` : ''}
                                    </div>
                                    
                                    <div class="inline-form" id="inline-progress-form" ${updates.length ? 'hidden' : ''} style="margin:var(--sp-4) 0">
                                        <textarea id="new-progress-input" class="field-input" rows="2" placeholder="Describe what you achieved today..."></textarea>
                                        <div style="margin-top:8px; display:flex; gap:8px">
                                            <button class="btn btn-primary btn-sm" id="save-progress-btn">Save Update</button>
                                            <button class="btn btn-secondary btn-sm" id="cancel-progress-btn">Cancel</button>
                                        </div>
                                    </div>
                                    
                                    <div class="pp-updates-list">
                                        ${updates.length > 0
                            ? updates.map(u => `
                                            <div class="pp-update-item">
                                                <div class="pp-update-dot"></div>
                                                <div class="pp-update-content">
                                                    <div class="pp-update-time">${fmtDate(u ? u.date : null)}</div>
                                                    <div class="pp-update-text">${u ? u.text : 'Empty update'}</div>
                                                </div>
                                            </div>`).join('')
                            : ''}
                                    </div>
                                </div>`;
                } catch (e) {
                    console.error('Carousel item render error:', e);
                    return `<div class="empty-state-mini">Error rendering project: ${e.message}</div>`;
                }
            })() : '<div class="empty-state-mini">No projects found for this intern.</div>'}
                        </div>
                    </section>
                </div>

                <!-- Right Sidebar -->
                <div>
                    <!-- Contact Details -->
                    <section class="student-section reveal anim-d1" aria-label="Contact details">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(16,185,129,.1)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-success)">assignment</span></div>
                            <h2 class="student-section-title">Details</h2>
                        </div>
                        <div class="student-section-body">
                            <div class="info-list">
                                <div class="info-row">
                                    <div class="info-label">Full Name</div>
                                    <div class="info-value">${p.name || '—'}</div>
                                </div>
                                <div class="info-row">
                                    <div class="info-label">Email</div>
                                    <div class="info-value"><a href="mailto:${p.email}">${p.email || '—'}</a></div>
                                </div>
                                <div class="info-row">
                                    <div class="info-label">Location</div>
                                    <div class="info-value">${p.location || '—'}</div>
                                </div>
                                <div class="info-row">
                                    <div class="info-label">Current Role</div>
                                    <div class="info-value">${intern.role || '—'}</div>
                                </div>
                                <div class="info-row">
                                    <div class="info-label">Company</div>
                                    <div class="info-value">${intern.company || '—'}</div>
                                </div>
                                <div class="divider" style="margin:var(--sp-3) 0"></div>
                                <div class="info-row">
                                    <div class="info-label">GitHub</div>
                                    <div class="info-value">
                                        ${links.github ? `<a href="${links.github}" target="_blank" rel="noopener">View Profile ↗</a>` : '—'}
                                    </div>
                                </div>
                                <div class="info-row">
                                    <div class="info-label">LinkedIn</div>
                                    <div class="info-value">
                                        ${links.linkedin ? `<a href="${links.linkedin}" target="_blank" rel="noopener">View Profile ↗</a>` : '—'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div class="student-section reveal anim-d2" style="text-align:center;padding:var(--sp-6)">
                        <div style="font-size:2rem;margin-bottom:var(--sp-3)" aria-hidden="true"><span class="material-symbols-outlined" style="font-size: 40px; color:var(--clr-accent)">adjust</span></div>
                        <div style="font-weight:var(--fw-semi);margin-bottom:var(--sp-2)">IRIS Dashboard</div>
                        <div class="text-muted text-sm" style="margin-bottom:var(--sp-4)">Your creative progress, tracked in one place.</div>
                        <a href="dashboard.html" class="btn btn-secondary btn-sm" style="width:100%">Go to Dashboard</a>
                    </div>

                    <!-- Points & Badges -->
                    <section class="student-section reveal anim-d3" id="rewards-section" aria-label="Points and Badges">
                        <div class="student-section-head">
                            <div class="student-section-icon" style="background:rgba(139,92,246,.1)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-accent)">military_tech</span></div>
                            <h2 class="student-section-title">Points &amp; Badges</h2>
                        </div>
                        <div class="student-section-body">
                            <div id="rewards-content" style="display:flex;flex-direction:column;gap:var(--sp-4);">
                                <div style="display:flex;align-items:center;gap:var(--sp-3)">
                                    <span style="color:var(--clr-text-secondary);font-size:var(--fs-sm)">Total Points:</span>
                                    <span class="points-pill" id="points-display"><span class="material-symbols-outlined" style="font-size:16px">star</span> Loading...</span>
                                </div>
                                <div>
                                    <div style="font-size:var(--fs-xs);color:var(--clr-text-muted);margin-bottom:var(--sp-2);text-transform:uppercase;letter-spacing:.07em">Earned Badges</div>
                                    <div class="badge-showcase" id="badges-display">Loading...</div>
                                </div>
                                <a href="doubts.html" class="btn btn-secondary btn-sm" style="align-self:flex-start">
                                    <span class="material-symbols-outlined" style="font-size:16px">help_center</span>
                                    Go to Doubts
                                </a>
                            </div>
                        </div>
                    </section>

                </div>
            </div>

            <!-- Account Settings Section (Editable) -->
            <section class="student-section reveal anim-d3" id="account-settings-section" aria-label="Account Settings">
                <div class="student-section-head">
                    <div class="student-section-icon" style="background:rgba(255,255,255,0.05)" aria-hidden="true"><span class="material-symbols-outlined">settings</span></div>
                    <h2 class="student-section-title">Account Settings</h2>
                </div>
                <div class="student-section-body">
                    <div class="edit-fields-grid">
                        <div class="edit-field-group">
                            <label class="field-label">Display Name</label>
                            <div class="name-edit-wrap">
                                <input type="text" id="name-edit-field" class="field-input" value="${p.name || ''}" placeholder="Your Full Name">
                                <button id="name-save-btn" class="btn btn-primary btn-sm">Save</button>
                            </div>
                        </div>
                        <div class="edit-field-group">
                            <label class="field-label">Profile Tagline</label>
                            <div class="tagline-edit-wrap">
                                <input type="text" id="tagline-edit-field" class="field-input" value="${p.tagline || ''}" placeholder="e.g. Software Engineering Intern">
                                <button id="tagline-save-btn" class="btn btn-primary btn-sm">Save</button>
                            </div>
                        </div>
                        <div class="edit-field-group" style="grid-column: 1 / -1;">
                            <label class="field-label">About Me (Bio)</label>
                            <div class="bio-edit-wrap" style="display: flex; flex-direction: column; gap: 8px;">
                                <textarea id="bio-edit-field" class="field-input" rows="4" placeholder="Write a brief professional bio about yourself...">${p.bio || ''}</textarea>
                                <div style="text-align: right;">
                                    <button id="bio-save-btn" class="btn btn-primary btn-sm">Save Bio</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

        </div>`;
    }

    function fmtDate(d) {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }); }
        catch { return d; }
    }

    // ── Load Q&A Points & Badges from Firestore ──
    async function loadRewards(userId) {
        const pointsEl = document.getElementById('points-display');
        const badgesEl = document.getElementById('badges-display');
        if (!pointsEl && !badgesEl) return;

        try {
            if (typeof BadgeEngine === 'undefined') return;
            
            // Sync performance badges before displaying
            await BadgeEngine.refreshBadges(userId);

            const { points, badges } = await BadgeEngine.getUserRewards(userId);
            if (pointsEl) pointsEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">star</span> ${points} pts`;
            if (badgesEl) badgesEl.innerHTML = BadgeEngine.renderBadges(badges);
        } catch (err) {
            console.warn('[Profile] loadRewards failed:', err);
            if (pointsEl) pointsEl.textContent = '—';
            if (badgesEl) badgesEl.textContent = 'Could not load badges.';
        }
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

    // ── Event Listeners ──
    function setupEventListeners(p, session) {
        // Projects stat card redirect
        const statCard = document.getElementById('project-stat-card');
        if (statCard) {
            statCard.addEventListener('click', () => {
                window.location.href = 'projects.html';
            });
        }

        // Add skill
        const addSkillBtn = document.getElementById('add-skill-btn');
        const skillForm = document.getElementById('inline-skill-form');
        const saveSkillBtn = document.getElementById('save-skill-btn');
        const cancelSkillBtn = document.getElementById('cancel-skill-btn');
        const skillInput = document.getElementById('new-skill-input');

        if (addSkillBtn && skillForm) {
            addSkillBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                skillForm.hidden = false;
                if (skillInput) skillInput.focus();
                addSkillBtn.hidden = true;
            });
        }

        if (cancelSkillBtn && skillForm) {
            cancelSkillBtn.addEventListener('click', () => {
                skillForm.hidden = true;
                if (skillInput) skillInput.value = '';
                if (addSkillBtn) addSkillBtn.hidden = false;
            });
        }

        if (saveSkillBtn && skillInput) {
            saveSkillBtn.addEventListener('click', () => {
                const name = skillInput.value.trim();
                if (!name) {
                    showToast('Please enter a skill name.', 'error');
                    return;
                }

                promptSkillLevel(name, (level) => {
                    const currentSkills = Array.isArray(p.skills) ? p.skills : [];
                    const updatedSkills = [...currentSkills, { name, level: parseInt(level) }];

                    p.skills = updatedSkills;
                    Storage.saveProfile(session.userId, p);

                    // Explicitly reset the form state before refreshing
                    if (skillInput) skillInput.value = '';
                    if (skillForm) skillForm.hidden = true;
                    if (addSkillBtn) addSkillBtn.hidden = false;

                    refreshView(p, session);
                    showToast(`Skill "${name}" added!`, 'success');
                });
            });

            // Support Enter key
            skillInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') saveSkillBtn.click();
            });
        }

        // Remove skill
        document.querySelectorAll('.skill-remove-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const skillName = btn.dataset.skill;
                if (await IrisModal.confirm(`Remove skill "${skillName}"?`, 'Confirm Removal', true)) {
                    p.skills = (p.skills || []).filter(s => (typeof s === 'object' ? s.name : s) !== skillName);
                    Storage.saveProfile(session.userId, p);
                    refreshView(p, session);
                    showToast(`Skill "${skillName}" removed.`, 'info');
                }
            });
        });

        function promptSkillLevel(skillName, onSave) {
            let modal = document.getElementById('skill-level-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'skill-level-modal';
                modal.className = 'skill-modal-overlay';
                document.body.appendChild(modal);
            }

            // Use a fresh innerHTML to clear old listeners inside the card
            modal.innerHTML = `
                <div class="skill-modal-card reveal visible">
                    <div class="skill-modal-header">
                        <h3 class="skill-modal-title">Expertise Level</h3>
                        <button class="skill-modal-close" id="modal-close-x">&times;</button>
                    </div>
                    <div class="skill-modal-body">
                        <p class="skill-modal-intro">How proficient are you in <strong>${skillName}</strong>?</p>
                        <div class="slider-wrapper">
                            <div class="skill-range-val" id="skill-range-display" style="font-size: 2.5rem; font-weight: 800; text-align: center; margin-bottom: 20px;">80%</div>
                            <div class="slider-container" style="position: relative; width: 100%; height: 40px; display: flex; align-items: center;">
                                <div class="slider-track" style="position: absolute; height: 3px; width: 100%; background: #e4e4e7; border-radius: 10px;">
                                    <div class="slider-range" id="sliderRange" style="position: absolute; height: 3px; background: #2563eb; border-radius: 10px; width: 80%;"></div>
                                </div>
                                <input type="range" id="skill-level-range" min="0" max="100" step="1" value="80" class="skill-slider custom-range-slider" />
                                <div id="valueBubble" class="value-bubble">80</div>
                            </div>
                            <div class="skill-range-labels" style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #888; text-transform: uppercase; margin-top: 10px;">
                                <span>Beginner</span>
                                <span>Expert</span>
                            </div>
                        </div>
                    </div>
                    <div class="skill-modal-footer">
                        <button class="btn btn-secondary skill-modal-close" id="modal-cancel-btn">Cancel</button>
                        <button class="btn btn-primary" id="confirm-skill-level">Add Skill</button>
                    </div>
                </div>
            `;

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';

            const newModal = modal.cloneNode(true);
            modal.parentNode.replaceChild(newModal, modal);
            modal = newModal;

            const rangeInput = modal.querySelector('#skill-level-range');
            const display = modal.querySelector('#skill-range-display');
            const sliderRange = modal.querySelector('#sliderRange');
            const bubble = modal.querySelector('#valueBubble');

            const updateSlider = () => {
                const value = rangeInput.value;
                const min = rangeInput.min ? rangeInput.min : 0;
                const max = rangeInput.max ? rangeInput.max : 100;
                const percent = ((value - min) / (max - min)) * 100;

                if (bubble) {
                    bubble.innerText = value;
                    bubble.style.left = percent + "%";
                    bubble.style.transform = "translate(-50%, -5px)";
                    setTimeout(() => {
                        bubble.style.transform = "translate(-50%, 0px)";
                    }, 150);
                }

                if (sliderRange) sliderRange.style.width = percent + "%";
                if (display) display.textContent = value + '%';
            };

            rangeInput.addEventListener('input', updateSlider);
            updateSlider();

            const close = () => {
                modal.classList.remove('active');
                document.body.style.overflow = '';
                // Optional: remove contents after transition
                setTimeout(() => { if (!modal.classList.contains('active')) modal.innerHTML = ''; }, 300);
            };

            modal.querySelectorAll('.skill-modal-close').forEach(c => c.addEventListener('click', close));

            modal.addEventListener('click', (e) => {
                if (e.target === modal) close();
            });

            modal.querySelector('#confirm-skill-level').addEventListener('click', () => {
                const level = rangeInput.value;
                close(); // Close first to improve feel
                setTimeout(() => onSave(level), 50); // Small delay to let modal start closing
            });
        }

        // Carousel Navigation
        const nextBtn = document.getElementById('next-proj-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const myProjects = Storage.getProjects().filter(pr => pr.ownerId === session.userId);
                if (myProjects.length > 0) {
                    currentProjectIdx = (currentProjectIdx + 1) % myProjects.length;
                    refreshView(p, session);
                }
            });
        }

        // Add Progress
        const addProgressBtn = document.getElementById('add-progress-btn');
        const progressForm = document.getElementById('inline-progress-form');
        const saveProgressBtn = document.getElementById('save-progress-btn');
        const cancelProgressBtn = document.getElementById('cancel-progress-btn');
        const progressInput = document.getElementById('new-progress-input');

        if (addProgressBtn && progressForm) {
            addProgressBtn.addEventListener('click', () => {
                progressForm.hidden = false;
                if (progressInput) progressInput.focus();
                addProgressBtn.hidden = true;
            });
        }

        if (cancelProgressBtn && progressForm) {
            cancelProgressBtn.addEventListener('click', () => {
                progressForm.hidden = true;
                if (progressInput) progressInput.value = '';
                if (addProgressBtn) addProgressBtn.hidden = false;
            });
        }

        if (saveProgressBtn && progressInput) {
            saveProgressBtn.addEventListener('click', () => {
                const myProjects = Storage.getProjects().filter(pr => pr.ownerId === session.userId);
                const curr = myProjects[currentProjectIdx];
                const text = progressInput.value;
                if (text && text.trim()) {
                    if (!curr.updates) curr.updates = [];
                    curr.updates.unshift({ date: new Date().toISOString(), text: text.trim() });
                    Storage.saveProject(curr);
                    refreshView(p, session);
                }
            });
        }

        // ── Edit Profile Enhancements ──
        const editProfileBtn = document.getElementById('edit-profile-btn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', () => {
                const accountSection = document.getElementById('account-settings-section');
                if (accountSection) {
                    accountSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const nameField = document.getElementById('name-edit-field');
                    if (nameField) {
                        setTimeout(() => {
                            nameField.focus();
                            nameField.classList.add('anim-pulse');
                            setTimeout(() => nameField.classList.remove('anim-pulse'), 1500);
                        }, 600);
                    }
                }
            });
        }

        // Avatar logic removed

        // Name Save
        const nameSaveBtn = document.getElementById('name-save-btn');
        const nameField = document.getElementById('name-edit-field');
        if (nameSaveBtn && nameField) {
            nameSaveBtn.addEventListener('click', () => {
                const newName = nameField.value.trim();
                if (!newName) { showToast('Name cannot be empty.', 'error'); return; }
                p.name = newName;
                Storage.saveProfile(session.userId, p);
                refreshView(p, session);
                showToast('Name updated!', 'success');
            });
            nameField.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameSaveBtn.click(); });
        }

        // Tagline Save
        const taglineSaveBtn = document.getElementById('tagline-save-btn');
        const taglineField = document.getElementById('tagline-edit-field');
        if (taglineSaveBtn && taglineField) {
            taglineSaveBtn.addEventListener('click', () => {
                const newTagline = taglineField.value.trim();
                if (!newTagline) { showToast('Tagline cannot be empty.', 'error'); return; }
                p.tagline = newTagline;
                Storage.saveProfile(session.userId, p);
                refreshView(p, session);
                showToast('Tagline updated!', 'success');
            });
            taglineField.addEventListener('keydown', (e) => { if (e.key === 'Enter') taglineSaveBtn.click(); });
        }

        // Bio Save
        const bioSaveBtn = document.getElementById('bio-save-btn');
        const bioField = document.getElementById('bio-edit-field');
        if (bioSaveBtn && bioField) {
            bioSaveBtn.addEventListener('click', () => {
                const newBio = bioField.value.trim();
                p.bio = newBio;
                Storage.saveProfile(session.userId, p);
                refreshView(p, session);
                showToast('Bio updated!', 'success');
            });
        }
    }

    function refreshView(p, session) {
        const outputEl = document.getElementById('profile-output');
        if (outputEl) {
            outputEl.innerHTML = buildStudentHTML(p, session, currentProjectIdx);
            setupEventListeners(p, session);
            setupSidebar(session, 'student-profile.html');
            initReveal();
            // Update completion bar
            const pct = computeCompletion(p);
            const fill = document.getElementById('completion-fill');
            const pctEl = document.getElementById('completion-pct');
            if (fill) fill.style.width = pct + '%';
            if (pctEl) pctEl.textContent = pct + '%';
        }
    }

    // ── Sidebar ──
    function setupSidebar(session, activePage) {
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
        if (roleEl) roleEl.textContent = isAdmin ? 'Administrator' : 'Intern';

        const items = [
            { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view' },
            { label: 'My Profile', href: 'student-profile.html', icon: 'person', active: true },
            { label: 'Leaderboard', href: 'leaderboard.html', icon: 'leaderboard' },
            { label: 'My Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics' },
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
