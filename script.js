// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const supabaseUrl = 'https://kllwutyulbppgqgwydno.supabase.co' 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbHd1dHl1bGJwcGdxZ3d5ZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODQ1MzUsImV4cCI6MjA4NDA2MDUzNX0.ohqUm1pVR9FtWagNie6u8TiNmGOuH78H7WkIKMm2ALM' 
const sb = supabase.createClient(supabaseUrl, supabaseKey)

// ค่า Config ต่างๆ แยกออกมาให้แก้ง่าย
const CONFIG = {
    defaultImg: 'https://via.placeholder.com/300',
    headerImg: 'https://via.placeholder.com/1200x400?text=Victorian+Era+Campaign',
    stats: [
        { label: 'STR', key: 'str', mod: 'str_mod' },
        { label: 'AGI', key: 'agi', mod: 'agi_mod' },
        { label: 'INT', key: 'int_stat', mod: 'int_mod' },
        { label: 'DEX', key: 'dex', mod: 'dex_mod' },
        { label: 'CON', key: 'con', mod: 'con_mod' },
        { label: 'WIS', key: 'wis', mod: 'wis_mod' },
        { label: 'CHA', key: 'cha', mod: 'cha_mod' }
    ],
    skills: {
        athletics: 'Athletics (กรีฑา)', acrobatics: 'Acrobatics (กายกรรม)', sleight_of_hand: 'Sleight of Hand (มือไว)',
        stealth: 'Stealth (ลอบเร้น)', arcana: 'Arcana (เวทมนตร์)', history: 'History (ประวัติศาสตร์)',
        investigation: 'Investigation (สืบสวน)', nature: 'Nature (ธรรมชาติ)', religion: 'Religion (ศาสนา)',
        animal_handling: 'Animal Handling (คุมสัตว์)', insight: 'Insight (หยั่งรู้)', medicine: 'Medicine (การแพทย์)',
        perception: 'Perception (การรับรู้)', survival: 'Survival (เอาตัวรอด)', deception: 'Deception (หลอกลวง)',
        intimidation: 'Intimidation (ข่มขู่)', performance: 'Performance (การแสดง)', persuasion: 'Persuasion (ชักจูง)'
    }
}

const { createApp, ref, computed, onMounted } = Vue

createApp({
    setup() {
        // ==========================================
        // 2. STATE MANAGEMENT
        // ==========================================
        
        // System State
        const session = ref(null)
        const loading = ref(false)
        const currentView = ref('dashboard')
        const toasts = ref([])
        
        // Data State
        const currentUser = ref(null)
        const players = ref([])
        const enemies = ref([])
        
        // UI Inputs
        const email = ref('')
        const password = ref('')

        // Selection & Details
        const selectedCharacter = ref(null)
        const selectedSkills = ref({})

        // Modals Control
        const modals = ref({
            create: false,
            edit: false,
            grant: false,
            upgrade: false,
            confirm: false,
            embed: false
        })

        // Forms Data
        const modalType = ref('player') // 'player' | 'enemy'
        const editTab = ref('general')
        
        const form = ref({})           // สำหรับ Create/Edit
        const formSkills = ref({})     // สำหรับ Edit Skills
        const upgradeForm = ref({})    // สำหรับ Upgrade
        const grantData = ref({ target: null, amount: 0 }) // สำหรับ Grant SP
        const embedCode = ref('')      // สำหรับ Embed
        const confirmData = ref({ title: '', message: '', type: 'info', onConfirm: null, confirmText: 'ยืนยัน' }) // สำหรับ Confirm

        // ==========================================
        // 3. COMPUTED PROPERTIES
        // ==========================================
        const isAdmin = computed(() => ['dungeon_master', 'assistant'].includes(currentUser.value?.role))
        const isSuperAdmin = computed(() => currentUser.value?.role === 'dungeon_master')
        const headerImg = ref(CONFIG.headerImg)

        // ==========================================
        // 4. HELPER FUNCTIONS
        // ==========================================
        
        function roleLabel(role) {
            const map = { 'dungeon_master': 'ผู้คุมกฎ (DM)', 'assistant': 'ผู้ช่วย (Assistant)' }
            return map[role] || 'ผู้เล่น (Player)'
        }

        function showToast(msg, type = 'success', title = 'แจ้งเตือน') {
            const id = Date.now()
            toasts.value.push({ id, msg, type, title })
            setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 3000)
        }

        function calculateModifier(statKey, targetForm = form.value) {
            const config = CONFIG.stats.find(s => s.key === statKey)
            if (config) {
                const score = targetForm[statKey] || 10
                targetForm[config.mod] = Math.floor((score - 10) / 2)
            }
        }

        // ==========================================
        // 5. CORE ACTIONS (Auth & Data)
        // ==========================================

        async function handleLogin() {
            if(loading.value) return;
            loading.value = true
            const { error } = await sb.auth.signInWithPassword({ email: email.value, password: password.value })
            if (error) showToast(error.message, 'error', 'Login Failed')
            else showToast("ยินดีต้อนรับสู่โลกวิคตอเรียน", 'success', 'Login Success')
            loading.value = false
        }

        async function handleLogout() {
            await sb.auth.signOut()
            session.value = null
            currentUser.value = null
        }

        async function fetchData() {
            loading.value = true
            const { data: { user } } = await sb.auth.getUser()
            if (user) {
                // Fetch Current User
                let { data } = await sb.from('players').select('*').eq('auth_id', user.id).single()
                currentUser.value = data || { role: 'guest', character_name: 'Unknown' }
                
                // Fetch All Lists
                let { data: pData } = await sb.from('players').select('*').order('character_name')
                players.value = pData || []
                let { data: eData } = await sb.from('enemies').select('*').order('character_name')
                enemies.value = eData || []
            }
            loading.value = false
        }

        async function showFullDetail(char, type = 'player') {
            if(loading.value) return;
            selectedCharacter.value = char
            let table = type === 'player' ? 'player_skills' : 'enemy_skills'
            let idCol = type === 'player' ? 'player_id' : 'enemy_id'
            
            let { data } = await sb.from(table).select('*').eq(idCol, char.id).single()
            if (data) {
                const { [idCol]: _, id, ...skills } = data
                selectedSkills.value = skills
            } else {
                selectedSkills.value = {}
            }
        }

        // ==========================================
        // 6. CRUD ACTIONS (Create, Edit, Delete)
        // ==========================================

        function openCreateModal(type) {
            modalType.value = type
            form.value = { 
                name: '', character_name: '', pathways: '', sequence: '', 
                hp: 10, role: 'player', status: 'active', 
                character_img_url: CONFIG.defaultImg, skill_points: 0 
            }
            modals.value.create = true
        }

        async function submitCreate() {
            if(loading.value) return;
            loading.value = true
            
            let table = modalType.value === 'player' ? 'players' : 'enemies'
            const { data, error } = await sb.from(table).insert([form.value]).select()
            
            if (!error && data.length > 0) {
                // Auto create empty skills
                let skillTable = modalType.value === 'player' ? 'player_skills' : 'enemy_skills'
                let idCol = modalType.value === 'player' ? 'player_id' : 'enemy_id'
                await sb.from(skillTable).insert([{ [idCol]: data[0].id }])
                
                showToast("สร้างตัวละครสำเร็จ", 'success')
                modals.value.create = false
                fetchData()
            } else {
                showToast(error?.message || 'Error', 'error')
            }
            loading.value = false
        }

        async function openEditModal(char, type) {
            modalType.value = type
            editTab.value = 'general'
            form.value = { ...char } // Clone Data
            
            loading.value = true
            let skillTable = type === 'player' ? 'player_skills' : 'enemy_skills'
            let idCol = type === 'player' ? 'player_id' : 'enemy_id'
            let { data } = await sb.from(skillTable).select('*').eq(idCol, char.id).single()
            
            formSkills.value = data ? (({ [idCol]: _, id, ...rest }) => rest)(data) : {}
            loading.value = false
            modals.value.edit = true
        }

        async function submitEdit() {
            if(loading.value) return;
            loading.value = true
            
            let table = modalType.value === 'player' ? 'players' : 'enemies'
            let skillTable = modalType.value === 'player' ? 'player_skills' : 'enemy_skills'
            let idCol = modalType.value === 'player' ? 'player_id' : 'enemy_id'

            let { error: err1 } = await sb.from(table).update(form.value).eq('id', form.value.id)
            let { error: err2 } = await sb.from(skillTable).update(formSkills.value).eq(idCol, form.value.id)

            if (!err1 && !err2) {
                showToast("บันทึกข้อมูลสำเร็จ", 'success')
                modals.value.edit = false
                fetchData()
            } else {
                showToast((err1?.message || err2?.message), 'error')
            }
            loading.value = false
        }

        // ==========================================
        // 7. FEATURE ACTIONS (Upgrade, Grant, Status, Embed)
        // ==========================================

        // --- Upgrade ---
        function openUpgradeModal(player) {
            if(player.skill_points <= 0) { showToast("ไม่มีแต้ม SP", 'error'); return; }
            upgradeForm.value = { 
                id: player.id, remainingSP: player.skill_points,
                ...Object.fromEntries(CONFIG.stats.map(s => [s.key, player[s.key]])),
                ...Object.fromEntries(CONFIG.stats.map(s => [s.mod, player[s.mod]]))
            }
            modals.value.upgrade = true
        }

        function increaseStat(statKey) {
            if(upgradeForm.value.remainingSP > 0) {
                upgradeForm.value[statKey]++
                upgradeForm.value.remainingSP--
                calculateModifier(statKey, upgradeForm.value)
            } else {
                showToast("SP หมดแล้ว", 'error')
            }
        }

        async function submitUpgrade() {
            if(loading.value) return;
            loading.value = true
            
            const updatePayload = { skill_points: upgradeForm.value.remainingSP }
            CONFIG.stats.forEach(s => {
                updatePayload[s.key] = upgradeForm.value[s.key]
                updatePayload[s.mod] = upgradeForm.value[s.mod]
            })

            const { error } = await sb.from('players').update(updatePayload).eq('id', upgradeForm.value.id)
            if (!error) {
                showToast("อัปเกรดสำเร็จ!", 'success')
                modals.value.upgrade = false
                fetchData()
            } else {
                showToast(error.message, 'error')
            }
            loading.value = false
        }

        // --- Grant SP ---
        function openGrantModal(player) {
            grantData.value = { target: player, amount: 0 }
            modals.value.grant = true
        }

        async function submitGrant() {
            if(loading.value || grantData.value.amount <= 0) return;
            loading.value = true
            const newPoints = (grantData.value.target.skill_points || 0) + grantData.value.amount
            const { error } = await sb.from('players').update({ skill_points: newPoints }).eq('id', grantData.value.target.id)
            
            if(!error) {
                showToast(`มอบ ${grantData.value.amount} SP แล้ว`, 'success')
                modals.value.grant = false
                fetchData()
            } else {
                showToast(error.message, 'error')
            }
            loading.value = false
        }

        // --- Change Status ---
        function changeStatus(id, newStatus) {
            modals.value.confirm = {
                title: 'เปลี่ยนสถานะ',
                message: `ต้องการเปลี่ยนสถานะเป็น "${newStatus.toUpperCase()}" ใช่หรือไม่?`,
                type: 'info',
                confirmText: 'ยืนยัน',
                onConfirm: async () => {
                    modals.value.confirm = null // Close modal
                    loading.value = true
                    const { error } = await sb.from('players').update({ status: newStatus }).eq('id', id)
                    if (!error) { showToast("สถานะเปลี่ยนแล้ว", 'success'); fetchData() }
                    else showToast("เกิดข้อผิดพลาด", 'error')
                    loading.value = false
                }
            }
        }

        // --- Delete ---
        function confirmDelete(id, type) {
            modals.value.confirm = {
                title: 'ยืนยันการลบ',
                message: 'ข้อมูลจะหายไปถาวร ยืนยันที่จะลบ?',
                type: 'delete',
                confirmText: 'ลบทิ้ง',
                onConfirm: async () => {
                    modals.value.confirm = null
                    loading.value = true
                    let skillTable = type === 'player' ? 'player_skills' : 'enemy_skills'
                    let idCol = type === 'player' ? 'player_id' : 'enemy_id'
                    let mainTable = type === 'player' ? 'players' : 'enemies'
                    
                    await sb.from(skillTable).delete().eq(idCol, id)
                    await sb.from(mainTable).delete().eq('id', id)
                    showToast("ลบข้อมูลสำเร็จ", 'success')
                    fetchData()
                    loading.value = false
                }
            }
        }

        // --- Embed ---
        function openEmbedModal(player) {
            const cardUrl = `${window.location.origin}/card.html?id=${player.id}`
            embedCode.value = `<iframe src="${cardUrl}" width="350" height="550" style="border:none; border-radius: 8px; overflow:hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" title="${player.character_name}"></iframe>`
            modals.value.embed = true
        }

        function copyEmbedCode() {
            navigator.clipboard.writeText(embedCode.value).then(() => showToast("คัดลอกแล้ว", "success"))
        }

        // ==========================================
        // 8. INIT & RETURN
        // ==========================================
        onMounted(() => {
            sb.auth.getSession().then(({ data }) => {
                session.value = data.session
                if (session.value) fetchData()
            })
            sb.auth.onAuthStateChange((_event, _session) => {
                session.value = _session
                if (_session) fetchData()
            })
        })

        return {
            // Config & State
            statsConfig: CONFIG.stats, skillLabels: CONFIG.skills, headerImg,
            session, loading, toasts, currentUser, currentView,
            players, enemies, isAdmin, isSuperAdmin, roleLabel,
            
            // Login
            email, password, handleLogin, handleLogout,
            
            // Views & Modals
            selectedCharacter, selectedSkills, showFullDetail,
            modals, modalType, editTab,
            
            // Forms
            form, formSkills, upgradeForm, grantData, embedCode,
            
            // Actions
            openCreateModal, submitCreate,
            openEditModal, submitEdit, calculateModifier,
            openUpgradeModal, increaseStat, submitUpgrade,
            openGrantModal, submitGrant,
            changeStatus, confirmDelete,
            openEmbedModal, copyEmbedCode
        }
    }
}).mount('#app')