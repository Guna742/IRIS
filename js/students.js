/**
 * I.R.I.S — Students Page Logic
 * Shows all intern student cards with expandable details.
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
  const sidebarNav = document.getElementById('sidebar-nav');
  const userAvatarSb = document.getElementById('user-avatar-sidebar');
  const userNameSb = document.getElementById('user-name-sidebar');
  const userRoleSb = document.getElementById('user-role-sidebar');
  const welcome = document.getElementById('welcome-title');
  const welcomeSub = document.getElementById('welcome-sub');
  const roleBanner = document.getElementById('role-banner');
  const roleBadgeMain = document.getElementById('role-badge-main');
  const topbarRoleBadge = document.getElementById('topbar-role-badge');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const appSidebar = document.getElementById('app-sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const logoutBtn = document.getElementById('logout-btn');
  const studentsContainer = document.getElementById('students-container');
  const studentsCountEl = document.getElementById('students-count');
  const projectIndices = {}; // Track current project index per student

  welcome.textContent = `Intern Directory`;
  welcomeSub.textContent = 'Review intern profiles, performance metrics, and project contributions.';

  // ── Global Search Filter ──
  const applySearchFilter = function () {
    const searchInput = document.getElementById('student-search-input');
    if (!searchInput) return;
    const term = searchInput.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.student-card');
    let visibleCount = 0;

    cards.forEach(card => {
      // Robust search: check both name and other content
      const nameEl = card.querySelector('.student-name');
      const roleEl = card.querySelector('.student-role-tag');
      const fullName = nameEl ? nameEl.textContent.toLowerCase() : '';
      const fullRole = roleEl ? roleEl.textContent.toLowerCase() : '';
      const cardAllText = card.textContent.toLowerCase();

      if (fullName.includes(term) || fullRole.includes(term) || cardAllText.includes(term)) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    // Update count display
    const countEl = document.getElementById('students-count');
    if (countEl) {
      countEl.textContent = `${visibleCount} intern${visibleCount !== 1 ? 's' : ''}`;
    }
    console.log(`[I.R.I.S Search] Filtered: ${visibleCount} visible.`);
  };
  window.applySearchFilter = applySearchFilter;

  function bindSearch() {
    const searchInput = document.getElementById('student-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', applySearchFilter);
      searchInput.addEventListener('keyup', applySearchFilter);
      searchInput.addEventListener('change', applySearchFilter); // Add change as well

      // Auto-filter on load in case of browser cache
      if (searchInput.value) applySearchFilter();
      console.log("[I.R.I.S Search] Input listeners bound (input, keyup, change).");
    }
  }

  // Bind search on load
  bindSearch();

  // ── Helpers ──
  function getProjectsForStudent(profile) {
    if (!profile || !profile.userId) return [];
    // Always read fresh from Storage so live Firestore data is used
    return Storage.getProjects().filter(p => String(p.userId || p.ownerId) === String(profile.userId));
  }

  // ── Loading skeleton shown before Firestore responds ──
  function showLoadingSkeleton() {
    studentsContainer.innerHTML = `
      <div class="students-loading" style="display:flex;flex-direction:column;gap:12px;padding:8px 0">
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
    studentsCountEl.textContent = 'Loading...';
  }

  // Show skeleton while Firestore loads
  showLoadingSkeleton();

  // ── Live Firestore sync → re-render ──
  // The iris-data-sync event is dispatched by storage.js onSnapshot listeners
  window.addEventListener('iris-data-sync', (e) => {
    if (e.detail && (e.detail.type === 'users' || e.detail.type === 'projects')) {
      const freshProfiles = Object.values(Storage.getProfiles());
      studentsCountEl.textContent = `${freshProfiles.length} intern${freshProfiles.length !== 1 ? 's' : ''}`;
      renderAllCards();
      bindSearch(); // Re-bind search after re-render
      console.log('[Students] Re-rendered from live Firestore update:', e.detail.type);
    }
  });

  // ── Immediate render from localStorage cache (fallback if already synced) ──
  const cachedProfiles = Object.values(Storage.getProfiles());
  if (cachedProfiles.length > 0) {
    studentsCountEl.textContent = `${cachedProfiles.length} intern${cachedProfiles.length !== 1 ? 's' : ''}`;
    renderAllCards();
  }

  // ── Render cards ──
  function renderAllCards() {
    const profileList = Object.values(Storage.getProfiles());

    // Always keep the count badge in sync
    studentsCountEl.textContent = `${profileList.length} user${profileList.length !== 1 ? 's' : ''}`;

    if (profileList.length === 0) {
      studentsContainer.innerHTML = `
        <div class="students-empty">
          <div class="students-empty-icon"><span class="material-symbols-outlined" style="font-size: 48px;">group_off</span></div>
          <p>No intern profiles found. Add an intern using the button above.</p>
        </div>`;
    } else {
      studentsContainer.innerHTML = profileList.map((profile, i) => buildStudentCardHTML(profile, i)).join('');
    }

    // Apply search filter if active
    if (typeof applySearchFilter === 'function') {
      applySearchFilter();
    }
  }

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

  function buildStudentCardHTML(profile, i) {
    const { completion: progress, score, rating } = Storage.getProfileMetrics(profile);
    const projects = getProjectsForStudent(profile);
    const scoreDeg = Math.round((score / 100) * 360);
    const initial = (profile.name || profile.userId || '?')[0].toUpperCase();
    const hasPic = !!profile.avatar;
    const now = Date.now();
    const isSuspended = profile.suspendedUntil && profile.suspendedUntil > now;

    return `
      <div class="student-card anim-fadeInUp ${projectIndices[profile.userId] !== undefined ? 'expanded' : ''} ${isSuspended ? 'suspended' : ''}" 
           style="animation-delay: ${i * 80}ms" id="card-${profile.userId}" data-uid="${profile.userId}">
        <!-- Summary row -->
        <div class="student-summary" role="button" tabindex="0" aria-expanded="false" aria-controls="details-${profile.userId}"
             onclick="toggleCard('${profile.userId}')">

          <!-- Avatar -->
          <div class="student-avatar" aria-hidden="true">
            ${hasPic ? `<img src="${profile.avatar}" alt="${profile.name}">` : `<span class="student-avatar-initials">${initial}</span>`}
          </div>

          <!-- Name + role -->
          <div class="student-identity">
            <div class="student-name">
              ${profile.name || 'Unnamed Technical Intern'}
              ${Storage.getInternRank ? (() => {
        const rank = Storage.getInternRank(profile.userId);
        return rank ? `<span class="intern-rank-badge">#${rank}</span>` : '';
      })() : ''}
            </div>
            <div class="student-role-tag">${profile.internship?.role || 'Technical Intern'} ${profile.internship?.company ? '@ ' + profile.internship.company : ''}</div>
          </div>

          ${isSuspended ? `<div class="suspended-badge">Suspended</div>` : ''}

          <!-- Star Rating -->
          <div class="student-rating" aria-label="Rating ${rating} out of 5">
            <div class="stars">${renderStars(parseFloat(rating))}</div>
            <span class="rating-value">${rating}</span>
          </div>

          <!-- Score ring -->
          <div class="student-score" aria-label="Overall score ${score}">
            <div class="score-ring" style="--score-deg: ${scoreDeg}deg">
              <span class="score-num">${score}%</span>
            </div>
          </div>

          <!-- Expand arrow -->
          <button class="expand-btn" aria-label="Expand student details" tabindex="-1">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <!-- Expanded details panel -->
        <div class="student-details" id="details-${profile.userId}" ${projectIndices[profile.userId] !== undefined ? '' : 'aria-hidden="true"'}>
          <div class="student-details-inner">
            <div class="student-details-body">

              <!-- Left Column -->
              <div class="detail-column">
                <div class="detail-group">
                  <div class="detail-section-title">Profile Info</div>
                  <div class="meta-badges-vertical">
                    ${profile.location ? `
                    <div class="hero-meta-item">
                      <span class="material-symbols-outlined" style="font-size:16px; color:var(--clr-accent)">location_on</span>
                      <span class="meta-text">${profile.location}</span>
                    </div>` : ''}
                    ${profile.email ? `
                    <div class="hero-meta-item">
                      <span class="material-symbols-outlined" style="font-size:16px; color:var(--clr-accent)">mail</span>
                      <span class="meta-text">${profile.email}</span>
                    </div>` : ''}
                    ${profile.socialLinks?.github ? `
                    <a class="hero-meta-item clickable" href="${profile.socialLinks.github}" target="_blank">
                      <span class="material-symbols-outlined" style="font-size:16px; color:var(--clr-accent)">link</span>
                      <span class="meta-text">GitHub Profile</span>
                    </a>` : ''}
                    ${profile.socialLinks?.linkedin ? `
                    <a class="hero-meta-item clickable" href="${profile.socialLinks.linkedin}" target="_blank">
                      <span class="material-symbols-outlined" style="font-size:16px; color:var(--clr-accent)">work</span>
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
                      <div class="progress-fill" style="width:${progress}%"></div>
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
                      <div class="progress-fill" style="width:${score}%"></div>
                    </div>
                  </div>
                </div>

                <div class="detail-group">
                  <div class="detail-section-title">Task Rating</div>
                  <div class="rating-display-row">
                    <span class="rating-label">Average Rating</span>
                    <div class="student-rating">
                      <div class="stars">${renderStars(parseFloat(rating))}</div>
                      <span class="rating-value">${rating} / 5</span>
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
                      <button class="nav-arrow nav-arrow-sm" onclick="event.stopPropagation(); prevAdminProj('${profile.userId}')" title="Previous Project">
                        <span class="material-symbols-outlined" style="font-size:16px;">chevron_left</span>
                      </button>
                      <span class="project-counter">${(projectIndices[profile.userId] || 0) + 1} / ${projects.length}</span>
                      <button class="nav-arrow nav-arrow-sm" onclick="event.stopPropagation(); nextAdminProj('${profile.userId}')" title="Next Project">
                        <span class="material-symbols-outlined" style="font-size:16px;">chevron_right</span>
                      </button>
                    </div>` : ''}
                  </div>
                  ${projects.length > 0 ? (() => {
        const idx = projectIndices[profile.userId] || 0;
        const curr = projects[idx];
        const updates = curr.updates || [];

        function formatDate(d) {
          if (!d) return '—';
          return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        }

        return `
                    <div class="project-progress-card admin-view">
                      <div class="pp-header">
                        <div>
                          <div class="pp-title">${curr.title}</div>
                          <div class="pp-status-row">
                            <span class="pp-status-badge ${(curr.status || 'Ongoing').toLowerCase()}">${curr.status || 'Ongoing'}</span>
                            <span class="pp-date">Started ${formatDate(curr.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div class="pp-updates-list">
                        ${updates.length > 0 ? updates.map(u => `
                          <div class="pp-update-item">
                            <div class="pp-update-dot"></div>
                            <div class="pp-update-content">
                              <div class="pp-update-time">${formatDate(u.date)}</div>
                              <div class="pp-update-text">${u.text}</div>
                            </div>
                          </div>`).join('') : '<div class="text-dim text-xs">No progress updates.</div>'}
                      </div>
                    </div>`;
      })() : '<div class="text-dim text-xs">No active projects.</div>'}
                </div>

                <!-- Missed Report Requests -->
                <div class="detail-group" style="margin-top:20px">
                    <div class="detail-section-title">Missed Report Requests</div>
                    <div id="missed-requests-${profile.userId}">
                        ${(() => {
                            const requests = Storage.getMissedReportRequests(profile.userId);
                            const pending = requests.filter(r => r.status === 'pending');
                            if (pending.length === 0) return '<div class="text-dim text-xs">No pending requests.</div>';
                            
                            return pending.map(r => `
                                <div class="missed-request-item" style="background:rgba(255,255,255,0.03); padding:12px; border-radius:12px; border:1px solid var(--clr-border); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center">
                                    <div>
                                        <div style="font-size:0.85rem; font-weight:600">Update ${r.window === 1 ? '1 (10AM-2PM)' : '2 (2PM-6PM)'}</div>
                                        <div style="font-size:0.75rem; color:var(--clr-text-muted)">Requested: ${new Date(r.createdAt).toLocaleTimeString()}</div>
                                    </div>
                                    <div style="display:flex; gap:8px">
                                        <button onclick="event.stopPropagation(); approveMissedRequest('${profile.userId}', '${r.id}')" class="btn btn-success btn-xs" title="Approve">
                                            <span class="material-symbols-outlined" style="font-size:16px">check</span>
                                        </button>
                                        <button onclick="event.stopPropagation(); rejectMissedRequest('${profile.userId}', '${r.id}')" class="btn btn-danger btn-xs" title="Reject">
                                            <span class="material-symbols-outlined" style="font-size:16px">close</span>
                                        </button>
                                    </div>
                                </div>
                            `).join('');
                        })()}
                    </div>
                </div>
              </div>

              <!-- Footer Actions -->
              <div class="detail-edit-row">
                <div class="detail-actions-left">
                  <button onclick="event.stopPropagation(); suspendStudent('${profile.userId}')" class="btn btn-warning btn-sm btn-magnetic">
                    <span class="material-symbols-outlined" style="font-size: 16px;">block</span> Suspend
                  </button>
                  <button onclick="event.stopPropagation(); deleteStudent('${profile.userId}')" class="btn btn-danger btn-sm btn-magnetic">
                    <span class="material-symbols-outlined" style="font-size: 16px;">delete</span> Delete
                  </button>
                </div>
                <div class="detail-actions-right">
                  <a href="profile-builder.html?student=${profile.userId}" class="btn btn-secondary btn-sm btn-magnetic">
                    <span class="material-symbols-outlined" style="font-size: 16px;">edit</span> Edit Profile
                  </a>
                  <a href="student-analytics.html?student=${profile.userId}" class="btn btn-primary btn-sm btn-magnetic">
                    <span class="material-symbols-outlined" style="font-size: 16px;">analytics</span> Analytics
                  </a>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>`;
  }

  renderAllCards();

  // ── Toggle expand/collapse ──
  window.toggleCard = function (uid) {
    const card = document.getElementById(`card-${uid}`);
    const details = document.getElementById(`details-${uid}`);

    const isExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded', !isExpanded);
    details.setAttribute('aria-hidden', String(isExpanded));

    if (!isExpanded) {
      // Trigger count-up animation for scores when opening
      setTimeout(() => {
        animateNumbers(details);
      }, 100);
    }
  };

  /**
   * Animates numbers from 0 to target
   */
  function animateNumbers(container) {
    const counters = container.querySelectorAll('.count-up');
    counters.forEach(counter => {
      const target = parseInt(counter.dataset.target);
      if (isNaN(target)) return;

      let count = 0;
      const duration = 1500; // 1.5s
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out exponential
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        count = Math.floor(easeProgress * target);

        counter.textContent = count + (counter.dataset.suffix || '%');

        if (progress < 1) {
          requestAnimationFrame(update);
        }
      }
      requestAnimationFrame(update);
    });
  }

  window.nextAdminProj = function (uid) {
    const studentProjects = Storage.getProjects().filter(p => String(p.userId || p.ownerId) === String(uid));
    if (!studentProjects.length) return;

    // Animate current project out
    const cardContent = document.querySelector(`#details-${uid} .project-progress-card`);
    if (cardContent) cardContent.style.opacity = '0';

    setTimeout(() => {
      projectIndices[uid] = ((projectIndices[uid] || 0) + 1) % studentProjects.length;
      renderAllCards();

      // Finalize will re-render, so we need to ensure the new one fades in
      // renderAllCards() will recreate the element, so we'll need a way to track it or just let the re-render handle it
    }, 150);
  };

  window.prevAdminProj = function (uid) {
    const studentProjects = Storage.getProjects().filter(p => p.ownerId === uid);
    if (!studentProjects.length) return;

    const cardContent = document.querySelector(`#details-${uid} .project-progress-card`);
    if (cardContent) cardContent.style.opacity = '0';

    setTimeout(() => {
      const curr = projectIndices[uid] || 0;
      projectIndices[uid] = (curr - 1 + studentProjects.length) % studentProjects.length;
      renderAllCards();
    }, 150);
  };

  window.suspendStudent = async function (uid) {
    const profile = Storage.getProfile(uid);
    if (!profile) return;

    const confirmMsg = `Are you sure you want to suspend ${profile.name || 'this intern'}?`;
    if (!(await IrisModal.confirm(confirmMsg))) return;

    const daysStr = await IrisModal.prompt(`How many days should ${profile.name || 'this intern'} be suspended?`, "7");
    const days = parseInt(daysStr);

    if (isNaN(days) || days <= 0) {
      await IrisModal.alert("Please enter a valid number of days.");
      return;
    }

    const suspendedUntil = Date.now() + (days * 24 * 60 * 60 * 1000);
    profile.suspendedUntil = suspendedUntil;
    Storage.saveProfile(uid, profile);

    renderAllCards();
    await IrisModal.alert(`${profile.name || 'Intern'} has been suspended for ${days} days.`);
  };

  window.deleteStudent = async function (uid) {
    const profile = Storage.getProfile(uid);
    if (!profile) return;

    const confirmMsg = `CRITICAL: Are you sure you want to DELETE ${profile.name || 'this intern'}? This action cannot be undone and will remove all their projects.`;
    if (!(await IrisModal.confirm(confirmMsg, 'Confirm Deletion', true))) return;

    const deleted = await Storage.deleteProfile(uid);
    if (deleted) {
      renderAllCards();
      // Update count
      const profiles = Storage.getProfiles();
      const count = Object.keys(profiles).length;
      studentsCountEl.textContent = `${count} intern${count !== 1 ? 's' : ''}`;
      await IrisModal.alert("Intern profile deleted successfully.");
    } else {
      renderAllCards();
      await IrisModal.alert("Could not delete this intern from the database. Check the error message and your connection, then try again.");
    }
  };

  // ── Missed Report Handlers ──
  window.approveMissedRequest = async function(uid, requestId) {
    if (!(await IrisModal.confirm("Approve this missed report request?"))) return;
    
    if (Storage.updateMissedReportRequestStatus(uid, requestId, 'approved')) {
        renderAllCards(); // Re-render to show updated state
        showToast("Request approved. Intern can now submit.");
    }
  };

  window.rejectMissedRequest = async function(uid, requestId) {
    if (!(await IrisModal.confirm("Reject this missed report request?"))) return;
    
    if (Storage.updateMissedReportRequestStatus(uid, requestId, 'rejected')) {
        renderAllCards();
        showToast("Request rejected.", "info");
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

  // Keyboard support
  document.querySelectorAll('.student-summary').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });


  // ── Logout ──
  logoutBtn.addEventListener('click', () => Auth.logout());

  // SidebarEngine.init() is called automatically by sidebar-engine.js

})();
