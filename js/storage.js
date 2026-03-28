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
    const FETCH_COOLDOWN = 1000 * 60 * 5; // 5 minutes cache


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
            if (ok) console.log('[Storage] Firestore connection verified.');
            else console.warn('[Storage] Firestore connection test failed.');
        });
    }

    /**
     * Internal test to see if Firestore is unreachable or misconfigured.
     */
    async function testFirestore() {
        try {
            const testDoc = fbDb.collection('_health_check').doc('status');
            await testDoc.set({ lastCheck: Date.now() }, { merge: true });
            return true;
        } catch (err) {
            console.error('[Storage] Firestore connection fault:', err);
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
        if (!userId) {
            const session = Auth.getSession();
            userId = session ? session.userId : null;
        }
        if (!userId) return null;
        const profiles = getProfiles();
        if (profiles[userId]) return profiles[userId];

        // NEW: Handle missing profiles for logged-in users (Skeletal Profile)
        const session = Auth.getSession();
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

    async function deleteProfile(userId) {
        const profiles = getProfiles();
        if (profiles[userId]) {
            // Delete their projects from Firestore first
            const userProjects = getProjects().filter(p => String(p.ownerId) === String(userId));
            for (const p of userProjects) {
                if (p.id) await deleteProjectFromFirebase(p.id);
            }

            delete profiles[userId];
            localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
            // Also delete their projects from localStorage
            const projects = getProjects().filter(p => String(p.ownerId) !== String(userId));
            localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
            
            // Delete user document from Firestore (standard profile location)
            try {
                await fbDb.collection('users').doc(userId).delete();
            } catch (e) {
                console.warn('[Storage] Failed to delete user from Firestore', e);
            }
            
            return true;
        }
        return false;
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
        report.id = 'rep_' + Date.now();
        report.createdAt = Date.now();
        all.push(report);
        localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
        return report;
    }

    // ── Missed Report Requests ──
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
            console.log(`[Storage] Missed request synced: ${request.id}`);
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

    /** Centralized scoring logic (shared across leaderboard/profile/analytics) */
    function computeInternScore(p) {
        if (!p || !p.userId) return 0;
        const projects = getProjects().filter(proj => String(proj.ownerId) === String(p.userId));
        const ratedProjects = projects.filter(proj => proj.rating);
        if (ratedProjects.length === 0) return 0;

        const totalRating = ratedProjects.reduce((sum, proj) => sum + proj.rating, 0);
        const avg = totalRating / ratedProjects.length;
        return Math.round((avg / 5) * 100);
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
            const clean = _sanitizeData({ ...data });
            delete clean.password;
            delete clean._isNew;
            delete clean._isSkeleton;
            await fbDb.collection('users').doc(internId).set({
                ...clean,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log(`[Storage] Intern profile synced: ${internId}`);
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
            console.log(`[Storage] Project synced: ${project.id}`);
        } catch (err) {
            console.error('[Storage] syncProject error:', err);
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

        const tempAppName = 'temp_app_' + Date.now();
        let tempApp;
        try {
            // 1. Create secondary app to create user without changing admin state
            tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
            const tempAuth = tempApp.auth();

            // 2. Create the Firebase Auth user
            const cred = await tempAuth.createUserWithEmailAndPassword(email.toLowerCase().trim(), password);
            const userId = cred.user.uid;

            // 3. Prepare final profile
            const finalProfile = {
                ...profile,
                userId,
                role: 'user',
                displayName: name,
                createdAt: Date.now()
            };
            delete finalProfile._isNew;

            // 4. Write to users/{userId} using temp app (intern context)
            const tempDb = tempApp.firestore();
            const cleanedForDb = _sanitizeData(finalProfile);
            delete cleanedForDb.password;
            await tempDb.collection('users').doc(userId).set(cleanedForDb);
            console.log('[Storage] Intern user doc created in Firestore.');

            // 5. Write credential record to admins/{adminId}/interns/{internId}
            const adminSession = Auth.getSession();
            if (adminSession && adminSession.role === 'admin') {
                await createInternRecord(adminSession.userId, userId, email, name);
            }

            // 6. Update localStorage with the real Firebase UID
            const profiles = getProfiles();
            delete profiles[profile.userId];
            profiles[userId] = finalProfile;
            localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

            return { success: true, userId };

        } catch (err) {
            console.error('[Storage] Account creation error:', {
                message: err.message,
                code: err.code,
                email: profile.email
            });
            return { success: false, error: err.message };
        } finally {
            if (tempApp) await tempApp.delete();
        }
    }

    /**
     * Pulls all core collections from Firestore into localStorage.
     * Prevents redundant fetches by checking FETCH_COOLDOWN.
     */
    async function fetchEverything(force = false) {
        const lastSync = localStorage.getItem(SYNC_KEY);
        const now = Date.now();

        if (!force && lastSync && (now - lastSync < FETCH_COOLDOWN)) {
            console.log('[Storage] Skipping sync, cache is still fresh.');
            return;
        }

        console.log('[Storage] Starting global sync from Firestore...');
        try {
            await Promise.all([
                syncAllUsers(),
                syncAllProjects()
            ]);
            localStorage.setItem(SYNC_KEY, now.toString());
            console.log('[Storage] Global sync complete.');
        } catch (err) {
            console.error('[Storage] Global sync failed:', err);
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
        getInternRank,
        getHourlyReports,
        saveHourlyReport,
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
        testFirestore,
        fetchEverything,
        syncAllUsers,
        syncAllProjects
    };

})();

// Auto-seed on load
Storage.seed();
