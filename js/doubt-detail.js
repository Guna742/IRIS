/**
 * I.R.I.S — Doubt Detail Page Logic (Role-Gated)
 * UPDATED: Intern-only "Mark Resolved" + Query Fix
 */

'use strict';

(() => {
    // ── Auth Guard ──
    const session = Auth.requireAuth();
    if (!session) return;

    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    const isAdmin = session.role === 'admin';

    // ── Parse question ID ──
    const params     = new URLSearchParams(window.location.search);
    const questionId = params.get('id');
    if (!questionId) { window.location.replace('doubts.html'); return; }

    // ── Performance Check ──
    // Refresh badges on load to ensure Top Ranked / Project Star are active
    if (!isAdmin) {
        BadgeEngine.refreshBadges(session.userId);
    }

    // ── DOM refs ──
    const sidebarNav        = document.getElementById('sidebar-nav');
    const userAvatarSb      = document.getElementById('user-avatar-sidebar');
    const userNameSb        = document.getElementById('user-name-sidebar');
    const userRoleSb        = document.getElementById('user-role-sidebar');
    const topbarBadge       = document.getElementById('topbar-role-badge');
    const logoutBtn         = document.getElementById('logout-btn');
    const hamburgerBtn      = document.getElementById('hamburger-btn');
    const appSidebar        = document.getElementById('app-sidebar');
    const sidebarOverlay    = document.getElementById('sidebar-overlay');
    const questionSection   = document.getElementById('question-section');
    const answersSection    = document.getElementById('answers-section');
    const answersList       = document.getElementById('answers-list');
    const answersCountBadge = document.getElementById('answers-count-badge');
    const postAnswerSection = document.getElementById('post-answer-section');
    const answerForm        = document.getElementById('answer-form');
    const answerInput       = document.getElementById('answer-input');
    const postAnswerBtn     = document.getElementById('post-answer-btn');
    const backBtn           = document.getElementById('back-btn');
    const lightbox          = document.getElementById('lightbox');
    const lightboxImg       = document.getElementById('lightbox-img');

    // ── Role-based UI ──
    if (!isAdmin && postAnswerSection) {
        postAnswerSection.style.display = 'none';
    }

    // ── Populate sidebar ──
    const profile = isAdmin
        ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null)
        : Storage.getProfile(session.userId);
    const currentName = profile?.name || session.displayName;

    if (userAvatarSb) userAvatarSb.textContent = currentName[0].toUpperCase();
    if (userNameSb)   userNameSb.textContent = currentName;
    if (userRoleSb)   userRoleSb.textContent = isAdmin ? 'Administrator' : 'Intern';
    if (topbarBadge) {
        topbarBadge.textContent = isAdmin ? 'Admin' : 'Intern';
        topbarBadge.className   = `badge ${isAdmin ? 'badge-admin' : 'badge-user'}`;
    }

    // ── Build Sidebar Nav ──
    const NAV_INTERN = [
        { label: 'Dashboard',    href: 'dashboard.html',    icon: 'grid_view' },
        { label: 'My Profile',   href: 'student-profile.html', icon: 'person' },
        { label: 'Leaderboard',  href: 'leaderboard.html',  icon: 'leaderboard' },
        { label: 'My Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics' },
        { label: 'Projects',     href: 'projects.html',     icon: 'folder' },
        { label: 'Doubts',       href: 'doubts.html',       icon: 'help_center', active: true },
    ];
    const NAV_ADMIN = [
        { label: 'Dashboard',    href: 'dashboard.html',    icon: 'grid_view' },
        { label: 'My Profile',   href: 'admin-profile.html', icon: 'person' },
        { label: 'Interns',      href: 'students.html',     icon: 'group' },
        { label: 'Projects',     href: 'projects.html',     icon: 'folder' },
        { label: 'Doubts',       href: 'doubts.html',       icon: 'help_center', active: true },
    ];
    const navItems = isAdmin ? NAV_ADMIN : NAV_INTERN;
    if (sidebarNav) {
        sidebarNav.innerHTML = '<div class="nav-section-label">Menu</div>' +
            navItems.map(item => `
                <a class="nav-item${item.active ? ' active' : ''}" href="${item.href}"
                   aria-current="${item.active ? 'page' : 'false'}">
                    <span class="nav-icon" aria-hidden="true">
                        <span class="material-symbols-outlined">${item.icon}</span>
                    </span>
                    <span>${item.label}</span>
                </a>`).join('');
    }

    // ── Mobile Sidebar ──
    if (hamburgerBtn && appSidebar && sidebarOverlay) {
        hamburgerBtn.addEventListener('click', () => {
            const open = appSidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('visible', open);
            hamburgerBtn.setAttribute('aria-expanded', String(open));
        });
        sidebarOverlay.addEventListener('click', () => {
            appSidebar.classList.remove('open');
            sidebarOverlay.classList.remove('visible');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
        });
    }

    logoutBtn?.addEventListener('click', () => Auth.logout());
    backBtn?.addEventListener('click', () => window.location.href = 'doubts.html');

    // ── Toast ──
    function showToast(msg, type = 'info') {
        const tc = document.getElementById('toast-container');
        if (!tc) return;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
        t.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">${icon}</span><span>${msg}</span>`;
        tc.appendChild(t);
        setTimeout(() => { t.classList.add('exiting'); setTimeout(() => t.remove(), 350); }, 3500);
    }

    // ── Listen to Question ──
    fbDb.collection('questions').doc(questionId).onSnapshot(async snap => {
        if (!snap.exists) {
            questionSection.innerHTML = `<p class="text-muted">Question not found.</p>`;
            return;
        }
        const q = { id: snap.id, ...snap.data() };
        renderQuestion(q);
        answersSection.hidden = false;
        if (isAdmin) postAnswerSection.hidden = false;
    });

    // ── Render Question ──
    function renderQuestion(q) {
        const isOwner    = q.userId === session.userId;
        const isResolved = q.status === 'resolved';
        const votes      = q.votes || 0;
        const views      = q.views || 0;
        const time       = formatTime(q.createdAt);
        const authorInit = (q.authorName || 'I')[0].toUpperCase();

        const hasVoted   = (q.votedBy || []).includes(session.userId);

        questionSection.innerHTML = `
            <div class="question-card">
                <div class="question-layout">
                    <div class="vote-sidebar">
                        <button class="vote-btn ${hasVoted ? 'voted' : ''}" id="question-vote-btn" 
                                ${hasVoted ? 'disabled' : ''} title="${hasVoted ? 'You already upvoted' : 'Upvote Question'}">
                            <span class="material-symbols-outlined">thumb_up</span>
                        </button>
                        <div class="vote-count">${votes}</div>
                        <div class="vote-label">votes</div>
                    </div>

                    <div class="question-content">
                        <h1 class="question-title">${escHtml(q.title)}</h1>
                        ${q.imageUrl ? `<img class="question-image" src="${q.imageUrl}" id="q-img" style="cursor:pointer">` : ''}
                        <p class="question-body">${escHtml(q.description || '')}</p>

                        <div class="question-footer">
                            <div class="question-author">
                                <div class="author-avatar-sm">${authorInit}</div>
                                <div class="author-info">
                                    <div class="author-name">${escHtml(q.authorName || 'Intern')}</div>
                                    <div class="author-time">Asked ${time}</div>
                                </div>
                            </div>
                            <div class="question-actions">
                                <div class="views-info">
                                    <span class="material-symbols-outlined">visibility</span>
                                    ${views} views
                                </div>
                                <span class="status-badge ${isResolved ? 'resolved' : 'open'}">
                                    ${isResolved ? 'Resolved' : 'Open'}
                                </span>
                                <!-- ONLY show toggle to the intern who asked -->
                                ${isOwner ? `
                                <button class="status-toggle-btn" id="status-toggle-btn">
                                    <span class="material-symbols-outlined" style="font-size:14px">
                                        ${isResolved ? 'undo' : 'check_circle'}
                                    </span>
                                    ${isResolved ? 'Reopen' : 'Mark Resolved'}
                                </button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('status-toggle-btn')?.addEventListener('click', async () => {
            const newStatus = isResolved ? 'open' : 'resolved';
            await fbDb.collection('questions').doc(questionId).update({ status: newStatus });
            showToast(`Doubt marked as ${newStatus}.`, 'success');
        });

        document.getElementById('question-vote-btn')?.addEventListener('click', async (e) => {
            if (hasVoted) return;
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
                await fbDb.collection('questions').doc(questionId).update({
                    votes: firebase.firestore.FieldValue.increment(1),
                    votedBy: firebase.firestore.FieldValue.arrayUnion(session.userId)
                });
                showToast('Question upvoted!', 'success');
            } catch (err) {
                console.error('[DoubtDetail] Vote error:', err);
                btn.disabled = false;
            }
        });

        document.getElementById('q-img')?.addEventListener('click', () => {
            lightboxImg.src = q.imageUrl;
            lightbox.classList.add('open');
        });
    }

    // ── Listen to Answers (SIMPLIFIED QUERY to avoid Index requirement) ──
    fbDb.collection('answers')
        .where('questionId', '==', questionId)
        .onSnapshot(snap => {
            const answers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort manually to avoid Firestore manual index requirement
            answers.sort((a, b) => (b.votes || 0) - (a.votes || 0));
            
            if (answersCountBadge) answersCountBadge.textContent = answers.length;
            renderAnswers(answers);
        });

    // ── Render Answers ──
    function renderAnswers(answers) {
        if (answers.length === 0) {
            answersList.innerHTML = `<p class="text-muted" style="padding:2rem;text-align:center">No answers yet. The admin will respond soon.</p>`;
            return;
        }

        answersList.innerHTML = answers.map(ans => {
            const authorInit = (ans.authorName || 'A')[0].toUpperCase();
            const hasVotedAns = (ans.votedBy || []).includes(session.userId);

            return `
            <div class="answer-card">
                <div class="answer-vote-col">
                    <button class="vote-btn sm ${hasVotedAns ? 'voted' : ''}" 
                            data-aid="${ans.id}" ${hasVotedAns ? 'disabled' : ''} 
                            title="${hasVotedAns ? 'You already upvoted' : 'Upvote Answer'}">
                        <span class="material-symbols-outlined" style="font-size:18px">thumb_up</span>
                    </button>
                    <div class="answer-vote-count">${ans.votes || 0}</div>
                    <div class="vote-label">votes</div>
                </div>
                <div class="answer-body-col">
                    <div class="answer-text">${escHtml(ans.answer || '')}</div>
                    <div class="answer-footer">
                        <div class="question-author">
                            <div class="author-avatar-sm" style="background:linear-gradient(135deg,var(--clr-accent),var(--clr-indigo))">${authorInit}</div>
                            <div class="author-info">
                                <div class="author-name">
                                    ${escHtml(ans.authorName || 'Admin')}
                                    <span style="display:inline-block;margin-left:6px;font-size:10px;padding:1px 8px;border-radius:var(--radius-full);background:rgba(139,92,246,.15);color:var(--clr-accent);border:1px solid rgba(139,92,246,.2)">Admin</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Attach vote listeners to answer buttons
        answersList.querySelectorAll('.vote-btn[data-aid]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const aid = btn.dataset.aid;
                const ans = answers.find(a => a.id === aid);
                if (!ans || (ans.votedBy || []).includes(session.userId)) return;

                btn.disabled = true;
                try {
                    await fbDb.collection('answers').doc(aid).update({
                        votes: firebase.firestore.FieldValue.increment(1),
                        votedBy: firebase.firestore.FieldValue.arrayUnion(session.userId)
                    });

                    // Award points to the answer author
                    if (ans.userId) {
                        const { newBadges } = await BadgeEngine.awardAction(ans.userId, 'upvote_received');
                        if (newBadges.length > 0) {
                            console.log(`[DoubtDetail] Answer author awarded badges:`, newBadges);
                        }
                    }
                    showToast('Answer upvoted!', 'success');
                } catch (err) {
                    console.error('[DoubtDetail] Answer vote error:', err);
                    btn.disabled = false;
                }
            });
        });
    }

    // ── Post Answer (ADMIN ONLY) ──
    if (isAdmin) {
        answerForm?.addEventListener('submit', async e => {
            e.preventDefault();
            const text = answerInput?.value.trim();
            if (!text) return;

            postAnswerBtn.disabled = true;
            try {
                await fbDb.collection('answers').add({
                    questionId, userId: session.userId, authorName: currentName,
                    answer: text, votes: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                answerInput.value = '';
                showToast('Answer posted!', 'success');
            } catch (err) {
                showToast('Failed to post answer.', 'error');
            } finally {
                postAnswerBtn.disabled = false;
            }
        });
    }

    // ── Utils ──
    function escHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function formatTime(ts) { 
        if(!ts) return 'just now';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    lightbox?.addEventListener('click', () => lightbox.classList.remove('open'));

})();
