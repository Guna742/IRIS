/**
 * I.R.I.S — Badge & Points Engine (V2)
 * Manages user points and badge milestones for the Q&A system.
 * Badges: Newbie, Learner, Contributor, Helper, Active Intern.
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
            desc: 'Welcome to IRIS! (Assigned on signup)',
            check: () => true 
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
        }
    ];

    /**
     * Award points to a user for a given action.
     * @param {string} userId
     * @param {'ask'|'answer'|'upvote_received'|'accepted'} action
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

                // Update counters
                const updatedStats = { ...stats, points: newPoints };
                if (action === 'ask')              updatedStats.questionsAsked = (stats.questionsAsked || 0) + 1;
                if (action === 'answer')           updatedStats.answersPosted = (stats.answersPosted || 0) + 1;
                if (action === 'upvote_received')  updatedStats.answerUpvotesReceived = (stats.answerUpvotesReceived || 0) + 1;

                // Check eligibility for new badges
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
     * Ensure the 'newbie' badge is assigned.
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
     * Fetch user's points and badges.
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
            return { points: 0, badges: [], qaStats: {} };
        }
    }

    /**
     * Render badge pills.
     */
    function renderBadges(badgeIds) {
        if (!badgeIds || badgeIds.length === 0) {
            return '<span class="text-muted text-xs">No badges yet. Engage to earn!</span>';
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

    return { awardAction, ensureNewbieBadge, getUserRewards, renderBadges, BADGES, POINTS };

})();
