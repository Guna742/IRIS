/**
 * IrisModal
 * A custom Promise-based replacement for window.alert, window.confirm, and window.prompt.
 */

class IrisModal {
    static init() {
        if (document.getElementById('iris-modal-root')) return;

        const root = document.createElement('div');
        root.id = 'iris-modal-root';
        root.className = 'iris-modal-overlay';
        root.innerHTML = `
            <div class="iris-modal-box">
                <div class="iris-modal-header">
                    <div class="iris-modal-icon" id="iris-modal-icon"></div>
                    <h3 class="iris-modal-title" id="iris-modal-title"></h3>
                </div>
                <div class="iris-modal-body" id="iris-modal-body"></div>
                <input type="text" class="iris-modal-input" id="iris-modal-input" style="display: none;" />
                <div class="iris-modal-actions" id="iris-modal-actions"></div>
            </div>
        `;
        document.body.appendChild(root);

        // Bind escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._currentReject && root.classList.contains('show')) {
                this.close();
                this._currentReject(new Error('Cancelled'));
            } else if (e.key === 'Enter' && this._currentResolve && root.classList.contains('show')) {
                const input = document.getElementById('iris-modal-input');
                if (input.style.display !== 'none') {
                    this.close();
                    this._currentResolve(input.value);
                }
            }
        });
    }

    static open({ type, title, message, defaultValue = '', isDanger = false }) {
        this.init();
        const root = document.getElementById('iris-modal-root');
        const iconEl = document.getElementById('iris-modal-icon');
        const titleEl = document.getElementById('iris-modal-title');
        const bodyEl = document.getElementById('iris-modal-body');
        const inputEl = document.getElementById('iris-modal-input');
        const actionsEl = document.getElementById('iris-modal-actions');

        // Reset
        iconEl.className = 'iris-modal-icon ' + type;
        inputEl.style.display = 'none';
        inputEl.value = '';
        actionsEl.innerHTML = '';

        // Configure based on type
        if (type === 'alert') {
            iconEl.innerHTML = '<span class="material-symbols-outlined">info</span>';
            titleEl.textContent = title || 'Information';
        } else if (type === 'confirm') {
            iconEl.innerHTML = '<span class="material-symbols-outlined">help</span>';
            titleEl.textContent = title || 'Confirm';
            if (isDanger) {
                iconEl.style.color = 'var(--clr-danger, #ef4444)';
                iconEl.style.background = 'rgba(239, 68, 68, 0.15)';
            }
        } else if (type === 'prompt') {
            iconEl.innerHTML = '<span class="material-symbols-outlined">edit_square</span>';
            titleEl.textContent = title || 'Input Required';
            inputEl.style.display = 'block';
            inputEl.value = defaultValue;
        }

        bodyEl.innerHTML = message;

        return new Promise((resolve, reject) => {
            this._currentResolve = resolve;
            this._currentReject = reject;

            const handleClose = (val) => {
                this.close();
                resolve(val);
            };

            if (type === 'alert') {
                const btnOk = document.createElement('button');
                btnOk.className = 'iris-modal-btn iris-modal-btn-confirm';
                btnOk.textContent = 'OK';
                btnOk.onclick = () => handleClose(true);
                actionsEl.appendChild(btnOk);
            } else if (type === 'confirm') {
                const btnCancel = document.createElement('button');
                btnCancel.className = 'iris-modal-btn iris-modal-btn-cancel';
                btnCancel.textContent = 'Cancel';
                btnCancel.onclick = () => handleClose(false);

                const btnOk = document.createElement('button');
                btnOk.className = `iris-modal-btn ${isDanger ? 'iris-modal-btn-danger' : 'iris-modal-btn-confirm'}`;
                btnOk.textContent = isDanger ? 'Delete' : 'Confirm';
                btnOk.onclick = () => handleClose(true);

                actionsEl.appendChild(btnCancel);
                actionsEl.appendChild(btnOk);
            } else if (type === 'prompt') {
                const btnCancel = document.createElement('button');
                btnCancel.className = 'iris-modal-btn iris-modal-btn-cancel';
                btnCancel.textContent = 'Cancel';
                btnCancel.onclick = () => handleClose(null);

                const btnOk = document.createElement('button');
                btnOk.className = 'iris-modal-btn iris-modal-btn-confirm';
                btnOk.textContent = 'Submit';
                btnOk.onclick = () => handleClose(inputEl.value);

                actionsEl.appendChild(btnCancel);
                actionsEl.appendChild(btnOk);
            }

            // Show animation
            requestAnimationFrame(() => {
                root.classList.add('show');
                if (type === 'prompt') {
                    inputEl.focus();
                } else {
                    const confirmBtn = actionsEl.querySelector('.iris-modal-btn-confirm') || actionsEl.querySelector('.iris-modal-btn-danger');
                    if (confirmBtn) confirmBtn.focus();
                }
            });
        });
    }

    static close() {
        const root = document.getElementById('iris-modal-root');
        if (root) {
            root.classList.remove('show');
        }
        this._currentResolve = null;
        this._currentReject = null;
    }

    static alert(message, title) {
        return this.open({ type: 'alert', message, title });
    }

    static confirm(message, title, isDanger = false) {
        // Simple heuristic: if message contains "delete" or "remove", make it danger
        const looksDangerous = isDanger || /delete|remove|critical/i.test(message);
        return this.open({ type: 'confirm', message, title, isDanger: looksDangerous });
    }

    static prompt(message, defaultValue = '', title) {
        return this.open({ type: 'prompt', message, defaultValue, title });
    }
}

window.IrisModal = IrisModal;
