/**
 * InternTrack — Storage Module
 * LocalStorage CRUD helpers + default seed data.
 */

'use strict';

const Storage = (() => {
    const PROFILES_KEY = 'interntrack_profiles';
    const PROJECTS_KEY = 'interntrack_projects';
    const REPORTS_KEY = 'interntrack_hourly_reports';
    const SYNC_KEY    = 'interntrack_last_sync';
    const FETCH_COOLDOWN = 1000 * 30; // 30 seconds cache (snappy sync)


    // ── Default seed data (loaded on first run) ──
    const DEFAULT_PROFILES = {};

    const DEFAULT_PROJECTS = [];

    const VERSION_KEY = 'interntrack_v';
    const CURRENT_VERSION = '3.0';

    /** Bootstrap default data on first run; clears stale data from old builds. */
    function seed() {
        const storedVersion = localStorage.getItem(VERSION_KEY);
        if (storedVersion !== CURRENT_VERSION) {
            localStorage.removeItem(PROFILES_KEY);
            localStorage.removeItem(PROJECTS_KEY);
            localStorage.removeItem(REPORTS_KEY);
            Object.keys(localStorage)
                .filter(k => k.startsWith('interntrack_') && k !== VERSION_KEY)
                .forEach(k => localStorage.removeItem(k));
            localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
        }
        if (!localStorage.getItem(PROFILES_KEY)) {
            localStorage.setItem(PROFILES_KEY, JSON.stringify(DEFAULT_PROFILES));
        }
        if (!localStorage.getItem(PROJECTS_KEY)) {
            localStorage.setItem(PROJECTS_KEY, JSON.stringify(DEFAULT_PROJECTS));
        }
        if (!localStorage.getItem(REPORTS_KEY)) {
            localStorage.setItem(REPORTS_KEY, JSON.stringify([]));
        }

        // Firestore Health Check (Silent test)
        testFirestore().then(ok => {
            if (ok) console.log('[Storage] Cloud sync connection established.');
            else console.info('[Storage] Workspace is currently operating in Local-Only mode.');
        });
    }

    /**
     * Internal test to see if Firestore is unreachable or misconfigured.
     */
    async function testFirestore() {
        try {
            // Attempt a read instead of a write to verify connectivity without permission stress
            await fbDb.collection('users').limit(1).get({ source: 'server' });
            return true;
        } catch (err) {
            // IRIS fallback to local-only mode ensures Zero-Downtime even if sync connection is transiently unreachable.
            return false;
        }
    }

    // ── Profiles ──
    function getProfiles() {
        try {
            const raw = localStorage.getItem(PROFILES_KEY);
            return raw ? JSON.parse(raw) : DEFAULT_PROFILES;
        } catch { return DEFAULT_PROFILES; }
    }

    function getProfile(userId) {
        const session = Auth.getSession();
        if (!userId) {
            userId = session ? session.userId : null;
        }
        if (!userId) return null;
        
        const profiles = getProfiles();
        if (profiles[userId]) return profiles[userId];

        // NEW: Handle missing profiles for logged-in users (Skeletal Profile)
        if (session && session.userId === userId) {
            return {
                userId,
                name: session.displayName || 'New Intern',
                email: session.email || '',
                tagline: 'Software Engineering Intern',
                bio: 'Welcome to I.R.I.S! Please update your bio and skills to complete your profile.',
                skills: [],
                location: '',
                internship: { role: 'Intern', company: '' },
                socialLinks: { github: '', linkedin: '' },
                _isSkeleton: true // Internal flag to prompt saving
            };
        }
        return null;
    }

    function saveProfile(userId, data) {
        const profiles = getProfiles();
        profiles[userId] = { ...data, userId };
        localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    }

    // UIDs that are mid-delete — onSnapshot must not revive them
    const _pendingDeleteIds = new Set();

    async function deleteProfile(userId) {
        const profiles = getProfiles();
        if (!profiles[userId]) return false;

        // Mark as pending-delete IMMEDIATELY so onSnapshot ignores this UID
        _pendingDeleteIds.add(userId);

        // 1. Remove from localStorage right away — UI should reflect this instantly
        delete profiles[userId];
        localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

        // 2. Remove their projects from localStorage
        const projects = getProjects().filter(p => String(p.userId || p.ownerId) !== String(userId));
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));

        // 3. Delete from Firestore (async — onSnapshot blocklist keeps UI clean even if slow)
        const userProjects = projects.filter(p => String(p.userId || p.ownerId) === String(userId));
        for (const p of userProjects) {
            if (p.id) await deleteProjectFromFirebase(p.id);
        }
        try {
            await fbDb.collection('users').doc(userId).delete();
            console.log('[Storage] User deleted from Firestore:', userId);
        } catch (e) {
            console.warn('[Storage] Failed to delete user from Firestore (will retry on next sync):', e.message);
        } finally {
            // Clear from blocklist after 10 s regardless — gives Firestore time to propagate
            setTimeout(() => _pendingDeleteIds.delete(userId), 10000);
        }

        return true;
    }

    // ── Projects ──
    function getProjects() {
        try {
            const raw = localStorage.getItem(PROJECTS_KEY);
            const projects = raw ? JSON.parse(raw) : DEFAULT_PROJECTS;
            return projects.sort((a, b) => b.createdAt - a.createdAt);
        } catch { return DEFAULT_PROJECTS; }
    }

    function saveProject(project) {
        const projects = getProjects();
        const idx = projects.findIndex(p => p.id === project.id);
        if (idx > -1) {
            projects[idx] = project; // update
        } else {
            project.id = 'proj_' + Date.now();
            project.createdAt = Date.now();
            projects.unshift(project); // add to front
        }
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
        return project;
    }

    function deleteProject(id) {
        const projects = getProjects().filter(p => p.id !== id);
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    }

    function getProjectById(id) {
        return getProjects().find(p => p.id === id) || null;
    }

    // ── Hourly Reports ──
    function getHourlyReports(userId) {
        try {
            const raw = localStorage.getItem(REPORTS_KEY);
            const all = raw ? JSON.parse(raw) : [];
            if (!userId) return all;
            return all.filter(r => String(r.userId) === String(userId));
        } catch { return []; }
    }

    function saveHourlyReport(report) {
        const all = getHourlyReports();
        if (!report.id) {
            report.id = 'rep_' + Date.now();
            report.createdAt = Date.now();
        }
        all.push(report);
        localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
        return report;
    }

    function getHourlyReportById(id) {
        const all = getHourlyReports();
        return all.find(r => r.id === id) || null;
    }

    function updateHourlyReport(id, data) {
        const all = getHourlyReports();
        const idx = all.findIndex(r => r.id === id);
        if (idx > -1) {
            all[idx] = { ...all[idx], ...data, updatedAt: Date.now() };
            localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
            return all[idx];
        }
        return null;
    }

    // ── Missed/Edit Report Requests ──
    const MISSED_REPORTS_KEY = 'interntrack_missed_report_requests';
    function getMissedReportRequests(userId) {
        try {
            const raw = localStorage.getItem(MISSED_REPORTS_KEY);
            const all = raw ? JSON.parse(raw) : [];
            if (!userId) return all;
            return all.filter(r => String(r.userId) === String(userId));
        } catch { return []; }
    }

    function saveMissedReportRequest(request) {
        const all = getMissedReportRequests();
        request.id = 'miss_' + Date.now();
        request.createdAt = Date.now();
        request.status = 'pending';
        all.push(request);
        localStorage.setItem(MISSED_REPORTS_KEY, JSON.stringify(all));
        
        // Sync to Firebase
        syncMissedReportRequestToFirebase(request.userId, request);
        return request;
    }

    function updateMissedReportRequestStatus(userId, requestId, status) {
        const all = getMissedReportRequests();
        const idx = all.findIndex(r => r.id === requestId);
        if (idx > -1) {
            all[idx].status = status;
            all[idx].updatedAt = Date.now();
            localStorage.setItem(MISSED_REPORTS_KEY, JSON.stringify(all));
            
            // Sync to Firebase
            syncMissedReportRequestToFirebase(userId, all[idx]);
            return true;
        }
        return false;
    }

    async function syncMissedReportRequestToFirebase(userId, request) {
        if (!userId || !request) return;
        try {
            await fbDb.collection('users').doc(userId)
                .collection('missed_requests').doc(request.id).set({
                    ...request,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            console.log(`[Storage] Missed/Edit request synced: ${request.id}`);
        } catch (err) {
            console.error('[Storage] syncMissedReportRequest error:', err);
        }
    }

    // ── Admin Profiles ──
    const ADMIN_KEY = 'interntrack_admin';
    function getAdminProfile(userId) {
        try {
            const raw = localStorage.getItem(ADMIN_KEY);
            const admins = raw ? JSON.parse(raw) : {};
            if (admins[userId]) return admins[userId];
            
            // Fallback: check main profiles (since fetchEverything syncs all 'users' there)
            const profiles = getProfiles();
            if (profiles[userId] && profiles[userId].role === 'admin') {
                return profiles[userId];
            }
            return null;
        } catch { return null; }
    }

    function saveAdminProfile(userId, data) {
        try {
            const raw = localStorage.getItem(ADMIN_KEY);
            const admins = raw ? JSON.parse(raw) : {};
            admins[userId] = { ...data, userId };
            localStorage.setItem(ADMIN_KEY, JSON.stringify(admins));
        } catch (e) { console.error('Failed to save admin profile', e); }
    }

    /**
     * Calculate profile completion percentage (0-100)
     */
    function getCompletionStatus(profile) {
        if (!profile) return 0;
        let filled = 0;
        const coreFields = ['name', 'email', 'tagline', 'bio', 'location', 'avatar'];
        coreFields.forEach(f => { if (profile[f]) filled++; });
        
        // Complex fields
        if (profile.skills && profile.skills.length > 0) filled++;
        if (profile.internship && profile.internship.company) filled++;
        if (profile.socialLinks && (profile.socialLinks.github || profile.socialLinks.linkedin)) filled++;
        
        const totalFields = coreFields.length + 3; // 9 fields
        return Math.round((filled / totalFields) * 100);
    }

    /** Centralized scoring logic (shared across leaderboard/profile/analytics) */
    function computeInternScore(p) {
        if (!p || !p.userId) return 0;
        const projects = getProjects().filter(proj => String(proj.userId || proj.ownerId) === String(p.userId));
        const ratedProjects = projects.filter(proj => proj.rating);
        
        // Base score if no projects are rated, but profile is filled
        if (ratedProjects.length === 0) {
            return Math.min(Math.round(getCompletionStatus(p) / 2.5), 30); // Max 30% for full profile but no work
        }

        const totalRating = ratedProjects.reduce((sum, proj) => sum + proj.rating, 0);
        const avg = totalRating / ratedProjects.length;
        
        // Combine average rating (70% weight) and completion (30% weight)
        const ratingScore = (avg / 5) * 100;
        const completionScore = getCompletionStatus(p);
        
        return Math.round((ratingScore * 0.7) + (completionScore * 0.3));
    }

    /** Compute all metrics for a profile */
    function getProfileMetrics(profile) {
        if (!profile) return { completion: 0, score: 0, rating: 0 };
        
        // Prefer stored metrics from database
        if (profile.metrics) {
            return {
                completion: profile.metrics.completion || 0,
                score: profile.metrics.score || 0,
                rating: profile.metrics.rating || 0
            };
        }
        
        const completion = getCompletionStatus(profile);
        const score = computeInternScore(profile);
        
        const projects = getProjects().filter(proj => String(proj.userId || proj.ownerId) === String(profile.userId));
        const ratedProjects = projects.filter(proj => proj.rating);
        const avgRating = ratedProjects.length > 0 
            ? (ratedProjects.reduce((s, p) => s + p.rating, 0) / ratedProjects.length).toFixed(1)
            : "0.0";
            
        return { completion, score, rating: parseFloat(avgRating) };
    }

    /** Calculate rank for a specific intern based on overall score */
    function getInternRank(userId) {
        const profiles = getProfiles();
        const internList = Object.values(profiles);

        const enriched = internList.map(p => ({
            userId: p.userId,
            score: computeInternScore(p)
        })).sort((a, b) => b.score - a.score);

        const index = enriched.findIndex(p => p.userId === userId);
        return index > -1 ? index + 1 : null;
    }

    // ── Firebase Integration (Full Architecture) ──

    /**
     * Helper to strip undefined/null values for Firestore compatibility.
     */
    function _sanitizeData(data) {
        const clean = {};
        Object.keys(data).forEach(key => {
            if (data[key] !== undefined && data[key] !== null) {
                if (typeof data[key] === 'object' && !Array.isArray(data[key])) {
                    clean[key] = _sanitizeData(data[key]);
                } else {
                    clean[key] = data[key];
                }
            }
        });
        return clean;
    }

    // ── ADMIN: Sync admin profile to admins/{adminId} ──
    async function syncAdminProfile(adminId, data) {
        if (!adminId || !data) return;
        try {
            const clean = _sanitizeData({ ...data, adminId, updatedAt: Date.now() });
            delete clean.password;
            await fbDb.collection('admins').doc(adminId).set(clean, { merge: true });
            console.log('[Storage] Admin profile synced to Firestore.');
        } catch (err) {
            console.error('[Storage] Admin profile sync error:', err);
        }
    }

    // ── ADMIN: Create intern credential record in admins/{adminId}/interns/{internId} ──
    async function createInternRecord(adminId, internId, internEmail, internName) {
        if (!adminId || !internId) return;
        try {
            await fbDb.collection('admins').doc(adminId)
                .collection('interns').doc(internId).set({
                    email: internEmail,
                    name: internName,
                    internId,
                    createdAt: Date.now()
                });
            console.log('[Storage] Intern record created under admin.');
        } catch (err) {
            console.error('[Storage] createInternRecord error:', err);
        }
    }

    // ── INTERN: Sync intern profile to users/{internId} ──
    async function syncInternProfile(internId, data) {
        if (!internId || !data) return;
        try {
            // Compute metrics for database storage
            const metrics = getProfileMetrics(data);
            
            const clean = _sanitizeData({ ...data });
            delete clean.password;
            delete clean._isNew;
            delete clean._isSkeleton;
            await fbDb.collection('users').doc(internId).set({
                ...clean,
                metrics: metrics, // Store calculated metrics for easy fetching
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log(`[Storage] Intern profile synced with metrics: ${internId}`);
        } catch (err) {
            console.error('[Storage] syncInternProfile error:', err);
            throw err;
        }
    }

    // ── INTERN: Sync analytics to users/{internId}/analytics (single doc) ──
    async function syncAnalytics(internId, analyticsData) {
        if (!internId || !analyticsData) return;
        try {
            await fbDb.collection('users').doc(internId)
                .collection('analytics').doc('summary').set({
                    ...analyticsData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            console.log(`[Storage] Analytics synced for ${internId}`);
        } catch (err) {
            console.error('[Storage] syncAnalytics error:', err);
        }
    }

    // ── PROJECT: Sync project to top-level projects/{projectId} ──
    async function syncProject(project) {
        if (!project || !project.id) return;
        try {
            const clean = _sanitizeData({ ...project });
            await fbDb.collection('projects').doc(project.id).set({
                ...clean,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log(`[Storage] Project synced successfully: ${project.id}`);
            return { success: true };
        } catch (err) {
            console.error('[Storage] syncProject CRITICAL ERROR:', err);
            // Throw so the caller (UI) can show a toast
            throw err;
        }
    }

    // ── PROJECT: Delete project from Firestore ──
    async function deleteProjectFromFirebase(projectId) {
        if (!projectId) return;
        try {
            await fbDb.collection('projects').doc(projectId).delete();
            console.log(`[Storage] Project deleted from Firestore: ${projectId}`);
        } catch (err) {
            console.error('[Storage] deleteProject error:', err);
        }
    }

    // ── REPORT: Save daily activity report to users/{internId}/reports/{reportId} ──
    async function saveActivityReportToFirebase(internId, report) {
        if (!internId || !report) return;
        try {
            const reportId = report.id || ('rep_fb_' + Date.now());
            await fbDb.collection('users').doc(internId)
                .collection('reports').doc(reportId).set({
                    ...report,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            console.log(`[Storage] Report saved to Firestore: ${reportId}`);
        } catch (err) {
            console.error('[Storage] saveActivityReportToFirebase error:', err);
        }
    }

    // ── Legacy: kept for compatibility ──
    async function saveProfileToFirebase(userId, data) {
        return syncInternProfile(userId, data);
    }

    /**
     * Create Firebase Auth account and initial Firestore profile.
     * Uses secondary Firebase app instance to avoid logging out the admin.
     */
    async function createInternAccount(profile, password) {
        const { email, name } = profile;
        if (!email || !password) return { success: false, error: 'Email and password are required.' };

        // Verify admin session is active before starting
        const adminSession = Auth.getSession();
        if (!adminSession || adminSession.role !== 'admin') {
            return { success: false, error: 'Admin session expired. Please log in again.' };
        }

        const tempAppName = 'temp_app_' + Date.now();
        let tempApp;
        let userId = null;
        try {
            // 1. Create secondary app to create user without changing admin state
            tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
            const tempAuth = tempApp.auth();

            // 2. Create the Firebase Auth user
            console.log('[Storage] Step 2: Creating Firebase Auth user for', email);
            let cred;
            try {
                cred = await tempAuth.createUserWithEmailAndPassword(email.toLowerCase().trim(), password);
            } catch (authErr) {
                console.error('[Storage] Step 2 FAILED — Firebase Auth error:', authErr.code, authErr.message);
                return { success: false, error: _friendlyAuthError(authErr) };
            }
            userId = cred.user.uid;
            console.log('[Storage] Step 2 OK — UID:', userId);

            // 3. Prepare final profile
            const finalProfile = {
                ...profile,
                userId,
                role: 'user',
                displayName: name,
                createdAt: Date.now()
            };
            delete finalProfile._isNew;

            // 4. Write to users/{userId} using the CURRENT ADMIN context (fbDb)
            console.log('[Storage] Step 4: Writing Firestore user doc...');
            const metrics = getProfileMetrics(finalProfile);
            const cleanedForDb = _sanitizeData({ ...finalProfile, metrics });
            delete cleanedForDb.password;
            try {
                await fbDb.collection('users').doc(userId).set(cleanedForDb, { merge: true });
                console.log('[Storage] Step 4 OK — Intern user doc created.');
            } catch (fsErr) {
                console.error('[Storage] Step 4 FAILED — Firestore write error:', fsErr.code, fsErr.message);
                // Auth user was created but Firestore write failed — still return success
                // so the UI can redirect; the local profile will still work.
                console.warn('[Storage] Continuing with local-only save due to Firestore write failure.');
            }

            // 5. Write credential record to admins/{adminId}/interns/{internId}
            console.log('[Storage] Step 5: Writing admin credential record...');
            try {
                await createInternRecord(adminSession.userId, userId, email, name);
                console.log('[Storage] Step 5 OK.');
            } catch (recErr) {
                console.warn('[Storage] Step 5 WARN — createInternRecord failed (non-critical):', recErr.message);
            }

            // 6. Update localStorage with the real Firebase UID
            const profiles = getProfiles();
            delete profiles[profile.userId];
            profiles[userId] = finalProfile;
            localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

            return { success: true, userId };

        } catch (err) {
            console.error('[Storage] Account creation error — code:', err.code, '| message:', err.message, '| full:', err);
            return { success: false, error: _friendlyAuthError(err) };
        } finally {
            if (tempApp) {
                try { await tempApp.delete(); } catch (_) { /* ignore cleanup errors */ }
            }
        }
    }

    /** Convert Firebase Auth error codes to human-readable messages */
    function _friendlyAuthError(err) {
        const map = {
            'auth/email-already-in-use': 'An account with this email already exists.',
            'auth/invalid-email':         'The email address is not valid.',
            'auth/weak-password':         'Password must be at least 6 characters.',
            'auth/network-request-failed':'Network error. Check your internet connection.',
            'auth/too-many-requests':     'Too many attempts. Please wait and try again.',
            'auth/configuration-not-found': 'Firebase is not configured correctly.',
            'auth/operation-not-allowed': 'Email/password sign-in is not enabled in Firebase.',
        };
        return map[err.code] || (err.message || 'An unexpected error occurred.');
    }

    /**
     * Create Admin Firebase Auth account and initial Firestore profile.
     * Writes to both 'users' and 'admins' collections.
     */
    async function createAdminAccount(data, password) {
        const { email, name, roleTitle } = data;
        const tempAppName = 'admin_creation_' + Date.now();
        let tempApp;
        try {
            tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
            const tempAuth = tempApp.auth();
            const cred = await tempAuth.createUserWithEmailAndPassword(email.toLowerCase().trim(), password);
            const userId = cred.user.uid;

            const adminProfile = {
                userId,
                name,
                email: email.toLowerCase().trim(),
                role: 'admin',
                roleTitle: roleTitle || 'Administrator',
                createdAt: Date.now()
            };

            // Write to BOTH collections for consistency using CURRENT ADMIN context (fbDb)
            const metrics = getProfileMetrics(adminProfile);
            const clean = _sanitizeData({ ...adminProfile, metrics });
            delete clean.password;

            // 1. users collection (for general lookup)
            await fbDb.collection('users').doc(userId).set(clean, { merge: true });
            // 2. admins collection (for secure/extended lookup)
            await fbDb.collection('admins').doc(userId).set(clean, { merge: true });

            console.log('[Storage] Admin created with metrics.');

            // Save locally
            saveAdminProfile(userId, adminProfile);

            return { success: true, userId };
        } catch (err) {
            console.error('[Storage] Admin creation error:', err);
            return { success: false, error: err.message };
        } finally {
            if (tempApp) await tempApp.delete();
        }
    }

    /**
     * Pulls all core collections from Firestore into localStorage.
     * Prevents redundant fetches by checking FETCH_COOLDOWN.
     */
    /**
     * Pulls all core collections from Firestore and starts real-time listeners.
     * This keeps Dashboard, Leaderboard, and Projects in sync globally.
     */
    async function fetchEverything(force = false) {
        // Start listeners once per session (force=true resets the guard, e.g. after login)
        if (window._iris_sync_active && !force) return;
        if (force) window._iris_sync_active = false; // Reset so listeners re-attach
        window._iris_sync_active = true;

        console.log('[Storage] Connecting real-time cloud streams...');

        // Immediately emit cached data so UI renders from localStorage while Firestore loads
        const cachedProfiles = getProfiles();
        const cachedProjects = getProjects();
        if (Object.keys(cachedProfiles).length > 0) {
            window.dispatchEvent(new CustomEvent('iris-data-sync', { detail: { type: 'users', count: Object.keys(cachedProfiles).length, fromCache: true } }));
        }
        if (cachedProjects.length > 0) {
            window.dispatchEvent(new CustomEvent('iris-data-sync', { detail: { type: 'projects', count: cachedProjects.length, fromCache: true } }));
        }

        try {
            // Projects Listener
            fbDb.collection('projects').onSnapshot(snap => {
                console.log('[Storage] LIVE PROJECTS: ' + snap.size);
                const projects = [];
                snap.forEach(doc => projects.push({ ...doc.data(), id: doc.id }));
                localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
                // Dispatch event for UI re-renderers
                window.dispatchEvent(new CustomEvent('iris-data-sync', { detail: { type: 'projects', count: snap.size } }));
            }, e => console.warn('[Storage] Projects stream error:', e));

            // Users/Profiles Listener (for Leaderboard/Interns list)
            // Rebuilds fresh from Firestore every time. Skips any UID in _pendingDeleteIds
            // so a slow Firestore delete doesn't revive the user on-screen.
            fbDb.collection('users').onSnapshot(snap => {
                console.log('[Storage] LIVE USERS: ' + snap.size);
                const freshProfiles = {};
                snap.forEach(doc => {
                    if (!_pendingDeleteIds.has(doc.id)) {
                        freshProfiles[doc.id] = { ...doc.data(), userId: doc.id };
                    } else {
                        console.log('[Storage] Skipping revive of pending-delete uid:', doc.id);
                    }
                });
                localStorage.setItem(PROFILES_KEY, JSON.stringify(freshProfiles));
                window.dispatchEvent(new CustomEvent('iris-data-sync', { detail: { type: 'users', count: snap.size } }));
            }, e => console.warn('[Storage] Users stream error:', e));

        } catch (err) {
            console.error('[Storage] sync-init high-level error:', err);
        }
    }

    async function syncAllUsers() {
        const snap = await fbDb.collection('users').get();
        const profiles = getProfiles();
        snap.forEach(doc => {
            profiles[doc.id] = { ...doc.data(), userId: doc.id };
        });
        localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    }

    async function syncAllProjects() {
        const snap = await fbDb.collection('projects').get();
        const projects = [];
        snap.forEach(doc => {
            projects.push({ ...doc.data(), id: doc.id });
        });
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    }

    /**
     * Real-time listener for the projects collection.
     * Triggers callback whenever any project is added/updated/deleted.
     */
    function watchProjects(callback) {
        if (typeof fbDb === 'undefined' || !fbDb) {
            console.warn('[Storage] fbDb not found, fallback to local only.');
            return null;
        }
        return fbDb.collection('projects').onSnapshot(snap => {
            console.log('[Storage] Projects fetched from Cloud:', snap.size);
            const projects = [];
            snap.forEach(doc => {
                projects.push({ ...doc.data(), id: doc.id });
            });
            // Auto-update cache the moment database changes
            localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
            if (callback) callback(projects);
        }, err => {
            console.error('[Storage] watchProjects live sync error:', err);
        });
    }


    /**
     * Calculate a quality score (0-100) and feedback for a report.
     */
    function calculateReportScore(report) {
        if (!report || !report.description) return { score: 0, feedback: "No content detected." };
        
        const text = report.description.trim();
        const words = text.split(/\s+/);
        let score = 40; // Base score
        let feedback = "Good start! Try adding more technical specifics.";

        // Word count impact
        if (words.length > 50) { score += 30; feedback = "Phenomenal detail! This is a high-quality report."; }
        else if (words.length > 20) { score += 15; feedback = "Great documentation. Keep it as detailed as possible."; }
        else if (words.length < 10) { score -= 20; feedback = "Report is too short. Add more about what you learned."; }

        // Content check (Mock intelligence)
        const hasTechnical = /code|fix|bug|implement|test|debug|api|database|ui|ux/i.test(text);
        if (hasTechnical) { score += 20; }
        else { feedback += " (Try mentioning technical tools or tasks)"; }

        return { score: Math.min(100, score), feedback };
    }

    /**
     * Calculate current daily streak for an intern.
     */
    function getInternStreak(userId) {
        const reports = getHourlyReports(userId).sort((a, b) => b.createdAt - a.createdAt);
        if (reports.length === 0) return 0;

        let streak = 0;
        let lastDate = new Date(); // Start from today
        lastDate.setHours(0, 0, 0, 0);

        for (const r of reports) {
            const rDate = new Date(r.timestamp || r.createdAt);
            rDate.setHours(0, 0, 0, 0);

            const diffTime = lastDate - rDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                if (streak === 0) streak = 1; // Today counted
            } else if (diffDays === 1) {
                streak++; // Consecutive day
                lastDate = rDate;
            } else {
                break; // Streak broken
            }
        }
        return streak;
    }


    /**
     * Track user actions for daily missions.
     */
    function markMissionVisited(missionId, userId) {
        if (!userId) return;
        const today = new Date().toDateString();
        localStorage.setItem(`iris_mission_${missionId}_${userId}_${today}`, 'true');
    }

    function isMissionVisited(missionId, userId) {
        if (!userId) return false;
        const today = new Date().toDateString();
        return localStorage.getItem(`iris_mission_${missionId}_${userId}_${today}`) === 'true';
    }


    return {
        seed,
        getProfiles,
        getProfile,
        saveProfile,
        deleteProfile,
        getProjects,
        saveProject,
        deleteProject,
        getProjectById,
        getAdminProfile,
        saveAdminProfile,
        computeInternScore,
        getCompletionStatus,
        getProfileMetrics,
        getInternRank,
        getHourlyReports,
        saveHourlyReport,
        getHourlyReportById,
        updateHourlyReport,
        calculateReportScore,
        getInternStreak,
        markMissionVisited,
        isMissionVisited,
        // Missed Reports
        getMissedReportRequests,
        saveMissedReportRequest,
        updateMissedReportRequestStatus,
        // Firestore Sync
        syncAdminProfile,
        createInternRecord,
        syncInternProfile,
        syncAnalytics,
        syncProject,
        deleteProjectFromFirebase,
        saveActivityReportToFirebase,
        saveProfileToFirebase,   // legacy alias
        createInternAccount,
        createAdminAccount,
        testFirestore,
        fetchEverything,
        syncAllUsers,
        syncAllProjects,
        watchProjects
    };

})();

// Auto-seed on load
Storage.seed();
