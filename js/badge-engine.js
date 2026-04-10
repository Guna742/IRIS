/**
 * I.R.I.S — Badge & Points Engine (V3 - Leagues Edition)
 * Inspired by League levels (Bronze, Silver, Gold, Crystal, Master, Champion, Titan).
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

    // ── Badge definitions (Grand Scale League) ──
    const BADGES = [
        {
            order: 1,
            id: 'bronze',
            label: 'Bronze',
            image: 'badges/Bronze.png',
            color: '#CD7F32',
            points: 0,
            desc: 'The beginning of your journey',
            check: () => true
        },
        {
            order: 2,
            id: 'silver',
            label: 'Silver',
            image: 'badges/silver.png',
            color: '#C0C0C0',
            points: 8000,
            desc: 'Demonstrating consistent engagement',
            check: (stats) => (stats.points || 0) >= 8000
        },
        {
            order: 3,
            id: 'gold',
            label: 'Gold',
            image: 'badges/Gold.png',
            color: '#FFD700',
            points: 14000,
            desc: 'A respected contributor to the Wall',
            check: (stats) => (stats.points || 0) >= 14000
        },
        {
            order: 4,
            id: 'crystal',
            label: 'Crystal',
            image: 'badges/Crystal.png',
            color: '#A855F7',
            points: 20000,
            desc: 'Elite problem solving capabilities',
            check: (stats) => (stats.points || 0) >= 20000
        },
        {
            order: 5,
            id: 'master',
            label: 'Master',
            image: 'badges/Master.png',
            color: '#94A3B8',
            points: 26000,
            desc: 'Mastery over platform intelligence',
            check: (stats) => (stats.points || 0) >= 26000
        },
        {
            order: 6,
            id: 'champion',
            label: 'Champion',
            image: 'badges/Champion.png',
            color: '#EF4444',
            points: 32000,
            desc: 'Unrivaled community support',
            check: (stats) => (stats.points || 0) >= 32000
        },
        {
            order: 7,
            id: 'titan',
            label: 'Titan',
            image: 'badges/Titan.png',
            color: '#F59E0B',
            points: 41000,
            desc: 'Legendary status attained',
            check: (stats) => (stats.points || 0) >= 41000
        }
    ];

    async function awardAction(userId, action) {
        if (!userId || !action || !(action in POINTS)) return { points: 0, newBadges: [] };
        const pointsToAdd = POINTS[action];
        const userRef = fbDb.collection('users').doc(userId);
        let newlyAwarded = [];

        try {
            await fbDb.runTransaction(async (tx) => {
                const doc = await tx.get(userRef);
                if (!doc.exists) return;
                const data = doc.data();
                const currentPoints = data.points || 0;
                const currentBadges = data.badges || [];
                const stats = data.qaStats || {};
                const newPoints = currentPoints + pointsToAdd;
                const updatedStats = { ...stats, points: newPoints };
                if (action === 'ask') updatedStats.questionsAsked = (stats.questionsAsked || 0) + 1;
                if (action === 'answer') updatedStats.answersPosted = (stats.answersPosted || 0) + 1;
                if (action === 'upvote_received') updatedStats.answerUpvotesReceived = (stats.answerUpvotesReceived || 0) + 1;
                const earnedBadges = [...currentBadges];
                if (!earnedBadges.includes('bronze')) earnedBadges.push('bronze');
                const sortedPotentiallyNew = BADGES.filter(b => !earnedBadges.includes(b.id)).sort((a,b) => a.order - b.order);
                for (const badge of sortedPotentiallyNew) {
                    if (badge.check(updatedStats)) {
                        earnedBadges.push(badge.id);
                        newlyAwarded.push(badge.id);
                    } else {
                        break; 
                    }
                }
                tx.update(userRef, { points: newPoints, badges: earnedBadges, qaStats: updatedStats });
            });
        } catch (err) { console.error('[BadgeEngine] awardAction failed:', err); }
        return { points: pointsToAdd, newBadges: newlyAwarded };
    }

    async function ensureNewbieBadge(userId) {
        if (!userId) return;
        try {
            const userRef = fbDb.collection('users').doc(userId);
            await userRef.update({ badges: firebase.firestore.FieldValue.arrayUnion('bronze') });
        } catch (err) {}
    }

    async function getUserRewards(userId) {
        try {
            const doc = await fbDb.collection('users').doc(userId).get();
            if (!doc.exists) return { points: 0, badges: [], qaStats: {} };
            const d = doc.data();
            const badges = d.badges || [];
            if (!badges.includes('bronze')) badges.push('bronze');
            return { points: d.points || 0, badges: badges, qaStats: d.qaStats || {} };
        } catch (err) { return { points: 0, badges: ['bronze'], qaStats: {} }; }
    }

    function renderBadges(badgeIds) {
        if (!badgeIds || badgeIds.length === 0) {
            return `<img src="badges/Bronze.png" alt="Bronze" style="width:20px; height:20px; object-fit:contain;"> <span style="font-weight:700; color:#CD7F32">Bronze</span>`;
        }
        const highestBadge = BADGES.filter(b => badgeIds.includes(b.id)).sort((a,b) => b.order - a.order)[0];
        if (!highestBadge) return '';
        return `<div class="earned-badge-pill" style="display:inline-flex; align-items:center; gap:6px; color:${highestBadge.color}">
                    <img src="${highestBadge.image}" alt="${highestBadge.label}" style="width:20px; height:20px; object-fit:contain;">
                    <span style="font-weight:700;">${highestBadge.label}</span>
                </div>`;
    }

    return { awardAction, ensureNewbieBadge, getUserRewards, renderBadges, BADGES, POINTS };

})();
