/**
 * InternTrack — Premium Animation Engine
 * Handles advanced interactions: Magnetic effects, 3D Tilt, Scroll Reveals
 */

document.addEventListener('DOMContentLoaded', () => {
    initMagneticButtons();
    init3DTilt();
    initScrollReveals();
    initTextReveals();
});

/**
 * 1. Magnetic Buttons
 * Elements with .btn-magnetic will subtly follow the cursor
 */
function initMagneticButtons() {
    const magneticEls = document.querySelectorAll('.btn-magnetic');

    magneticEls.forEach(el => {
        el.addEventListener('mousemove', (e) => {
            const { left, top, width, height } = el.getBoundingClientRect();
            const x = e.clientX - left - width / 2;
            const y = e.clientY - top - height / 2;

            // Move element 30% of relative mouse position
            el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;

            // Move children (icons/text) even more for depth
            const children = el.children;
            for (let child of children) {
                child.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
                child.style.transition = 'none';
            }
        });

        el.addEventListener('mouseleave', () => {
            el.style.transform = `translate(0px, 0px)`;
            el.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';

            for (let child of el.children) {
                child.style.transform = `translate(0px, 0px)`;
                child.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
            }
        });
    });
}

/**
 * 2. 3D Tilt Effect
 * Cards with .card-3d will tilt according to mouse position
 */
function init3DTilt() {
    const cards = document.querySelectorAll('.card-3d');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const { left, top, width, height } = card.getBoundingClientRect();
            const x = (e.clientX - left) / width;
            const y = (e.clientY - top) / height;

            const tiltX = (y - 0.5) * 15 * -1; // Max 15 degree tilt
            const tiltY = (x - 0.5) * 15;

            card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`;
            card.style.transition = 'none';

            // Inner glare effect if it exists
            const glare = card.querySelector('.glare');
            if (glare) {
                glare.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.1) 0%, transparent 60%)`;
            }
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            card.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
        });
    });
}

/**
 * 3. Scroll Reveals
 * Elements with data-reveal will animate as they enter viewport
 */
function initScrollReveals() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -20px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                // Opt-out after animation
                if (!entry.target.hasAttribute('data-reveal-once')) {
                    observer.unobserve(entry.target);
                }
            }
        });
    }, observerOptions);

    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));

    // Stagger handling for children
    document.querySelectorAll('[data-stagger]').forEach(parent => {
        const children = parent.children;
        Array.from(children).forEach((child, index) => {
            child.style.transitionDelay = `${index * 0.1}s`;
        });
    });
}

/**
 * 4. Text Reveal (Split Type logic)
 */
function initTextReveals() {
    document.querySelectorAll('.anim-title').forEach(title => {
        const content = title.textContent;
        title.textContent = '';

        const span = document.createElement('span');
        span.textContent = content;
        title.appendChild(span);
    });
}
