document.addEventListener("DOMContentLoaded", async () => {
    // Primary Elements
    const treeContainer = document.querySelector('.tree-container');
    const treeCanvasWrapper = document.getElementById('tree-canvas');
    const mountPoint = document.getElementById('tree-mount-point');

    // State
    let allMembers = [];
    let currentParentId = null;
    let currentEditId = null;
    let panzoomInstance = null;

    // --- 1. SIDEBAR & NAVIGATION ---
    const sidebar = document.getElementById("desktop-sidebar");
    const toggleBtn = document.getElementById("sidebar-toggle");
    if (toggleBtn) toggleBtn.addEventListener("click", () => sidebar.classList.toggle("collapsed"));

    const dateElement = document.getElementById("current-date");
    if (dateElement) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = new Date().toLocaleDateString('vi-VN', options);
    }

    // Mobile Popup
    const functionsTrigger = document.getElementById("mobile-functions-trigger");
    const functionsPopup = document.getElementById("functions-popup");
    const closePopupBtn = document.getElementById("close-functions");
    if (functionsTrigger && functionsPopup) {
        functionsTrigger.addEventListener("click", () => functionsPopup.classList.add("active"));
    }
    if (closePopupBtn) closePopupBtn.addEventListener("click", () => functionsPopup.classList.remove("active"));
    if (functionsPopup) functionsPopup.addEventListener("click", (e) => { if (e.target === functionsPopup) functionsPopup.classList.remove("active"); });

    // --- 2. DATA MANAGEMENT (Local JSON File) ---

    // Load from localStorage first (so edits persist across refresh), fallback to members.json
    async function loadMembers() {
        // Always try to get latest from server first in online mode
        try {
            const res = await fetch('data/members.json?v=' + Date.now());
            if (res.ok) {
                const data = await res.json();
                // If server data exists, update local storage but keep local as backup
                localStorage.setItem('gia-pha-members', JSON.stringify(data));
                return data;
            }
        } catch (e) {}

        const saved = localStorage.getItem('gia-pha-members');
        if (saved) {
            try { return JSON.parse(saved); } catch(e) {}
        }
        return [];
    }

    function saveMembers(members) {
        localStorage.setItem('gia-pha-members', JSON.stringify(members));
        allMembers = members;
    }

    // --- 2.1 ONLINE SYNC & CLOUDFLARE ---

    async function saveOnline() {
        const btn = document.getElementById('save-online-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner-gap animate-spin"></i> <span class="link-name">Đang lưu...</span>';
        btn.style.pointerEvents = 'none';

        try {
            const res = await fetch('/api/save-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath: 'data/members.json',
                    data: allMembers
                })
            });
            const result = await res.json();
            if (result.success) {
                alert('🎉 Đã cập nhật thành công lên Website!');
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            alert('Lỗi khi lưu Online: ' + error.message);
        } finally {
            btn.innerHTML = originalHtml;
            btn.style.pointerEvents = 'auto';
        }
    }

    document.getElementById('save-online-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        saveOnline();
    });

    const avatarInput = document.getElementById('m-avatar-input');
    const avatarPreview = document.getElementById('form-avatar-preview');
    const avatarUrlHidden = document.getElementById('m-avatar-url');

    avatarInput?.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Preview locally
        const reader = new FileReader();
        reader.onload = (ev) => {
            avatarPreview.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    async function uploadAvatarToCloudflare(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = e.target.result.split(',')[1];
                try {
                    const res = await fetch('/api/upload-media', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fileName: file.name,
                            fileType: file.type,
                            base64Data: base64Data
                        })
                    });
                    const result = await res.json();
                    if (result.success) resolve(result.url);
                    else reject(result.message);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // --- 3. TREE RENDERING ---
    async function loadTree() {
        allMembers = await loadMembers();

        if (!allMembers.length) {
            mountPoint.innerHTML = `
                <div style="padding: 30px; text-align: center; background: rgba(255,255,255,0.7); border-radius: 20px; max-width: 400px; margin: 60px auto; backdrop-filter: blur(10px);">
                    <i class="ph ph-tree-evergreen" style="font-size: 48px; color: var(--primary);"></i>
                    <h3 style="margin: 16px 0 8px; font-family: 'Playfair Display', serif;">Chưa có thành viên nào</h3>
                    <p style="color: var(--text-muted); font-size: 14px;">Sử dụng nút <strong style="color:var(--primary)">+</strong> để thêm tổ tiên đầu tiên cho gia phả.</p>
                    <button id="add-root-btn" style="margin-top: 20px; padding: 12px 28px; background: var(--primary); color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer;">
                        <i class="ph ph-plus"></i> Thêm thành viên đầu tiên
                    </button>
                </div>`;
            document.getElementById('add-root-btn')?.addEventListener('click', () => {
                currentParentId = null;
                currentEditId = null;
                openMemberModal('Thêm tổ tiên (Đời 1)');
            });
            return;
        }

        const roots = allMembers.filter(m => !m.father_id && !m.mother_id);
        mountPoint.innerHTML = '';
        const rootUl = document.createElement('ul');
        roots.forEach(root => rootUl.appendChild(renderNode(root)));
        mountPoint.appendChild(rootUl);

        setTimeout(() => {
            drawGenerationMarkers();
            initPanzoom();
        }, 150);
    }

    function renderNode(member) {
        const li = document.createElement('li');
        const isFemale = member.gender === 'female';
        const avatarHtml = member.avatar
            ? `<img src="${member.avatar}" class="card-avatar" alt="Avatar" onerror="this.remove()">`
            : '';

        const card = document.createElement('div');
        card.className = `member-card ${isFemale ? 'female-node' : ''}`;
        card.setAttribute('data-id', member.id);
        card.setAttribute('data-gen', member.generation || 1);
        card.innerHTML = `
            <div class="card-actions">
                <button class="action-btn btn-add" title="Thêm con" data-id="${member.id}"><i class="ph ph-plus"></i></button>
                <button class="action-btn btn-edit" title="Sửa" data-id="${member.id}"><i class="ph ph-pencil-simple"></i></button>
                <button class="action-btn btn-delete" title="Xóa" data-id="${member.id}"><i class="ph ph-trash"></i></button>
            </div>
            ${avatarHtml}
            <div class="member-info">
                <h4 class="member-name">${member.full_name || ''}</h4>
                <p class="member-generation">${member.notes || ''}</p>
                <p class="member-life">${member.birth_date || '...'} – ${member.death_date || (member.is_alive ? 'nay' : '...')}</p>
            </div>`;
        li.appendChild(card);

        const children = allMembers.filter(m => m.father_id === member.id || m.mother_id === member.id);
        if (children.length > 0) {
            const childUl = document.createElement('ul');
            children.forEach(child => childUl.appendChild(renderNode(child)));
            li.appendChild(childUl);
        }

        return li;
    }

    // --- 4. PANZOOM ---
    function initPanzoom() {
        if (panzoomInstance) { try { panzoomInstance.destroy(); } catch(e) {} }
        if (!treeCanvasWrapper || !treeContainer || typeof Panzoom === 'undefined') return;
        panzoomInstance = Panzoom(treeContainer, { maxScale: 3, minScale: 0.1, step: 0.1, cursor: 'grab' });
        const onDown = (e) => { if (e.target.closest('button') || e.target.closest('.member-card')) return; panzoomInstance.handleDown(e); };
        treeCanvasWrapper.addEventListener('pointerdown', onDown);
        document.addEventListener('pointermove', (e) => panzoomInstance.handleMove(e));
        document.addEventListener('pointerup', (e) => panzoomInstance.handleUp(e));
        treeCanvasWrapper.addEventListener('wheel', panzoomInstance.zoomWithWheel);
        document.getElementById('zoom-in')?.addEventListener('click', panzoomInstance.zoomIn);
        document.getElementById('zoom-out')?.addEventListener('click', panzoomInstance.zoomOut);
        document.getElementById('zoom-reset')?.addEventListener('click', () => panzoomInstance.reset());
    }

    // --- 5. GENERATION MARKERS ---
    function drawGenerationMarkers() {
        const genAxis = document.getElementById('gen-axis');
        if (!genAxis || !mountPoint) return;
        genAxis.innerHTML = '';
        let rootUl = mountPoint.querySelector('ul');
        if (!rootUl) return;
        let currentGen = [rootUl.querySelector('li')];
        let depth = 1;
        while (currentGen.length > 0 && currentGen[0]) {
            const firstCard = currentGen[0].querySelector('.member-card');
            if (firstCard) {
                let offsetTop = 0, elem = firstCard;
                while (elem && elem !== treeContainer) { offsetTop += elem.offsetTop; elem = elem.offsetParent; }
                const marker = document.createElement('div');
                marker.className = 'gen-marker';
                marker.textContent = `Đời ${depth}`;
                marker.style.top = `${offsetTop + firstCard.offsetHeight / 2}px`;
                marker.style.transform = 'translateY(-50%)';
                const d = depth;
                marker.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const wasActive = marker.classList.contains('active-gen');
                    resetAllHighlights();
                    if (!wasActive) {
                        marker.classList.add('active-gen');
                        document.querySelectorAll(`.member-card[data-gen="${d}"]`).forEach(c => c.classList.add('highlight'));
                    }
                });
                genAxis.appendChild(marker);
            }
            let nextGen = [];
            currentGen.forEach(li => {
                if (!li) return;
                Array.from(li.children).filter(el => el.tagName === 'UL').forEach(ul => {
                    nextGen.push(...Array.from(ul.children).filter(el => el.tagName === 'LI'));
                });
            });
            currentGen = nextGen;
            depth++;
        }
    }

    // --- 6. INTERACTION & QUICK INFO ---
    const quickInfoPanel = document.getElementById('quick-info-panel');

    function showQuickInfo(card) {
        if (!quickInfoPanel) return;
        const id = card.getAttribute('data-id');
        const member = allMembers.find(m => m.id === id);
        if (!member) return;
        document.getElementById('qi-name').textContent = member.full_name;
        document.getElementById('qi-dates').textContent = `${member.birth_date || '?'} – ${member.death_date || (member.is_alive ? 'nay' : '?')}`;
        document.getElementById('qi-gen').textContent = `Đời ${member.generation || '?'}`;
        const children = allMembers.filter(m => m.father_id === id || m.mother_id === id);
        document.getElementById('qi-children').textContent = children.length;
        const parent = allMembers.find(m => m.id === member.father_id || m.id === member.mother_id);
        if (parent) {
            const siblings = allMembers.filter(m => (m.father_id === parent.id || m.mother_id === parent.id) && m.id !== id);
            document.getElementById('qi-older').textContent = siblings.length;
            document.getElementById('qi-younger').textContent = 0;
        } else {
            document.getElementById('qi-older').textContent = 0;
            document.getElementById('qi-younger').textContent = 0;
        }
        quickInfoPanel.classList.add('active');
    }

    function hideQuickInfo() { quickInfoPanel?.classList.remove('active'); }

    function highlightAncestors(card) {
        let currentId = card.getAttribute('data-id');
        while (currentId) {
            const el = document.querySelector(`.member-card[data-id="${currentId}"]`);
            if (el) el.classList.add('highlight');
            const member = allMembers.find(m => m.id === currentId);
            currentId = member ? (member.father_id || member.mother_id || null) : null;
        }
    }

    function resetAllHighlights() {
        document.querySelectorAll('.member-card').forEach(c => c.classList.remove('highlight'));
        document.querySelectorAll('.gen-marker').forEach(m => m.classList.remove('active-gen'));
        hideQuickInfo();
    }

    treeContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.action-btn');
        const card = e.target.closest('.member-card');
        if (btn) {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const member = allMembers.find(m => m.id === id);
            if (btn.classList.contains('btn-add')) {
                currentParentId = id;
                currentEditId = null;
                memberForm.reset();
                openMemberModal(`Thêm con cho: ${member.full_name}`);
            } else if (btn.classList.contains('btn-edit')) {
                currentEditId = id;
                currentParentId = null;
                fillModal(member);
                openMemberModal('Chỉnh sửa thông tin');
            } else if (btn.classList.contains('btn-delete')) {
                currentEditId = id;
                document.getElementById('delete-member-name').textContent = member.full_name;
                deleteModal.classList.add('active');
            }
            return;
        }
        if (card) {
            e.stopPropagation();
            const isHighlighted = card.classList.contains('highlight');
            resetAllHighlights();
            if (!isHighlighted) { highlightAncestors(card); showQuickInfo(card); } else hideQuickInfo();
        }
    });

    document.querySelector('.tree-viewport-wrapper')?.addEventListener('click', (e) => {
        if (e.target.id === 'tree-canvas' || e.target === e.currentTarget) resetAllHighlights();
    });

    // --- 7. MODALS ---
    const memberModal = document.getElementById('member-modal');
    const deleteModal = document.getElementById('delete-modal');
    const memberForm = document.getElementById('member-form');

    function openMemberModal(title) {
        document.getElementById('modal-title').textContent = title;
        memberModal.classList.add('active');
    }

    function fillModal(member) {
        document.getElementById('m-name').value = member.full_name || '';
        document.getElementById('m-note').value = member.notes || '';
        document.getElementById('m-birth').value = member.birth_date || '';
        document.getElementById('m-death').value = member.death_date || '';
        document.getElementById('m-gender').value = member.gender || 'male';
        
        // Handle Avatar
        avatarUrlHidden.value = member.avatar || '';
        avatarPreview.src = member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.full_name || 'User')}&background=eee&color=999`;
        avatarInput.value = ''; // Reset file input
    }

    function closeAllModals() {
        memberModal.classList.remove('active');
        deleteModal.classList.remove('active');
        currentEditId = null;
        currentParentId = null;
    }

    document.querySelectorAll('.close-modal, .btn-cancel').forEach(btn => btn.addEventListener('click', closeAllModals));

    // Generate simple unique ID
    function genId() { return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

    memberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const saveBtn = memberForm.querySelector('.btn-save');
        const originalBtnText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Đang xử lý...';

        try {
            let finalAvatarUrl = avatarUrlHidden.value;
            
            // If user selected a new file, upload it first
            if (avatarInput.files && avatarInput.files[0]) {
                saveBtn.textContent = 'Đang tải ảnh...';
                finalAvatarUrl = await uploadAvatarToCloudflare(avatarInput.files[0]);
            }

            const updated = [...allMembers];
            const formData = {
                full_name: document.getElementById('m-name').value.trim(),
                notes: document.getElementById('m-note').value.trim(),
                birth_date: document.getElementById('m-birth').value.trim(),
                death_date: document.getElementById('m-death').value.trim(),
                gender: document.getElementById('m-gender').value,
                avatar: finalAvatarUrl
            };
            if (currentEditId) {
                const idx = updated.findIndex(m => m.id === currentEditId);
                if (idx > -1) updated[idx] = { ...updated[idx], ...formData };
            } else if (currentParentId !== undefined) {
                const parent = updated.find(m => m.id === currentParentId);
                const newMember = {
                    id: genId(),
                    ...formData,
                    generation: currentParentId ? (parent?.generation || 0) + 1 : 1,
                    father_id: (currentParentId && parent?.gender === 'male') ? currentParentId : null,
                    mother_id: (currentParentId && parent?.gender === 'female') ? currentParentId : null,
                    is_alive: !formData.death_date,
                };
                updated.push(newMember);
            }
            saveMembers(updated);
            closeAllModals();
            loadTree();
        } catch (err) {
            alert('Lỗi: ' + err);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalBtnText;
        }
    });

    document.getElementById('confirm-delete-btn')?.addEventListener('click', () => {
        if (!currentEditId) return;
        // Also remove all descendants
        function collectDescendants(id) {
            const result = [id];
            allMembers.filter(m => m.father_id === id || m.mother_id === id).forEach(child => {
                result.push(...collectDescendants(child.id));
            });
            return result;
        }
        const toRemove = new Set(collectDescendants(currentEditId));
        saveMembers(allMembers.filter(m => !toRemove.has(m.id)));
        closeAllModals();
        loadTree();
    });

    // --- 8. DISPLAY SETTINGS ---
    const settingsModal = document.getElementById('settings-modal');
    document.getElementById('open-settings')?.addEventListener('click', () => {
        generateSizeSliders();
        settingsModal.classList.add('active');
    });
    document.getElementById('close-settings-modal')?.addEventListener('click', () => settingsModal.classList.remove('active'));

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
        });
    });

    // Colors & Backgrounds
    document.getElementById('set-bg-color')?.addEventListener('input', (e) => {
        document.body.style.backgroundColor = e.target.value;
        document.body.className = document.body.className.replace(/bg-\w+/g, '').trim();
    });
    document.getElementById('set-card-color')?.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--node-bg', e.target.value);
    });
    document.querySelectorAll('.bg-preset').forEach(preset => {
        preset.addEventListener('click', () => {
            const bgType = preset.getAttribute('data-bg');
            document.body.className = document.body.className.replace(/bg-\w+/g, '').trim();
            if (bgType !== 'none') document.body.classList.add('bg-' + bgType);
        });
    });

    // Text orientation
    document.querySelectorAll('input[name="text-orient"]').forEach(input => {
        input.addEventListener('change', (e) => {
            if (e.target.value === 'vertical') treeContainer.classList.add('vertical-text-mode');
            else treeContainer.classList.remove('vertical-text-mode');
        });
    });

    // Generation Size Sliders
    function updateGenSize(gen) {
        const parent = document.querySelector(`.gen-control-block[data-gen="${gen}"]`);
        if (!parent) return;
        const orient = parent.querySelector('.btn-orient.active')?.getAttribute('data-orient') || 'ngang';
        const ratio = parent.querySelector('.btn-ratio.active')?.getAttribute('data-ratio') || '1:1';
        const scale = parent.querySelector('.scale-slider').value / 100;
        const fontSize = (parent.querySelector('.font-slider')?.value || 100) / 100;
        const lineHeight = (parent.querySelector('.line-height-slider')?.value || 120) / 100;
        const showNotes = parent.querySelector('.toggle-notes-gen')?.checked ?? true;
        const showDates = parent.querySelector('.toggle-dates-gen')?.checked ?? true;

        const base = 130;
        let multiplier = ratio === '1:2' ? 2 : ratio === '1:3' ? 3 : 1;
        const sizes = orient === 'doc' ? { w: base, h: base * multiplier } : { w: base * multiplier, h: base };
        const finalW = Math.round(sizes.w * scale);
        const finalH = Math.round(sizes.h * scale);

        document.documentElement.style.setProperty(`--gen-${gen}-w`, finalW + 'px');
        document.documentElement.style.setProperty(`--gen-${gen}-h`, finalH + 'px');
        document.documentElement.style.setProperty(`--gen-${gen}-scale`, scale);
        document.documentElement.style.setProperty(`--gen-${gen}-fs`, fontSize);
        document.documentElement.style.setProperty(`--gen-${gen}-lh`, lineHeight);
        parent.querySelector('.scale-val').textContent = Math.round(scale * 100) + '%';
        if (parent.querySelector('.font-val')) parent.querySelector('.font-val').textContent = Math.round(fontSize * 100) + '%';

        if (!showNotes) treeContainer.classList.add(`hide-gen-${gen}-notes`); else treeContainer.classList.remove(`hide-gen-${gen}-notes`);
        if (!showDates) treeContainer.classList.add(`hide-gen-${gen}-dates`); else treeContainer.classList.remove(`hide-gen-${gen}-dates`);

        const genCards = document.querySelectorAll(`.member-card[data-gen="${gen}"]`);
        genCards.forEach(card => {
            if (orient === 'doc') { card.classList.add('node-vertical-text'); card.classList.remove('node-horizontal-text'); }
            else { card.classList.add('node-horizontal-text'); card.classList.remove('node-vertical-text'); }
        });
    }

    function generateSizeSliders() {
        const sliderContainer = document.getElementById('gen-size-sliders');
        if (!sliderContainer) return;
        sliderContainer.innerHTML = '';
        const maxGen = document.querySelectorAll('.gen-marker').length || 5;
        for (let i = 1; i <= maxGen; i++) {
            const control = document.createElement('div');
            control.className = 'gen-control-block';
            control.setAttribute('data-gen', i);
            control.innerHTML = `
                <div class="gen-header">
                    <span>Thế hệ Đời ${i}</span>
                    <button class="gen-sync-btn" title="Áp dụng cho các đời sau" data-gen="${i}"><i class="ph-bold ph-arrow-fat-line-down"></i></button>
                </div>
                <div class="control-row">
                    <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:5px">Hướng & Tỷ lệ:</label>
                    <div class="ratio-group">
                        <button class="btn-orient active" data-orient="ngang">Ngang</button>
                        <button class="btn-orient" data-orient="doc">Dọc</button>
                        <div style="width:1px;background:#eee;margin:0 5px"></div>
                        <button class="btn-ratio active" data-ratio="1:1">1:1</button>
                        <button class="btn-ratio" data-ratio="1:2">1:2</button>
                        <button class="btn-ratio" data-ratio="1:3">1:3</button>
                    </div>
                </div>
                <div class="control-row">
                    <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:5px">Kích thước:</label>
                    <div class="scale-control"><input type="range" min="50" max="250" value="100" class="scale-slider"><span class="scale-val">100%</span></div>
                </div>
                <div class="control-row">
                    <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:5px">Cỡ chữ:</label>
                    <div class="scale-control"><input type="range" min="50" max="200" value="100" class="font-slider"><span class="font-val">100%</span></div>
                </div>
                <div class="control-row">
                    <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:5px">Dãn dòng:</label>
                    <div class="scale-control"><input type="range" min="10" max="250" value="120" class="line-height-slider"><span class="lh-val">1.2</span></div>
                </div>
                <div class="control-row">
                    <div class="gen-checkbox-group">
                        <label class="gen-check-item"><input type="checkbox" class="toggle-notes-gen" checked><span>Hiện Ghi chú</span></label>
                        <label class="gen-check-item"><input type="checkbox" class="toggle-dates-gen" checked><span>Hiện Năm</span></label>
                    </div>
                </div>`;
            control.querySelectorAll('.btn-orient').forEach(o => o.addEventListener('click', () => { control.querySelectorAll('.btn-orient').forEach(b => b.classList.remove('active')); o.classList.add('active'); updateGenSize(i); }));
            control.querySelectorAll('.btn-ratio').forEach(r => r.addEventListener('click', () => { control.querySelectorAll('.btn-ratio').forEach(b => b.classList.remove('active')); r.classList.add('active'); updateGenSize(i); }));
            control.querySelector('.scale-slider').addEventListener('input', () => updateGenSize(i));
            control.querySelector('.font-slider').addEventListener('input', () => updateGenSize(i));
            control.querySelector('.line-height-slider').addEventListener('input', (e) => { control.querySelector('.lh-val').textContent = (e.target.value / 100).toFixed(1); updateGenSize(i); });
            control.querySelectorAll('.toggle-notes-gen, .toggle-dates-gen').forEach(chk => chk.addEventListener('change', () => updateGenSize(i)));
            control.querySelector('.gen-sync-btn').addEventListener('click', () => {
                const orient = control.querySelector('.btn-orient.active')?.getAttribute('data-orient');
                const ratio = control.querySelector('.btn-ratio.active')?.getAttribute('data-ratio');
                const scale = control.querySelector('.scale-slider').value;
                const fontSize = control.querySelector('.font-slider').value;
                const lineHeight = control.querySelector('.line-height-slider').value;
                const showNotes = control.querySelector('.toggle-notes-gen').checked;
                const showDates = control.querySelector('.toggle-dates-gen').checked;
                for (let j = i + 1; j <= maxGen; j++) {
                    const t = document.querySelector(`.gen-control-block[data-gen="${j}"]`);
                    if (!t) continue;
                    t.querySelectorAll('.btn-orient').forEach(b => { b.classList.remove('active'); if (b.getAttribute('data-orient') === orient) b.classList.add('active'); });
                    t.querySelectorAll('.btn-ratio').forEach(b => { b.classList.remove('active'); if (b.getAttribute('data-ratio') === ratio) b.classList.add('active'); });
                    t.querySelector('.scale-slider').value = scale;
                    t.querySelector('.font-slider').value = fontSize;
                    t.querySelector('.line-height-slider').value = lineHeight;
                    t.querySelector('.lh-val').textContent = (lineHeight / 100).toFixed(1);
                    t.querySelector('.toggle-notes-gen').checked = showNotes;
                    t.querySelector('.toggle-dates-gen').checked = showDates;
                    updateGenSize(j);
                }
            });
            updateGenSize(i);
            sliderContainer.appendChild(control);
        }
    }

    document.getElementById('save-settings')?.addEventListener('click', () => {
        settingsModal.classList.remove('active');
        alert('Cài đặt đã được áp dụng!');
    });
    document.getElementById('reset-settings')?.addEventListener('click', () => {
        if (confirm('Khôi phục về cài đặt gốc?')) location.reload();
    });

    // --- 9. EXPORT DATA ---
    document.getElementById('export-data-btn')?.addEventListener('click', () => {
        const json = JSON.stringify(allMembers, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'members.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    // --- 10. IMPORT DATA ---
    document.getElementById('import-data-btn')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const imported = JSON.parse(ev.target.result);
                    if (Array.isArray(imported)) {
                        saveMembers(imported);
                        loadTree();
                        alert('Nhập dữ liệu thành công!');
                    } else {
                        alert('File JSON không đúng định dạng. Cần là mảng thành viên.');
                    }
                } catch (err) {
                    alert('Lỗi đọc file: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    // --- START ---
    if (document.getElementById('gen-axis')) {
        loadTree();
        window.addEventListener('resize', drawGenerationMarkers);
    }
});
