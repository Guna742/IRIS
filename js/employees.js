/**
 * I.R.I.S — Employees Page Logic
 * Shows all employee cards with expandable details.
 * Mirrors students.js but filters by role='employee'.
 */

'use strict';

(() => {
  // Guard: admin only
  const session = Auth.requireAuth();
  if (!session) return;

  if (session.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
    Storage.fetchEverything();
  }

  // ── DOM refs ──
  const welcome         = document.getElementById('welcome-title');
  const welcomeSub      = document.getElementById('welcome-sub');
  const logoutBtn       = document.getElementById('logout-btn');
  const employeesContainer = document.getElementById('students-container');
  const employeesCountEl   = document.getElementById('students-count');

  if (welcome)    welcome.textContent    = 'Employee Directory';
  if (welcomeSub) welcomeSub.textContent = 'Review employee profiles, performance metrics, and project contributions.';

  // ── Helper: get all employee profiles ──
  function getEmployeeProfiles() {
    const all = Object.values(Storage.getProfiles());
    return all.filter(p => {
      // Direct role match (Preferred)
      if (p.role === 'employee') return true;
      // Fallback for transitionary profiles
      const tagline = (p.tagline || '').toLowerCase();
      const roleTitle = (p.roleTitle || '').toLowerCase();
      if (tagline.includes('employee') || roleTitle.includes('employee')) return true;
      if (p.salary && p.salary > 0) return true; // Employees usually have salary recorded
      return false;
    });
  }

  // ── Global Search Filter ──
  const applySearchFilter = function () {
    const searchInput = document.getElementById('student-search-input');
    if (!searchInput) return;
    const term = searchInput.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.student-card');
    let visibleCount = 0;

    cards.forEach(card => {
      const cardText = card.textContent.toLowerCase();
      if (cardText.includes(term)) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (employeesCountEl) {
      employeesCountEl.textContent = `${visibleCount} employee${visibleCount !== 1 ? 's' : ''}`;
    }
  };
  window.applySearchFilter = applySearchFilter;

  function bindSearch() {
    const searchInput = document.getElementById('student-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', applySearchFilter);
      searchInput.addEventListener('keyup', applySearchFilter);
      if (searchInput.value) applySearchFilter();
    }
  }
  bindSearch();

  // ── Loading skeleton ──
  function showLoadingSkeleton() {
    if (!employeesContainer) return;
    employeesContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;padding:8px 0">
        ${Array(3).fill(0).map(() => `
          <div class="student-card" style="opacity:0.5;pointer-events:none;">
            <div class="student-summary" style="gap:16px">
              <div class="student-avatar" style="background:var(--clr-surface-2,rgba(255,255,255,0.06));animation:pulse 1.4s ease-in-out infinite;">&nbsp;</div>
              <div style="flex:1;display:flex;flex-direction:column;gap:8px">
                <div style="height:14px;width:160px;border-radius:6px;background:var(--clr-surface-2,rgba(255,255,255,0.06));animation:pulse 1.4s ease-in-out infinite;"></div>
                <div style="height:11px;width:110px;border-radius:6px;background:var(--clr-surface-2,rgba(255,255,255,0.06));animation:pulse 1.4s ease-in-out infinite;"></div>
              </div>
            </div>
          </div>`).join('')}
        <p style="text-align:center;color:var(--clr-text-muted,#6b7280);font-size:0.82rem;margin-top:8px">
          <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px">sync</span>
          Connecting to database...
        </p>
      </div>`;
    if (employeesCountEl) employeesCountEl.textContent = 'Loading...';
  }
  showLoadingSkeleton();

  // ── Live Firestore sync ──
  window.addEventListener('iris-data-sync', (e) => {
    if (e.detail && (e.detail.type === 'users' || e.detail.type === 'projects')) {
      const eps = getEmployeeProfiles();
      if (employeesCountEl) employeesCountEl.textContent = `${eps.length} employee${eps.length !== 1 ? 's' : ''}`;
      renderAllCards();
      bindSearch();
    }
  });

  // ── Immediate render from cache ──
  const cachedEmployees = getEmployeeProfiles();
  console.log(`[Employees] Initialized with ${cachedEmployees.length} profiles from cache.`);
  
  if (employeesCountEl) {
    employeesCountEl.textContent = `${cachedEmployees.length} employee${cachedEmployees.length !== 1 ? 's' : ''}`;
  }
  
  // Always render to show empty state if no employees
  renderAllCards();

  // Retry after a short delay to catch any late Firestore initialization
  setTimeout(() => {
    console.log('[Employees] Retrying initial render for late arrivals...');
    renderAllCards();
  }, 1000);

  // ── Render stars ──
  function renderStars(rating) {
    const full = Math.floor(rating);
    const hasHalf = (rating - full) >= 0.3 && (rating - full) < 0.8;
    const empty = Math.max(0, 5 - full - (hasHalf ? 1 : 0));
    return [
      ...Array(full).fill('<span class="star">★</span>'),
      ...(hasHalf ? ['<span class="star half">★</span>'] : []),
      ...Array(empty).fill('<span class="star empty">★</span>'),
    ].join('');
  }

  const projectIndices = {};

  function getProjectsForEmployee(profile) {
    if (!profile || !profile.userId) return [];
    return Storage.getProjects().filter(p => String(p.userId || p.ownerId) === String(profile.userId));
  }

  function buildEmployeeCardHTML(profile, i) {
    const { completion: progress, score, rating } = Storage.getProfileMetrics(profile);
    const projects = getProjectsForEmployee(profile);
    const scoreDeg = Math.round((score / 100) * 360);
    const initial  = (profile.name || profile.userId || '?')[0].toUpperCase();
    const hasPic   = !!profile.avatar;
    const now      = Date.now();
    const isSuspended = profile.suspendedUntil && profile.suspendedUntil > now;
    const isVerified = profile.verified !== false; // Default to true if not explicitly false
    const dept     = profile.internship?.role || profile.department || 'Employee';
    const company  = profile.internship?.company || profile.company || '';

    return `
      <div class="student-card anim-fadeInUp ${isSuspended ? 'suspended' : ''}"
           style="animation-delay:${i * 80}ms" id="card-${profile.userId}" data-uid="${profile.userId}">
        <div class="student-summary" role="button" tabindex="0" aria-expanded="false"
             aria-controls="details-${profile.userId}" onclick="toggleEmpCard('${profile.userId}')">
          <div class="student-avatar" style="${hasPic ? '' : 'background:linear-gradient(135deg,#3b82f6,#8b5cf6)'}" aria-hidden="true">
            ${hasPic ? `<img src="${profile.avatar}" alt="${profile.name}">` : `<span class="student-avatar-initials">${initial}</span>`}
          </div>
          <div class="student-identity">
            <div class="student-name">${profile.name || 'Unnamed Employee'}</div>
            <div class="student-role-tag">${dept}${company ? ' @ ' + company : ''}</div>
          </div>
          ${isSuspended ? `<div class="suspended-badge">Suspended</div>` : ''}
          ${!isVerified ? `<div class="unverified-badge" style="background:rgba(239,68,68,0.1);color:#f87171;font-size:10px;padding:2px 8px;border-radius:12px;border:1px solid rgba(239,68,68,0.2);margin-right:12px">Unverified</div>` : ''}
          ${profile._isNew ? `<div class="draft-badge" style="background:rgba(251,191,36,0.1);color:#fbbf24;font-size:10px;padding:2px 8px;border-radius:12px;border:1px solid rgba(251,191,36,0.2);margin-right:12px">Local Draft</div>` : ''}
          <div class="student-rating" aria-label="Rating ${rating} out of 5">
            <div class="stars">${renderStars(parseFloat(rating))}</div>
            <span class="rating-value">${rating}</span>
          </div>
          <div class="student-score" aria-label="Overall score ${score}">
            <div class="score-ring" style="--score-deg:${scoreDeg}deg">
              <span class="score-num">${score}%</span>
            </div>
          </div>
          <button class="expand-btn" aria-label="Expand employee details" tabindex="-1">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <div class="student-details" id="details-${profile.userId}" aria-hidden="true">
          <div class="student-details-inner">
            <div class="student-details-body">

              <!-- Left Column -->
              <div class="detail-column">
                <div class="detail-group">
                  <div class="detail-section-title">Profile Info</div>
                  <div class="meta-badges-vertical">
                    ${profile.location ? `
                    <div class="hero-meta-item">
                      <span class="material-symbols-outlined" style="font-size:16px;color:var(--clr-accent)">location_on</span>
                      <span class="meta-text">${profile.location}</span>
                    </div>` : ''}
                    ${profile.email ? `
                    <div class="hero-meta-item">
                      <span class="material-symbols-outlined" style="font-size:16px;color:var(--clr-accent)">mail</span>
                      <span class="meta-text">${profile.email}</span>
                    </div>` : ''}
                    ${profile.socialLinks?.linkedin ? `
                    <a class="hero-meta-item clickable" href="${profile.socialLinks.linkedin}" target="_blank">
                      <span class="material-symbols-outlined" style="font-size:16px;color:var(--clr-accent)">work</span>
                      <span class="meta-text">LinkedIn Profile</span>
                    </a>` : ''}
                  </div>
                </div>

                <div class="detail-group">
                  <div class="detail-section-title">Profile Completion</div>
                  <div class="progress-wrap">
                    <div class="progress-label">
                      <span>Completion Status</span>
                      <span class="count-up" data-target="${progress}">${progress}%</span>
                    </div>
                    <div class="progress-track">
                      <div class="progress-fill" style="width:${progress}%;background:linear-gradient(135deg,#3b82f6,#8b5cf6)"></div>
                    </div>
                  </div>
                </div>

                ${profile.skills?.length ? `
                <div class="detail-group">
                  <div class="detail-section-title">Skills</div>
                  <div class="skills-chips">
                    ${profile.skills.map(s => `<span class="skill-chip">${s}</span>`).join('')}
                  </div>
                </div>` : ''}

                <div class="detail-group">
                  <div class="detail-section-title">Overall Score</div>
                  <div class="progress-wrap">
                    <div class="progress-label">
                      <span>Performance Metrics</span>
                      <span class="count-up" data-target="${score}">${score}%</span>
                    </div>
                    <div class="progress-track">
                      <div class="progress-fill" style="width:${score}%;background:linear-gradient(135deg,#3b82f6,#8b5cf6)"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Right Column -->
              <div class="detail-column">
                <div class="detail-group">
                  <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center">
                    Project Progress
                    ${projects.length > 1 ? `
                    <div class="project-nav-container">
                      <button class="nav-arrow nav-arrow-sm" onclick="event.stopPropagation();prevEmpProj('${profile.userId}')" title="Previous">
                        <span class="material-symbols-outlined" style="font-size:16px">chevron_left</span>
                      </button>
                      <span class="project-counter">${(projectIndices[profile.userId] || 0) + 1} / ${projects.length}</span>
                      <button class="nav-arrow nav-arrow-sm" onclick="event.stopPropagation();nextEmpProj('${profile.userId}')" title="Next">
                        <span class="material-symbols-outlined" style="font-size:16px">chevron_right</span>
                      </button>
                    </div>` : ''}
                  </div>
                  ${projects.length > 0 ? (() => {
                    const idx  = projectIndices[profile.userId] || 0;
                    const curr = projects[idx];
                    const updates = curr.updates || [];
                    const fmt = d => d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'short' }) : '—';
                    return `
                    <div class="project-progress-card admin-view">
                      <div class="pp-header">
                        <div>
                          <div class="pp-title">${curr.title}</div>
                          <div class="pp-status-row">
                            <span class="pp-status-badge ${(curr.status||'Ongoing').toLowerCase()}">${curr.status||'Ongoing'}</span>
                            <span class="pp-date">Started ${fmt(curr.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div class="pp-updates-list">
                        ${updates.length > 0 ? updates.map(u => `
                          <div class="pp-update-item">
                            <div class="pp-update-dot"></div>
                            <div class="pp-update-content">
                              <div class="pp-update-time">${fmt(u.date)}</div>
                              <div class="pp-update-text">${u.text}</div>
                            </div>
                          </div>`).join('') : '<div class="text-dim text-xs">No progress updates.</div>'}
                      </div>
                    </div>`;
                  })() : '<div class="text-dim text-xs">No active projects.</div>'}
                </div>
              </div>

            </div>

            <!-- Footer Actions -->
            <div class="detail-edit-row">
              <div class="detail-actions-left">
                <button onclick="event.stopPropagation();suspendEmployee('${profile.userId}')" class="btn btn-warning btn-sm btn-magnetic">
                  <span class="material-symbols-outlined" style="font-size:16px">block</span> Suspend
                </button>
                <button onclick="event.stopPropagation();deleteEmployee('${profile.userId}')" class="btn btn-danger btn-sm btn-magnetic">
                  <span class="material-symbols-outlined" style="font-size:16px">delete</span> Delete
                </button>
                ${!isVerified ? `
                <button onclick="event.stopPropagation();verifyEmployee('${profile.userId}')" class="btn btn-success btn-sm btn-magnetic" style="background:linear-gradient(135deg,#10b981,#059669)">
                  <span class="material-symbols-outlined" style="font-size:16px">verified</span> Verify
                </button>` : `
                <button onclick="event.stopPropagation();unverifyEmployee('${profile.userId}')" class="btn btn-secondary btn-sm btn-magnetic">
                  <span class="material-symbols-outlined" style="font-size:16px">do_not_disturb_on</span> Unverify
                </button>`}
              </div>
              <div class="detail-actions-right">
                <a href="profile-builder.html?student=${profile.userId}" class="btn btn-secondary btn-sm btn-magnetic">
                  <span class="material-symbols-outlined" style="font-size:16px">edit</span> Edit Profile
                </a>
                <a href="employee-analytics.html?student=${profile.userId}" class="btn btn-primary btn-sm btn-magnetic"
                   style="background:linear-gradient(135deg,#3b82f6,#8b5cf6)">
                  <span class="material-symbols-outlined" style="font-size:16px">analytics</span> Analytics
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>`;
  }

  function renderAllCards() {
    if (!employeesContainer) {
      console.warn('[Employees] Container #students-container not found.');
      return;
    }
    const profileList = getEmployeeProfiles();
    console.log(`[Employees] Rendering ${profileList.length} cards...`);

    if (employeesCountEl) {
      employeesCountEl.textContent = `${profileList.length} employee${profileList.length !== 1 ? 's' : ''}`;
    }

    if (profileList.length === 0) {
      employeesContainer.innerHTML = `
        <div class="students-empty">
          <div class="students-empty-icon"><span class="material-symbols-outlined" style="font-size:48px">group_off</span></div>
          <p>No employee profiles found. Add an employee using the button above.</p>
        </div>`;
    } else {
      try {
        employeesContainer.innerHTML = profileList.map((p, i) => {
          try {
            return buildEmployeeCardHTML(p, i);
          } catch (err) {
            console.error('[Employees] Error rendering card for', p.userId, err);
            return '';
          }
        }).join('');
      } catch (err) {
        console.error('[Employees] Critical render error:', err);
        employeesContainer.innerHTML = '<p class="text-danger">Failed to render employees. Check console for details.</p>';
      }
    }

    if (typeof applySearchFilter === 'function') applySearchFilter();
  }

  renderAllCards();

  // ── Toggle card ──
  window.toggleEmpCard = function (uid) {
    const card    = document.getElementById(`card-${uid}`);
    const details = document.getElementById(`details-${uid}`);
    if (!card || !details) return;
    const isExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded', !isExpanded);
    details.setAttribute('aria-hidden', String(isExpanded));
    if (!isExpanded) {
      setTimeout(() => animateNumbers(details), 100);
    }
  };

  function animateNumbers(container) {
    container.querySelectorAll('.count-up').forEach(counter => {
      const target = parseInt(counter.dataset.target);
      if (isNaN(target)) return;
      let count = 0;
      const duration = 1500;
      const startTime = performance.now();
      function update(t) {
        const progress = Math.min((t - startTime) / duration, 1);
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        counter.textContent = Math.floor(ease * target) + '%';
        if (progress < 1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
    });
  }

  // ── Project nav ──
  window.nextEmpProj = function (uid) {
    const projs = Storage.getProjects().filter(p => String(p.userId || p.ownerId) === String(uid));
    if (!projs.length) return;
    const card = document.querySelector(`#details-${uid} .project-progress-card`);
    if (card) card.style.opacity = '0';
    setTimeout(() => {
      projectIndices[uid] = ((projectIndices[uid] || 0) + 1) % projs.length;
      renderAllCards();
    }, 150);
  };

  window.prevEmpProj = function (uid) {
    const projs = Storage.getProjects().filter(p => String(p.userId || p.ownerId) === String(uid));
    if (!projs.length) return;
    const card = document.querySelector(`#details-${uid} .project-progress-card`);
    if (card) card.style.opacity = '0';
    setTimeout(() => {
      const curr = projectIndices[uid] || 0;
      projectIndices[uid] = (curr - 1 + projs.length) % projs.length;
      renderAllCards();
    }, 150);
  };

  // ── Suspend ──
  window.suspendEmployee = async function (uid) {
    const profile = Storage.getProfile(uid);
    if (!profile) return;
    if (!(await IrisModal.confirm(`Are you sure you want to suspend ${profile.name || 'this employee'}?`))) return;
    const daysStr = await IrisModal.prompt(`How many days should ${profile.name || 'this employee'} be suspended?`, '7');
    const days = parseInt(daysStr);
    if (isNaN(days) || days <= 0) { await IrisModal.alert('Please enter a valid number of days.'); return; }
    profile.suspendedUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    Storage.saveProfile(uid, profile);
    renderAllCards();
    await IrisModal.alert(`${profile.name || 'Employee'} has been suspended for ${days} days.`);
  };

  // ── Delete ──
  window.deleteEmployee = async function (uid) {
    const profile = Storage.getProfile(uid);
    if (!profile) return;
    if (!(await IrisModal.confirm(
      `CRITICAL: Delete ${profile.name || 'this employee'}? This cannot be undone.`,
      'Confirm Deletion', true
    ))) return;
    const deleted = await Storage.deleteProfile(uid);
    if (deleted) {
      renderAllCards();
      await IrisModal.alert('Employee profile deleted successfully.');
    } else {
      await IrisModal.alert('Could not delete this employee. Check your connection and try again.');
    }
  };

  function showToast(msg, type = 'success') {
    const tc = document.getElementById('toast-container');
    if (!tc) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    tc.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ── Logout ──
  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

  // ── Verification ──
  window.verifyEmployee = async function (uid) {
    const profile = Storage.getProfile(uid);
    if (!profile) return;
    profile.verified = true;
    try {
      await Storage.saveProfileToFirebase(uid, profile);
      Storage.saveProfile(uid, profile);
      renderAllCards();
    } catch (e) {
      console.error('Verification failed:', e);
    }
  };

  window.unverifyEmployee = async function (uid) {
    const profile = Storage.getProfile(uid);
    if (!profile) return;
    if (!(await IrisModal.confirm(`Are you sure you want to unverify ${profile.name}? They will lose access to their dashboard.`))) return;
    profile.verified = false;
    try {
      await Storage.saveProfileToFirebase(uid, profile);
      Storage.saveProfile(uid, profile);
      renderAllCards();
    } catch (e) {
      console.error('Action failed:', e);
    }
  };

})();
