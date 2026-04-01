/**
 * InternTrack — Projects Showcase Logic
 * Admin: Add/delete projects via modal. Users: view only.
 * Stagger card load, screenshot Base64 upload, permission guard.
 */

'use strict';

(() => {
    const session = Auth.requireAuth();
    if (!session) return;

    // ── Initial Fetch & Sync ──
    // ── Real-Time Cloud Watcher (No more polling!) ──
    const syncPill = document.getElementById('project-count-label');
    if (typeof Storage !== 'undefined' && Storage.watchProjects) {
        Storage.watchProjects((liveProjects) => {
            console.log('[Projects] LIVE SYNC: Got ' + liveProjects.length + ' projects.');
            if (syncPill) {
                syncPill.innerHTML = `${liveProjects.length} project${liveProjects.length !== 1 ? 's' : ''} in cloud portfolio 
                    <span style="font-size:10px; color:var(--clr-success); margin-left:8px">• Live Connection Active</span>`;
            }
            renderProjects();
        });
    }

    // Still sync other data once (users, sessions etc)
    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    const pushBtn = document.getElementById('push-cloud-btn');
    if (pushBtn) {
        pushBtn.addEventListener('click', () => {
            if (!(isUser)) return;
            const myProjects = Storage.getProjects().filter(p => String(p.userId || p.ownerId) === String(session.userId));
            if (myProjects.length === 0) { showToast('No projects to push.', 'info'); return; }
            
            showToast(`Syncing ${myProjects.length} projects...`, 'info');
            Promise.all(myProjects.map(p => {
                // Minor compat fix on fly
                p.userId = p.userId || p.ownerId;
                return Storage.syncProject(p);
            }))
            .then(() => showToast('All projects synced correctly!', 'success'))
            .catch(err => showToast('Some projects failed to push.', 'error'));
        });
    }

    // Manual Refresh button
    const syncBtn = document.getElementById('sync-now-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            syncBtn.classList.add('anim-spin');
            Storage.fetchEverything(true).then(() => {
                setTimeout(() => {
                    syncBtn.classList.remove('anim-spin');
                    showToast('Cloud sync complete!', 'success');
                    renderProjects();
                }, 800);
            });
        });
    }
    
    const isAdmin = session.role === 'admin';
    const isUser = session.role === 'user';

    // SidebarEngine.init() handles badges and banners globally
    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    // ── UI visibility (Add project only for Interns) ──
    if (isUser) {
        document.getElementById('fab-btn').style.display = 'flex';
        document.getElementById('add-btn-top').style.display = 'flex';
        document.getElementById('push-cloud-btn').style.display = 'flex';
        document.getElementById('no-permission-tip').style.display = 'none';
    } else if (isAdmin) {
        document.getElementById('fab-btn').style.display = 'none';
        document.getElementById('add-btn-top').style.display = 'none';
        document.getElementById('no-permission-tip').innerHTML = '⭐ <strong>Reviewer Mode</strong>: You can provide feedback and ratings for intern projects below.';
        document.getElementById('no-permission-tip').style.display = 'block';
    } else {
        document.getElementById('no-permission-tip').style.display = 'block';
    }

    // ── Render projects ──
    const grid = document.getElementById('projects-grid');
    const countLabel = document.getElementById('project-count-label');

    function renderProjects() {
        const urlParams = new URLSearchParams(window.location.search);
        let filterIntern = urlParams.get('intern');

        // Privacy Gate: Interns can ONLY see their own projects
        if (isUser) {
            filterIntern = session.userId;
        }

        let projects = Storage.getProjects() || [];
        
        if (filterIntern) {
            // Tier 2: Individual projects for a specific intern
            projects = projects.filter(p => String(p.userId || p.ownerId) === filterIntern);
            projects.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); // Ascending as requested
            
            const profile = Storage.getProfile(filterIntern);
            const internName = profile?.name || projects[0]?.userName || 'Intern';
            
            if (isUser) {
                countLabel.innerHTML = `Viewing <strong>Your Portfolio</strong>`;
            } else {
                countLabel.innerHTML = `Showing projects for <strong>${internName}</strong> <a href="projects.html" style="margin-left:12px; color:var(--clr-accent); font-size:12px; text-decoration:none;">(Show All Interns)</a>`;
            }
            
            if (projects.length === 0) {
                grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-title">You haven't added any projects yet.</div><button class="btn btn-primary" onclick="document.getElementById('fab-btn').click()">Add First Project</button></div>`;
                return;
            }
            
            grid.innerHTML = projects.map((p, i) => buildCard(p, i)).join('');
            attachCardListeners();
        } else if (isAdmin) {
            // Tier 1: Summary cards per intern (Admin only)
            countLabel.textContent = `Project portfolios from ${new Set(projects.map(p => p.userId || p.ownerId)).size} interns`;
            
            // Group by intern
            const internGroups = {};
            projects.forEach(p => {
                const uid = p.userId || p.ownerId;
                if (!internGroups[uid]) {
                    internGroups[uid] = { projects: [], lastSubmit: 0, uid };
                }
                internGroups[uid].projects.push(p);
                if ((p.createdAt || 0) > internGroups[uid].lastSubmit) {
                    internGroups[uid].lastSubmit = p.createdAt;
                }
            });

            const groups = Object.values(internGroups);
            if (groups.length === 0) {
                grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-title">No intern portfolios yet.</div></div>`;
                return;
            }

            grid.innerHTML = groups.map((g, i) => buildInternGroupCard(g, i)).join('');
        }
    }

    function attachCardListeners() {
        // Attach user card actions (Interns manage their own projects)
        if (isUser) {
            grid.querySelectorAll('[data-delete]').forEach(btn => {
                btn.addEventListener('click', () => handleDelete(btn.dataset.delete, btn.dataset.title));
            });
            grid.querySelectorAll('[data-edit]').forEach(btn => {
                btn.addEventListener('click', () => openModal(btn.dataset.edit));
            });
        }
        // Attach admin edit/delete actions (admins can manage all)
        if (isAdmin) {
            grid.querySelectorAll('[data-admin-delete]').forEach(btn => {
                btn.addEventListener('click', () => handleDelete(btn.dataset.adminDelete, btn.dataset.title));
            });
            grid.querySelectorAll('[data-admin-edit]').forEach(btn => {
                btn.addEventListener('click', () => openModal(btn.dataset.adminEdit));
            });
            grid.querySelectorAll('.star-rating .star').forEach(star => {
                star.addEventListener('click', (e) => {
                    const rating = parseInt(star.dataset.value);
                    const projId = star.closest('.project-card').id;
                    handleRate(projId, rating);
                });
            });
            // Request Redo button
            grid.querySelectorAll('[data-request-redo]').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); requestRedo(btn.dataset.requestRedo); });
            });
        }

        // Attach global discussion handler
        grid.querySelectorAll('[data-discussion]').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); openDiscussion(btn.dataset.discussion); });
        });

        // Resubmit handler for interns
        if (isUser) {
            grid.querySelectorAll('[data-resubmit]').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); handleResubmit(btn.dataset.resubmit); });
            });
        }
    }

    function buildInternGroupCard(g, index) {
        const profile = Storage.getProfile(g.uid);
        const name = profile?.name || g.projects[0]?.userName || 'Unknown Intern';
        const company = profile?.company || 'IRIS Partner';
        const avatar = profile?.avatar || '';
        const count = g.projects.length;
        const lastDate = g.lastSubmit ? new Date(g.lastSubmit).toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        }) : 'No submissions';

        return `
        <article class="project-card anim-reveal" style="cursor:pointer" onclick="window.location.href='projects.html?intern=${g.uid}'">
            <div class="card-img-wrap" style="height:120px; background: linear-gradient(135deg, var(--clr-bg-surface), var(--clr-bg-elevated));">
                <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
                    ${avatar ? `<img src="${avatar}" style="width:60px; height:60px; border-radius:50%; border:2px solid var(--clr-accent)">` : `<span class="material-symbols-outlined" style="font-size:48px; color:var(--clr-text-muted)">person</span>`}
                </div>
                <span class="card-status-badge completed" style="top:10px; right:10px;">${count} Project${count !== 1 ? 's' : ''}</span>
            </div>
            <div class="card-body" style="padding:20px; text-align:center;">
                <h2 class="card-title" style="margin-bottom:4px;">${name}</h2>
                <div style="color:var(--clr-accent); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">${company}</div>
                <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; display:flex; flex-direction:column; gap:4px;">
                    <span style="font-size:10px; color:var(--clr-text-muted); text-transform:uppercase;">Last Activity</span>
                    <span style="font-size:12px; color:var(--clr-text-main); font-weight:500;">${lastDate}</span>
                </div>
            </div>
            <div class="card-footer" style="justify-content:center; padding:15px; border-top:1px solid var(--glass-border);">
                <span style="font-size:12px; color:var(--clr-accent); display:flex; align-items:center; gap:6px;">
                    View Portfolio <span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>
                </span>
            </div>
        </article>`;
    }

    function buildCard(p, index) {
        const delayClass = `anim-d${Math.min(index + 1, 8)}`;
        const displayDate = p.createdAt
            ? new Date(p.createdAt).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '';

        // Resolve owner name: stored on project, or look up from profiles
        let userName = p.userName || p.ownerName || '';
        const userId = p.userId || p.ownerId;
        if (!userName && userId) {
            const ownerProfile = Storage.getProfile(userId);
            userName = ownerProfile ? ownerProfile.name : '';
        }

        return `
      <article class="project-card ${delayClass}" id="${p.id}" aria-label="Project: ${p.title}">
        <div class="card-img-wrap">
          ${p.screenshot
                ? `<img class="card-img" src="${p.screenshot}" alt="${p.title} screenshot" loading="lazy">`
                : `<div class="card-img-placeholder">
                <span class="ph-icon" aria-hidden="true"><span class="material-symbols-outlined" style="font-size: 48px;">folder</span></span>
                <span class="ph-title">${p.techStack?.[0] || 'Project'}</span>
              </div>`}
          ${p.status ? `<span class="card-status-badge ${p.status.toLowerCase().replace(/\s+/g, '-')}">${p.status}</span>` : ''}
          ${displayDate ? `<span class="card-date" style="font-size: 0.65rem; padding: 4px 10px;">Submitted: ${displayDate}</span>` : ''}
          <button class="discussion-btn" data-discussion="${p.id}" title="Project Discussion">
            <span class="material-symbols-outlined">forum</span>
            ${p.comments?.length ? `<span class="comment-count">${p.comments.length}</span>` : ''}
          </button>
        </div>
        <div class="card-body">
          <h2 class="card-title">${p.title}</h2>
          <p class="card-desc">${p.description}</p>
          <div class="card-stack" aria-label="Technologies used">
            ${(p.techStack || []).map(t => `<span class="stack-tag">${t}</span>`).join('')}
          </div>
        </div>
        <div class="card-footer">
          <div class="card-links">
            ${p.githubLink
                ? `<a class="card-link github" href="${p.githubLink}" target="_blank" rel="noopener" aria-label="GitHub for ${p.title}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  GitHub
                </a>`
                : ''}
            ${p.liveLink
                ? `<a class="card-link live" href="${p.liveLink}" target="_blank" rel="noopener" aria-label="${p.liveLinkType === 'Demo' ? 'Demo' : 'Live demo'} for ${p.title}">
                  <span class="material-symbols-outlined" style="font-size: 14px;">open_in_new</span>
                  ${p.liveLinkType === 'Demo' ? 'Demo URL' : 'Live Demo'}
                </a>`
                : ''}
          </div>
          ${isUser ? `
          <div class="card-actions">
            <button class="btn btn-icon btn-sm" data-edit="${p.id}" title="Edit project" aria-label="Edit ${p.title}">
              <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
            </button>
            <button class="btn btn-icon btn-sm" data-delete="${p.id}" data-title="${p.title}" title="Delete project" aria-label="Delete ${p.title}">
              <span class="material-symbols-outlined" style="font-size: 18px; color:var(--clr-danger)">delete</span>
            </button>
          </div>` : isAdmin ? `
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <div class="card-rating-zone" style="flex:1">
              <span class="rating-label">Quality Rating:</span>
              <div class="star-rating" data-id="${p.id}" role="group" aria-label="Project rating">
                  ${[1, 2, 3, 4, 5].map(v => `
                      <span class="star ${p.rating >= v ? 'active' : ''}" 
                            data-value="${v}" 
                            role="button" 
                            tabindex="0"
                            aria-label="Rate ${v} stars"
                            title="Rate ${v} star${v > 1 ? 's' : ''}">${p.rating >= v ? '★' : '☆'}</span>
                  `).join('')}
                  <span class="rating-value-hint">${p.rating ? `${p.rating}/5` : 'Not Rated'}</span>
              </div>
            </div>
            <div style="display:flex; gap:4px; flex-shrink:0;">
              <button class="btn btn-icon btn-sm" data-admin-edit="${p.id}" title="Edit / Reassign" aria-label="Edit ${p.title}">
                <span class="material-symbols-outlined" style="font-size:18px">edit</span>
              </button>
              <button class="btn btn-icon btn-sm" data-request-redo="${p.id}" title="Request Redo / Changes" style="background:rgba(239,68,68,.1); color:var(--clr-danger); border:1px solid rgba(239,68,68,.2);">
                <span class="material-symbols-outlined" style="font-size:18px">assignment_return</span>
              </button>
              <button class="btn btn-icon btn-sm" data-admin-delete="${p.id}" data-title="${p.title}" title="Delete project" aria-label="Delete ${p.title}">
                <span class="material-symbols-outlined" style="font-size:18px; color:var(--clr-danger)">delete</span>
              </button>
            </div>
          </div>` : p.rating ? `
          <div class="card-rating-display">
            <div class="stars active">${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}</div>
          </div>
          ` : ''}
          ${isUser && p.status === 'Changes Requested' ? `
          <button class="btn btn-primary btn-sm btn-resubmit" data-resubmit="${p.id}" style="width:100%; margin-top:12px; gap:8px;">
            <span class="material-symbols-outlined" style="font-size:18px">publish</span>
            Resubmit Project
          </button>
          ` : ''}
        </div>
        <!-- Student owner name -->
        <div class="card-owner" style="background: rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;" aria-label="Project by ${userName || 'Unknown'}">
          ${(() => {
                const ownerProfile = Storage.getProfile(p.userId || p.ownerId);
                const avatar = ownerProfile?.avatar || '';
                return avatar 
                    ? `<img src="${avatar}" style="width:24px; height:24px; border-radius:50%; object-fit:cover; margin-right:8px; border:1px solid var(--clr-primary-alpha)">`
                    : `<span class="card-owner-icon" style="background:var(--clr-primary-alpha); width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:8px;"><span class="material-symbols-outlined" style="font-size: 14px; color:var(--clr-primary)">person</span></span>`;
            })()}
          <div style="display:flex; flex-direction:column;">
            <span class="card-owner-name" style="font-size: 0.85rem; font-weight:600; color:var(--clr-text-main)">${userName || 'Unassigned Intern'}</span>
            <span style="font-size: 0.7rem; color:var(--clr-text-muted); text-transform:uppercase; letter-spacing:0.5px;">Developer</span>
          </div>
        </div>
      </article>`;
    }

    // ── Rating ──
    function handleRate(id, rating) {
        const p = Storage.getProjectById(id);
        if (!p) return;
        p.rating = rating;
        p.userId = p.userId || p.ownerId; // Compat
        const updated = Storage.saveProject(p);
        // Sync rating to Firestore
        if (Storage.syncProject) Storage.syncProject(updated || p);
        showToast(`Project rated ${rating}/5`, 'success');
        renderProjects();
    }

    // ── Delete ──
    async function handleDelete(id, title) {
        if (!(await IrisModal.confirm(`Delete "${title}"? This cannot be undone.`, 'Confirm Deletion', true))) return;
        Storage.deleteProject(id);
        // Sync deletion to Firestore
        if (Storage.deleteProjectFromFirebase) Storage.deleteProjectFromFirebase(id);
        showToast(`"${title}" deleted.`, 'info');
        renderProjects();
    }

    // ── Redo & Resubmit ──
    async function requestRedo(id) {
        if (!(await IrisModal.confirm('Request changes for this project? The intern will be notified to redo the work.', 'Request Changes'))) return;
        const p = Storage.getProjectById(id);
        if (!p) return;
        p.status = 'Changes Requested';
        const updated = Storage.saveProject(p);
        if (Storage.syncProject) Storage.syncProject(updated || p);
        showToast('Changes requested. Project marked for Redo.', 'info');
        renderProjects();
    }

    async function handleResubmit(id) {
        const p = Storage.getProjectById(id);
        if (!p) return;
        p.status = 'Resubmitted';
        const updated = Storage.saveProject(p);
        if (Storage.syncProject) Storage.syncProject(updated || p);
        showToast('Project resubmitted for review!', 'success');
        renderProjects();
    }

    // ── Discussion System ──
    async function openDiscussion(id) {
        const p = Storage.getProjectById(id);
        if (!p) return;

        const profile = Storage.getProfile(session.userId) || {};
        const userName = profile.name || session.displayName || 'User';

        const modalHtml = `
            <div class="discussion-modal">
                <div class="comment-list" id="comment-list-${id}" style="max-height: 400px; overflow-y: auto; margin-bottom: 20px; display: flex; flex-direction: column; gap: 15px;">
                    ${(p.comments || []).length > 0 
                        ? p.comments.map(c => `
                            <div class="comment-item ${c.userId === session.userId ? 'own' : ''}" style="max-width: 85%; align-self: ${c.userId === session.userId ? 'flex-end' : 'flex-start'}">
                                <div style="display:flex; justify-content:space-between; font-size: 10px; color: var(--clr-text-muted); margin-bottom: 4px;">
                                    <strong>${c.name}</strong>
                                    <span>${new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                                <div style="background: ${c.userId === session.userId ? 'var(--clr-primary-alpha)' : 'rgba(255,255,255,0.05)'}; padding: 10px 15px; border-radius: 12px; font-size: 13px; color: var(--clr-text-main); border: 1px solid ${c.userId === session.userId ? 'var(--clr-primary-alpha)' : 'rgba(255,255,255,0.05)'}">
                                    ${c.text}
                                </div>
                            </div>
                        `).join('')
                        : '<div style="text-align:center; color:var(--clr-text-muted); padding: 40px 0;">No comments yet. Start the discussion!</div>'
                    }
                </div>
                <div class="comment-input-area" style="display:flex; gap: 10px; border-top: 1px solid var(--glass-border); padding-top: 20px;">
                    <textarea id="comment-text-${id}" class="field-input" placeholder="Type your comment..." rows="2" style="flex:1; resize:none;"></textarea>
                    <button class="btn btn-primary" id="send-comment-${id}" style="padding: 0 20px;">
                        <span class="material-symbols-outlined">send</span>
                    </button>
                </div>
            </div>
        `;

        const modal = await IrisModal.custom(modalHtml, `Discussion: ${p.title}`, [{ label: 'Close', type: 'secondary' }]);
        
        const sendBtn = document.getElementById(`send-comment-${id}`);
        const input = document.getElementById(`comment-text-${id}`);
        
        sendBtn?.addEventListener('click', async () => {
            const text = input.value.trim();
            if (!text) return;
            
            p.comments = p.comments || [];
            p.comments.push({
                userId: session.userId,
                name: userName,
                text,
                timestamp: Date.now()
            });

            const updated = Storage.saveProject(p);
            if (Storage.syncProject) await Storage.syncProject(updated || p);
            
            // Re-open discussion to refresh
            IrisModal.close();
            openDiscussion(id);
        });
    }

    // ── Modal state ──
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalSave = document.getElementById('modal-save');
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');

    // Form fields
    const projTitle = document.getElementById('proj-title');
    const projDesc = document.getElementById('proj-desc');
    const projGithub = document.getElementById('proj-github');
    const projLive = document.getElementById('proj-live');
    const projOwnerGroup = document.getElementById('proj-owner-group');
    const projOwnerSelect = document.getElementById('proj-owner');
    const stackInput = document.getElementById('proj-stack-input');
    const stackTagsList = document.getElementById('stack-tags-list');
    const screenshotFile = document.getElementById('proj-screenshot');
    const screenshotDrop = document.getElementById('screenshot-drop');
    const screenshotPrev = document.getElementById('screenshot-preview-wrap');
    const screenshotImg = document.getElementById('screenshot-preview-img');
    const screenshotReset = document.getElementById('screenshot-reset');
    const projStatus = document.getElementById('proj-status');

    let stackTags = [];
    let screenshotB64 = '';
    let editingId = null;

    // If admin, populate the owner dropdown with all interns
    if (isAdmin && projOwnerGroup) {
        projOwnerGroup.style.display = 'flex';
        const profiles = Storage.getProfiles();
        const internList = Object.values(profiles);
        if (projOwnerSelect) {
            projOwnerSelect.innerHTML = '<option value="">Select Intern</option>' +
                internList.map(p => `<option value="${p.userId}" data-name="${p.name || ''}">${
                    p.name || p.userId
                }</option>`).join('');
        }
    }

    function resetModal() {
        projTitle.value = '';
        projDesc.value = '';
        projGithub.value = '';
        projLive.value = '';
        if (projOwnerSelect) projOwnerSelect.value = '';
        const linkTypeEl = document.getElementById('proj-link-type');
        if (linkTypeEl) {
            linkTypeEl.value = 'Live';
            linkTypeEl.dispatchEvent(new Event('change'));
        }
        stackTags = [];
        renderStackTags();
        clearScreenshot();
        projStatus.value = 'Ongoing';
        editingId = null;
    }

    function openModal(editId = null) {
        // Both admins and interns (users) can open the modal
        if (!isAdmin && !isUser) { shakeNoPermission(); return; }
        resetModal();

        if (editId) {
            const p = Storage.getProjectById(editId);
            if (!p) return;
            editingId = editId;
            projTitle.value = p.title;
            projDesc.value = p.description;
            projGithub.value = p.githubLink || '';
            projLive.value = p.liveLink || '';
            const linkTypeEl = document.getElementById('proj-link-type');
            if (linkTypeEl) {
                linkTypeEl.value = p.liveLinkType || 'Live';
                linkTypeEl.dispatchEvent(new Event('change'));
            }
            stackTags = [...(p.techStack || [])];
            renderStackTags();
            if (p.screenshot) {
                screenshotB64 = p.screenshot;
                screenshotImg.src = p.screenshot;
                screenshotPrev.style.display = 'block';
                document.getElementById('screenshot-placeholder').style.display = 'none';
            }
            projStatus.value = p.status || 'Ongoing';
            // Pre-select owner if admin editing
            if (isAdmin && projOwnerSelect && p.ownerId) {
                projOwnerSelect.value = p.ownerId;
            }
            modalTitle.textContent = 'Edit Project';
        } else {
            modalTitle.textContent = 'Add New Project';
        }

        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => projTitle.focus(), 200);
    }

    function closeModal() {
        modalOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ── Stack tag input ──
    function renderStackTags() {
        stackTagsList.innerHTML = stackTags.map((t, i) => `
      <span class="tag-chip">
        ${t}
        <button class="tag-chip-remove" data-idx="${i}" aria-label="Remove ${t}" type="button">
          <span class="material-symbols-outlined" style="font-size: 12px;">close</span>
        </button>
      </span>
    `).join('');
        stackTagsList.querySelectorAll('.tag-chip-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                stackTags.splice(parseInt(btn.dataset.idx, 10), 1);
                renderStackTags();
            });
        });
    }

    stackInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const v = stackInput.value.trim().replace(/,$/, '');
            if (v && !stackTags.includes(v)) { stackTags.push(v); renderStackTags(); }
            stackInput.value = '';
        }
        if (e.key === 'Backspace' && !stackInput.value && stackTags.length) {
            stackTags.pop(); renderStackTags();
        }
    });
    stackInput.addEventListener('blur', () => {
        const v = stackInput.value.trim().replace(/,$/, '');
        if (v && !stackTags.includes(v)) { stackTags.push(v); renderStackTags(); }
        stackInput.value = '';
    });
    document.getElementById('stack-wrap').addEventListener('click', () => stackInput.focus());

    // ── Screenshot ──
    function setScreenshot(file) {
        if (!file) return;
        
        // Use a Canvas to downscale image if it's large (Firestore 1MB limit friendly)
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress quality to 70% to stay super low size
                screenshotB64 = canvas.toDataURL('image/jpeg', 0.7);
                screenshotImg.src = screenshotB64;
                screenshotPrev.style.display = 'block';
                document.getElementById('screenshot-placeholder').style.display = 'none';
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
    function clearScreenshot() {
        screenshotB64 = '';
        screenshotImg.src = '';
        screenshotPrev.style.display = 'none';
        document.getElementById('screenshot-placeholder').style.display = 'block';
        screenshotFile.value = '';
    }

    screenshotFile.addEventListener('change', e => setScreenshot(e.target.files[0]));
    screenshotDrop.addEventListener('dragover', e => { e.preventDefault(); screenshotDrop.classList.add('drag-over'); });
    screenshotDrop.addEventListener('dragleave', () => screenshotDrop.classList.remove('drag-over'));
    screenshotDrop.addEventListener('drop', e => {
        e.preventDefault();
        screenshotDrop.classList.remove('drag-over');
        setScreenshot(e.dataTransfer.files[0]);
    });
    screenshotReset.addEventListener('click', clearScreenshot);

    // ── Save ──
    modalSave.addEventListener('click', () => {
        const title = projTitle.value.trim();
        const desc = projDesc.value.trim();

        if (!title) { projTitle.focus(); projTitle.classList.add('anim-shake'); setTimeout(() => projTitle.classList.remove('anim-shake'), 600); showToast('Project title is required.', 'error'); return; }
        if (!desc) { projDesc.focus(); projDesc.classList.add('anim-shake'); setTimeout(() => projDesc.classList.remove('anim-shake'), 600); showToast('Description is required.', 'error'); return; }

        // Determine owner: intern uses their own session; admin picks from dropdown
        let userId, userName;
        if (isUser) {
            userId = session.userId;
            userName = session.displayName || session.name || '';
        } else if (isAdmin) {
            userId = projOwnerSelect ? projOwnerSelect.value : '';
            const selectedOption = projOwnerSelect ? projOwnerSelect.options[projOwnerSelect.selectedIndex] : null;
            userName = selectedOption ? selectedOption.dataset.name : '';
            if (!userId) {
                showToast('Please select a student to assign this project to.', 'error');
                projOwnerSelect && projOwnerSelect.focus();
                return;
            }
        }

        const project = {
            id: editingId || null,
            title,
            description: desc,
            techStack: [...stackTags],
            status: projStatus.value,
            githubLink: projGithub.value.trim() || '',
            liveLink: projLive.value.trim() || '',
            liveLinkType: document.getElementById('proj-link-type') ? document.getElementById('proj-link-type').value : 'Live',
            screenshot: screenshotB64 || '',
            userId: userId || null,
            userName: userName || null,
            createdAt: editingId ? Storage.getProjectById(editingId)?.createdAt : Date.now()
        };

        const saved = Storage.saveProject(project);
        
        // Final Sync to Cloud with Explicit Feedback
        showToast('Syncing to Cloud...', 'info');
        if (Storage.syncProject) {
            Storage.syncProject(saved || project)
                .then(() => {
                    showToast(editingId ? 'Project updated in Cloud!' : 'Project posted to Cloud!', 'success');
                    closeModal();
                    renderProjects();
                })
                .catch(err => {
                    console.error('[Projects] Sync failed:', err);
                    showToast('Failed to sync with Database. Check Rules/Size.', 'error');
                });
        } else {
            closeModal();
            renderProjects();
        }
    });

    // ── Modal events ──
    [modalClose, modalCancel].forEach(el => el.addEventListener('click', closeModal));
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal(); });

    // Open modal buttons
    document.getElementById('fab-btn').addEventListener('click', () => openModal());
    document.getElementById('add-btn-top').addEventListener('click', () => openModal());

    // ── Permission denied (shake for non-admins clicking protected areas) ──
    function shakeNoPermission() {
        const tip = document.getElementById('no-permission-tip');
        tip.classList.remove('anim-shake');
        void tip.offsetWidth;
        tip.classList.add('anim-shake');
        setTimeout(() => tip.classList.remove('anim-shake'), 600);
    }

    // ── Init render ──
    renderProjects();

    // ── Hash-based scroll & highlight (from students page links) ──
    function handleHashHighlight() {
        const hash = window.location.hash.slice(1); // e.g. "proj_1"
        if (!hash) return;
        const target = document.getElementById(hash);
        if (!target) return;
        // Smooth scroll after a short delay so cards have rendered
        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('card-highlight');
            setTimeout(() => target.classList.remove('card-highlight'), 2200);
        }, 350);
    }
    handleHashHighlight();

    // ── Toast ──
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const icons = { success: 'check_circle', error: 'error', info: 'info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon material-symbols-outlined" aria-hidden="true">${icons[type] || 'info'}</span><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'all .3s ease';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 350);
        }, 3200);
    }

    // ── Cleanup ──
    // Sidebar logic is handled by sidebar-engine.js

})();
