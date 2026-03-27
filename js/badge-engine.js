/**
 * I.R.I.S — Badge & Points Engine
 * Manages user points and badge milestones for the Q&A system.
 * Requires: firebase-config.js (fbDb), auth.js (Auth)
 */

'use strict';

const BadgeEngine = (() => {

    // ── Points per action ──
    const POINTS = {
        ask: 5,
        answer: 10,
        upvote_received: 2,
        accepted: 15
    };

    // ── Badge definitions ──
    const BADGES = [
        {
            id: 'newbie',
            label: 'Newbie',
            emoji: '🌱',
            desc: 'Welcome to IRIS!',
            check: () => true  // Always eligible — assigned on first visit
        },
        {
            id: 'learner',
            label: 'Learner',
            emoji: '📚',
            desc: 'Asked 20 questions',
            check: (stats) => (stats.questionsAsked || 0) >= 20
        },
        {
            id: 'contributor',
            label: 'Contributor',
            emoji: '✍️',
            desc: 'Posted 15 answers',
            check: (stats) => (stats.answersPosted || 0) >= 15
        },
        {
            id: 'helper',
            label: 'Helper',
            emoji: '🤝',
            desc: 'Received 30 upvotes on answers',
            check: (stats) => (stats.answerUpvotesReceived || 0) >= 30
        },
        {
            id: 'active-intern',
            label: 'Active Intern',
            emoji: '⚡',
            desc: 'Reached 100 total points',
            check: (stats) => (stats.points || 0) >= 100
        },
        {
            id: 'project-star',
            label: 'Project Star',
            emoji: '⭐',
            desc: 'Maintain an average project rating of 4.0 or higher',
            check: (stats) => {
                const score = stats.projectScore || 0;
                // score 80 corresponds to average 4.0 (80 = (4.0/5)*100)
                return score >= 80;
            }
        },
        {
            id: 'top-ranked',
            label: 'Top Ranked',
            emoji: '🏆',
            desc: 'Reached the Top 3 in overall rankings',
            check: (stats) => {
                const rank = stats.rank || 999;
                return rank > 0 && rank <= 3;
            }
        }
    ];

    /**
     * Award points to a user for a given action.
     * Also checks and assigns any newly eligible badges.
     * @param {string} userId
     * @param {'ask'|'answer'|'upvote_received'|'accepted'} action
     * @returns {Promise<{points: number, newBadges: string[]}>}
     */
    async function awardAction(userId, action) {
        if (!userId || !action || !(action in POINTS)) return { points: 0, newBadges: [] };

        const pointsToAdd = POINTS[action];
        const userRef = fbDb.collection('users').doc(userId);

        let newBadges = [];

        try {
            await fbDb.runTransaction(async (tx) => {
                const doc = await tx.get(userRef);
                if (!doc.exists) return;

                const data = doc.data();
                const currentPoints = data.points || 0;
                const currentBadges = data.badges || [];
                const stats = data.qaStats || {};

                const newPoints = currentPoints + pointsToAdd;

                // Update stats counter for the action
                const updatedStats = { ...stats, points: newPoints };
                if (action === 'ask')              updatedStats.questionsAsked = (stats.questionsAsked || 0) + 1;
                if (action === 'answer')           updatedStats.answersPosted = (stats.answersPosted || 0) + 1;
                if (action === 'upvote_received')  updatedStats.answerUpvotesReceived = (stats.answerUpvotesReceived || 0) + 1;

                // Sync current performance from Storage for a fresh check
                if (typeof Storage !== 'undefined') {
                    const profile = Storage.getProfile(userId);
                    if (profile) {
                        updatedStats.projectScore = Storage.computeInternScore(profile);
                        updatedStats.rank = Storage.getInternRank(userId);
                    }
                }

                // Check badges
                newBadges = BADGES
                    .filter(b => !currentBadges.includes(b.id) && b.check(updatedStats))
                    .map(b => b.id);

                tx.update(userRef, {
                    points: newPoints,
                    badges: [...currentBadges, ...newBadges],
                    qaStats: updatedStats
                });
            });
        } catch (err) {
            console.error('[BadgeEngine] awardAction failed:', err);
        }

        return { points: pointsToAdd, newBadges };
    }

    /**
     * Manually check and refresh performance badges (Top Rank, Project Star) 
     * without needing a Q&A action.
     */
    async function refreshBadges(userId) {
        if (!userId || typeof Storage === 'undefined') return [];
        
        try {
            const profile = Storage.getProfile(userId);
            if (!profile) return [];

            const userRef = fbDb.collection('users').doc(userId);
            const doc = await userRef.get();
            if (!doc.exists) return [];

            const data = doc.data();
            const currentBadges = data.badges || [];
            const stats = data.qaStats || {};

            // Add performance metrics to check object
            stats.points = data.points || 0;
            stats.projectScore = Storage.computeInternScore(profile);
            stats.rank = Storage.getInternRank(userId);

            const newlyAwarded = BADGES
                .filter(b => !currentBadges.includes(b.id) && b.check(stats))
                .map(b => b.id);

            if (newlyAwarded.length > 0) {
                await userRef.update({
                    badges: [...currentBadges, ...newlyAwarded],
                    qaStats: stats
                });
                console.log(`[BadgeEngine] Awarded performance badges to ${userId}:`, newlyAwarded);
            }
            return newlyAwarded;
        } catch (err) {
            console.error('[BadgeEngine] refreshBadges failed:', err);
            return [];
        }
    }

    /**
     * Ensure the 'newbie' badge is assigned to a user (called on first visit).
     * @param {string} userId
     */
    async function ensureNewbieBadge(userId) {
        if (!userId) return;
        try {
            const doc = await fbDb.collection('users').doc(userId).get();
            if (!doc.exists) return;
            const data = doc.data();
            const badges = data.badges || [];
            if (!badges.includes('newbie')) {
                await fbDb.collection('users').doc(userId).update({
                    badges: firebase.firestore.FieldValue.arrayUnion('newbie')
                });
            }
        } catch (err) {
            console.warn('[BadgeEngine] ensureNewbieBadge failed:', err);
        }
    }

    /**
     * Fetch user's points and badges from Firestore.
     * @param {string} userId
     * @returns {Promise<{points: number, badges: string[], qaStats: object}>}
     */
    async function getUserRewards(userId) {
        try {
            const doc = await fbDb.collection('users').doc(userId).get();
            if (!doc.exists) return { points: 0, badges: [], qaStats: {} };
            const d = doc.data();
            return {
                points: d.points || 0,
                badges: d.badges || [],
                qaStats: d.qaStats || {}
            };
        } catch (err) {
            console.warn('[BadgeEngine] getUserRewards failed:', err);
            return { points: 0, badges: [], qaStats: {} };
        }
    }

    /**
     * Render badge pills as HTML string.
     * @param {string[]} badgeIds
     * @returns {string} HTML
     */
    function renderBadges(badgeIds) {
        if (!badgeIds || badgeIds.length === 0) {
            return '<span style="color:var(--clr-text-muted);font-size:var(--fs-sm)">No badges yet.</span>';
        }
        return badgeIds.map(id => {
            const def = BADGES.find(b => b.id === id);
            if (!def) return '';
            return `<span class="earned-badge ${id}" title="${def.desc}">
                        <span>${def.emoji}</span>
                        <span>${def.label}</span>
                    </span>`;
        }).join('');
    }

    return { awardAction, refreshBadges, ensureNewbieBadge, getUserRewards, renderBadges, BADGES, POINTS };

})();
