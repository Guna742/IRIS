/**
 * I.R.I.S — Doubt Detail Page Logic (V12 FULL)
 * Features: Shimmer removal, Accepted Answer, Voting, Points, Views.
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
    const loadingShimmer    = document.getElementById('profile-loading');

    // ── Global State ──
    let currentQ = null;

    // ── Populate sidebar ──
    const profile = isAdmin ? null : Storage.getProfile(session.userId);
    const currentName = profile?.name || session.displayName || 'Intern';

    if (userAvatarSb) userAvatarSb.textContent = currentName[0].toUpperCase();
    if (userNameSb)   userNameSb.textContent = currentName;
    if (userRoleSb)   userRoleSb.textContent = isAdmin ? 'Administrator' : 'Intern';
    if (topbarBadge) {
        topbarBadge.textContent = isAdmin ? 'Admin' : 'Intern';
        topbarBadge.className   = `badge ${isAdmin ? 'badge-admin' : 'badge-user'}`;
    }

    // ── Sidebar Nav ──
    const navItems = isAdmin ? [
        { label: 'Dashboard',    href: 'dashboard.html',    icon: 'grid_view' },
        { label: 'My Profile',   href: 'admin-profile.html', icon: 'person' },
        { label: 'Interns',      href: 'students.html',     icon: 'group' },
        { label: 'Projects',     href: 'projects.html',     icon: 'folder' },
        { label: 'Doubts',       href: 'doubts.html',       icon: 'help_center', active: true },
    ] : [
        { label: 'Dashboard',    href: 'dashboard.html',    icon: 'grid_view' },
        { label: 'My Profile',   href: 'student-profile.html', icon: 'person' },
        { label: 'Leaderboard',  href: 'leaderboard.html',  icon: 'leaderboard' },
        { label: 'My Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics' },
        { label: 'Projects',     href: 'projects.html',     icon: 'folder' },
        { label: 'The Wall',     href: 'doubts.html',       icon: 'chat', active: true },
    ];
    if (sidebarNav) {
        sidebarNav.innerHTML = '<div class="nav-section-label">Menu</div>' +
            navItems.map(item => `
                <a class="nav-item${item.active ? ' active' : ''}" href="${item.href}">
                    <span class="nav-icon"><span class="material-symbols-outlined">${item.icon}</span></span>
                    <span>${item.label}</span>
                </a>`).join('');
    }

    // ── Sidebar Mobile ──
    hamburgerBtn?.addEventListener('click', () => {
        appSidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('visible');
    });
    sidebarOverlay?.addEventListener('click', () => {
        appSidebar.classList.remove('open');
        sidebarOverlay.classList.remove('visible');
    });

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

    // ── View Increment ──
    const trackView = () => {
        const viewed = JSON.parse(sessionStorage.getItem('iris_viewed_q') || '[]');
        if (!viewed.includes(questionId)) {
            fbDb.collection('questions').doc(questionId).update({
                views: firebase.firestore.FieldValue.increment(1)
            }).then(() => {
                viewed.push(questionId);
                sessionStorage.setItem('iris_viewed_q', JSON.stringify(viewed));
            }).catch(() => {});
        }
    };
    trackView();

    // ── Listen to Question ──
    fbDb.collection('questions').doc(questionId).onSnapshot(snap => {
        if (!snap.exists) {
            if (loadingShimmer) loadingShimmer.innerHTML = '<p class="text-muted">Question deleted or not found.</p>';
            return;
        }
        
        currentQ = { id: snap.id, ...snap.data() };
        
        // REMOVE SHIMMER
        if (loadingShimmer) loadingShimmer.remove();
        
        renderQuestion(currentQ);
        if (answersSection) answersSection.hidden = false;
        if (postAnswerSection) {
            postAnswerSection.hidden = false;
            // Reveal actual display if it was hidden via CSS
            postAnswerSection.style.display = 'block';
        }
    });

    function renderQuestion(q) {
        const isOwner    = q.userId === session.userId;
        const isResolved = q.status === 'resolved' || !!q.acceptedAnswerId;
        const hasVoted   = (q.votedBy || []).includes(session.userId);

        questionSection.innerHTML = `
            <div class="question-card">
                <div class="question-layout">
                    <div class="vote-sidebar">
                        <button class="vote-btn ${hasVoted ? 'voted' : ''}" id="q-vote" 
                                ${hasVoted ? 'disabled' : ''}>
                            <span class="material-symbols-outlined">thumb_up</span>
                        </button>
                        <div class="vote-count">${q.votes || 0}</div>
                        <div class="vote-label">votes</div>
                    </div>

                    <div class="question-content">
                        <h1 class="question-title">${escHtml(q.title)}</h1>
                        ${q.imageUrl ? `<img class="question-image" src="${q.imageUrl}" id="q-img" style="cursor:pointer">` : ''}
                        <p class="question-body">${escHtml(q.description || '')}</p>

                        <div class="question-footer">
                            <div class="question-author">
                                <div class="author-avatar-sm">${(q.authorName || 'I')[0].toUpperCase()}</div>
                                <div class="author-info">
                                    <div class="author-name">${escHtml(q.authorName || 'Intern')}</div>
                                    <div class="author-time">Asked ${formatTime(q.createdAt)}</div>
                                </div>
                            </div>
                            <div class="question-actions">
                                <span class="doubt-meta-item"><span class="material-symbols-outlined" style="font-size:16px">visibility</span>${q.views || 0} views</span>
                                <span class="status-badge ${isResolved ? 'resolved' : 'open'}">
                                    ${isResolved ? 'Resolved' : 'Open'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('q-vote')?.addEventListener('click', async () => {
            if (hasVoted) return;
            await fbDb.collection('questions').doc(questionId).update({
                votes: firebase.firestore.FieldValue.increment(1),
                votedBy: firebase.firestore.FieldValue.arrayUnion(session.userId)
            });
            showToast('Question upvoted!', 'success');
        });

        document.getElementById('q-img')?.addEventListener('click', () => {
            lightboxImg.src = q.imageUrl;
            lightbox.classList.add('open');
        });
    }

    // ── Listen to Answers ──
    fbDb.collection('answers').where('questionId', '==', questionId).onSnapshot(snap => {
        const answers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        answers.sort((a, b) => {
            if (a.id === currentQ?.acceptedAnswerId) return -1;
            if (b.id === currentQ?.acceptedAnswerId) return 1;
            return (b.votes || 0) - (a.votes || 0);
        });
        if (answersCountBadge) answersCountBadge.textContent = answers.length;
        renderAnswers(answers);
    });

    function renderAnswers(answers) {
        if (answers.length === 0) {
            answersList.innerHTML = `<p class="text-muted" style="padding:4rem;text-align:center">No answers yet. Share your experience!</p>`;
            return;
        }

        const isOwner = currentQ?.userId === session.userId;
        const acceptedId = currentQ?.acceptedAnswerId;

        answersList.innerHTML = answers.map(ans => {
            const hasVoted = (ans.votedBy || []).includes(session.userId);
            const isAccepted = ans.id === acceptedId;

            return `
            <div class="answer-card ${isAccepted ? 'accepted' : ''}">
                <div class="answer-vote-col">
                    <button class="vote-btn sm ${hasVoted ? 'voted' : ''}" data-aid="${ans.id}" ${hasVoted ? 'disabled' : ''}>
                        <span class="material-symbols-outlined" style="font-size:18px">thumb_up</span>
                    </button>
                    <div class="answer-vote-count">${ans.votes || 0}</div>
                    <div class="vote-label">votes</div>
                </div>
                <div class="answer-body-col">
                    <div class="answer-text">${escHtml(ans.answer)}</div>
                    <div class="answer-footer">
                        <div class="question-author">
                            <div class="author-avatar-sm" style="background:linear-gradient(135deg,var(--clr-accent),var(--clr-indigo))">
                                ${(ans.authorName || 'A')[0].toUpperCase()}
                            </div>
                            <div class="author-info">
                                <div class="author-name">${escHtml(ans.authorName || 'Intern')}</div>
                                <div class="author-time">${formatTime(ans.createdAt)}</div>
                            </div>
                        </div>
                        <div class="answer-actions">
                            ${isAccepted ? `<span class="accepted-tag"><span class="material-symbols-outlined">check_circle</span> Accepted</span>` : ''}
                            ${(isOwner && !acceptedId) ? `
                                <button class="accept-btn" data-aid="${ans.id}">
                                    <span class="material-symbols-outlined">check</span> Accept
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Listeners for Upvote & Accept
        answersList.querySelectorAll('.vote-btn[data-aid]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const aid = btn.dataset.aid;
                const ans = answers.find(a => a.id === aid);
                if (!ans || (ans.votedBy || []).includes(session.userId)) return;
                await fbDb.collection('answers').doc(aid).update({
                    votes: firebase.firestore.FieldValue.increment(1),
                    votedBy: firebase.firestore.FieldValue.arrayUnion(session.userId)
                });
                if (ans.userId) BadgeEngine.awardAction(ans.userId, 'upvote_received');
                showToast('Answer upvoted! +2 pts awarded.', 'success');
            });
        });

        answersList.querySelectorAll('.accept-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const aid = btn.dataset.aid;
                const ans = answers.find(a => a.id === aid);
                if (!ans) return;
                try {
                    await fbDb.collection('questions').doc(questionId).update({
                        acceptedAnswerId: aid,
                        status: 'resolved'
                    });
                    if (ans.userId) BadgeEngine.awardAction(ans.userId, 'accepted');
                    showToast('Answer accepted! Doubt marked as resolved.', 'success');
                } catch (err) {
                    showToast('Failed to accept answer.', 'error');
                }
            });
        });
    }

    // ── Post Answer ──
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
            await fbDb.collection('questions').doc(questionId).update({
                answerCount: firebase.firestore.FieldValue.increment(1)
            });
            BadgeEngine.awardAction(session.userId, 'answer');
            answerInput.value = '';
            showToast('Answer shared! Points awarded.', 'success');
        } catch (err) {
            showToast('Failed to post answer.', 'error');
        } finally {
            postAnswerBtn.disabled = false;
        }
    });

    // ── Utils ──
    function escHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function formatTime(ts) { 
        if(!ts) return 'just now';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    lightbox?.addEventListener('click', () => lightbox.classList.remove('open'));

})();
