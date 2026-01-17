// ==========================================
// Main application script (refactored for readability)
// - Preserve original logic and behavior
// - Added section comments and clearer grouping
// ==========================================

/* ==========================================
   1. CONFIGURATION & CONSTANTS
   ========================================== */
const supabaseUrl = 'https://kllwutyulbppgqgwydno.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbHd1dHl1bGJwcGdxZ3d5ZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODQ1MzUsImV4cCI6MjA4NDA2MDUzNX0.ohqUm1pVR9FtWagNie6u8TiNmGOuH78H7WkIKMm2ALM'
const sb = supabase.createClient(supabaseUrl, supabaseKey)

const RANK_GROUPS = ['Low (9-8)', 'Mid (7-5)', 'High (4)', 'Saint (3)', 'Angel (2-1)', 'Deity (0)']

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

/* ==========================================
   2. Vue imports (composition API helpers)
   ========================================== */
const { createApp, ref, computed, onMounted } = Vue

/* ==========================================
   3. Create Vue App
   ========================================== */
createApp({
    setup() {

        /* ------------------------------------------
           3.1 SYSTEM & UI STATE
           ------------------------------------------ */
        // System
        const session = ref(null)
        const loading = ref(false)
        const currentView = ref('dashboard')
        const toasts = ref([])

        // Data Entities
        const currentUser = ref(null)
        const players = ref([])
        const enemies = ref([])
        const pathwaysList = ref([])
        const sequencesList = ref([])

        // Map System
        const mapsList = ref([])
        const mapPositions = ref([])
        const currentMap = ref(null)

        // UI Inputs
        const email = ref('')
        const password = ref('')
        const selectedCharacter = ref(null)
        const selectedSkills = ref({})

        // Core Modals
        const modals = ref({
            create: false, edit: false, grant: false, upgrade: false, confirm: false, embed: false,
            // Economy Modals
            bank: false, transfer: false,
            grantMoney: false, transferMoney: false, item: false
        })

        // Specialized Modals (Magic & Map)
        const modalPathway = ref(false)
        const modalSequence = ref(false)
        const modalMapConfig = ref(false)
        const modalCellDetail = ref(false)
        const modalPlaceEntity = ref(false)

        // Forms
        const modalType = ref('player')
        const editTab = ref('general')
        const form = ref({})
        const formSkills = ref({})
        const upgradeForm = ref({})
        const grantData = ref({ target: null, amount: 0 })
        const embedCode = ref('')

        const formPathway = ref({})
        const formSequence = ref({})
        const formMap = ref({})
        const selectedCell = ref({ x: 1, y: 1, occupants: [] })
        const formPlacement = ref({ player_id: '' })

        /* ------------------------------------------
           3.2 COMPUTED & SIMPLE HELPERS
           ------------------------------------------ */
        const isAdmin = computed(() => ['dungeon_master', 'assistant'].includes(currentUser.value?.role))
        const isSuperAdmin = computed(() => currentUser.value?.role === 'dungeon_master')
        const headerImg = ref(CONFIG.headerImg)

        // Filter other players (exclude current user and hidden)
        const otherPlayers = computed(() => {
            if (!currentUser.value) return []
            return players.value.filter(p => p.id !== currentUser.value.id && p.status !== 'hide')
        })

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

        /* ------------------------------------------
           3.3 PATHWAY / SEQUENCE HELPERS
           ------------------------------------------ */
        function getJobTitle(pathwayName, seqNum) {
            const path = pathwaysList.value.find(p => p.name === pathwayName)
            if (!path) return ''
            const seq = sequencesList.value.find(s => s.pathway_id === path.id && s.seq_number == seqNum)
            return seq ? seq.title : ''
        }

        const availableSequencesForEdit = computed(() => {
            const selectedPathName = form.value.pathways
            if (!selectedPathName) return []
            const path = pathwaysList.value.find(p => p.name === selectedPathName)
            if (!path) return []
            // sort descending, preserve original logic
            return sequencesList.value.filter(s => s.pathway_id === path.id).sort((a, b) => b.seq_number - a.seq_number)
        })

        /* ------------------------------------------
           3.4 MAP HELPERS
           ------------------------------------------ */
        function isUserInMap(mapId) {
            if (!currentUser.value) return false
            return mapPositions.value.some(p => p.map_id === mapId && p.player_id === currentUser.value.id)
        }

        function getOccupants(x, y) {
            if (!currentMap.value) return []
            const positions = mapPositions.value.filter(p => p.map_id === currentMap.value.id && p.pos_x === x && p.pos_y === y)
            return positions.map(pos => {
                const player = players.value.find(pl => pl.id === pos.player_id)
                return player ? { ...player, pos_id: pos.id } : null
            }).filter(Boolean)
        }

        /* ==========================================
           4. AUTH & DATA FETCHING
           ========================================== */

        // Authentication: login/logout
        async function handleLogin() {
            if (loading.value) return
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

        // Fetch primary application data
        async function fetchData() {
            loading.value = true

            // get current authenticated user from supabase
            const { data: { user } } = await sb.auth.getUser()

            // Load magic data first (pathways & sequences)
            let { data: pathData } = await sb.from('pathways').select('*').order('name')
            pathwaysList.value = pathData || []

            let { data: seqData } = await sb.from('sequences').select('*').order('seq_number', { ascending: false })
            sequencesList.value = seqData || []

            // Load maps & positions
            await fetchMaps(false)

            // Only fetch sensitive data for logged-in user
            if (user) {
                // Link currentUser record to auth user
                let { data } = await sb.from('players').select('*').eq('auth_id', user.id).single()
                currentUser.value = data || { role: 'guest', character_name: 'Unknown', money: 0, bank_balance: 0 }

                // If economy module is present, allow it to fetch economy-specific data
                if (economy && economy.fetchEconomyData) {
                    await economy.fetchEconomyData()
                }

                // Load lists of players & enemies for admin screens / lists
                let { data: pData } = await sb.from('players').select('*').order('character_name')
                players.value = pData || []
                let { data: eData } = await sb.from('enemies').select('*').order('character_name')
                enemies.value = eData || []
            }

            loading.value = false
        }

        // Fetch maps and positions (optionally toggles loading)
        async function fetchMaps(toggleLoading = true) {
            if (toggleLoading) loading.value = true
            let { data: mData } = await sb.from('maps').select('*').order('created_at')
            mapsList.value = mData || []
            let { data: pData } = await sb.from('map_positions').select('*')
            mapPositions.value = pData || []
            if (toggleLoading) loading.value = false
        }

        /* ==========================================
           5. CRUD & MODAL ACTIONS (Core entities)
           ========================================== */

        // Show full detail (loads skill record)
        async function showFullDetail(char, type = 'player') {
            if (loading.value) return
            selectedCharacter.value = char
            const table = type === 'player' ? 'player_skills' : 'enemy_skills'
            const idCol = type === 'player' ? 'player_id' : 'enemy_id'
            let { data } = await sb.from(table).select('*').eq(idCol, char.id).single()
            if (data) {
                const { [idCol]: _, id, ...skills } = data
                selectedSkills.value = skills
            } else {
                selectedSkills.value = {}
            }
        }

        // Create modal for player/enemy
        function openCreateModal(type) {
            modalType.value = type
            form.value = {
                name: '', character_name: '', pathways: '', sequence: '', hp: 10,
                role: 'player', status: 'active', character_img_url: CONFIG.defaultImg, skill_points: 0
            }
            modals.value.create = true
        }

        // Submit create (player or enemy)
        async function submitCreate() {
            if (loading.value) return
            loading.value = true
            const table = modalType.value === 'player' ? 'players' : 'enemies'
            const { data, error } = await sb.from(table).insert([form.value]).select()
            if (!error && data.length > 0) {
                // create corresponding skills row
                const skillTable = modalType.value === 'player' ? 'player_skills' : 'enemy_skills'
                const idCol = modalType.value === 'player' ? 'player_id' : 'enemy_id'
                await sb.from(skillTable).insert([{ [idCol]: data[0].id }])
                showToast("สร้างตัวละครสำเร็จ", 'success')
                modals.value.create = false
                fetchData()
            } else {
                showToast(error?.message || 'Error', 'error')
            }
            loading.value = false
        }

        // Open edit modal and preload skills
        async function openEditModal(char, type) {
            modalType.value = type
            editTab.value = 'general'
            form.value = { ...char }
            loading.value = true
            const skillTable = type === 'player' ? 'player_skills' : 'enemy_skills'
            const idCol = type === 'player' ? 'player_id' : 'enemy_id'
            let { data } = await sb.from(skillTable).select('*').eq(idCol, char.id).single()
            formSkills.value = data ? (({ [idCol]: _, id, ...rest }) => rest)(data) : {}
            loading.value = false
            modals.value.edit = true
        }

        // Submit edit (players/enemies and skills)
        async function submitEdit() {
            if (loading.value) return
            loading.value = true
            const table = modalType.value === 'player' ? 'players' : 'enemies'
            const skillTable = modalType.value === 'player' ? 'player_skills' : 'enemy_skills'
            const idCol = modalType.value === 'player' ? 'player_id' : 'enemy_id'
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

        /* ------------------------------------------
           5.1 MAGIC & MAPS (Pathways, Sequences, Maps)
           ------------------------------------------ */
        function openPathwayModal(path = null) { formPathway.value = path ? { ...path } : { name: '', goo_group: '' }; modalPathway.value = true }
        async function submitPathway() {
            loading.value = true
            const { error } = formPathway.value.id ? await sb.from('pathways').update(formPathway.value).eq('id', formPathway.value.id) : await sb.from('pathways').insert([formPathway.value])
            if (!error) { showToast("บันทึกสำเร็จ"); modalPathway.value = false; fetchData() } else { showToast(error.message, 'error') }
            loading.value = false
        }
        async function deletePathway(id) { if (!confirm("ลบ Pathway นี้?")) return; loading.value = true; await sb.from('pathways').delete().eq('id', id); fetchData(); loading.value = false }

        function openSequenceModal(pathwayId, seq = null) { formSequence.value = seq ? { ...seq } : { pathway_id: pathwayId, seq_number: 9, title: '', rank_group: 'Low (9-8)' }; modalSequence.value = true }
        async function submitSequence() {
            loading.value = true
            const { error } = formSequence.value.id ? await sb.from('sequences').update(formSequence.value).eq('id', formSequence.value.id) : await sb.from('sequences').insert([formSequence.value])
            if (!error) { showToast("บันทึกสำเร็จ"); modalSequence.value = false; fetchData() } else { showToast(error.message, 'error') }
            loading.value = false
        }
        async function deleteSequence(id) { if (!confirm("ลบ Sequence นี้?")) return; loading.value = true; await sb.from('sequences').delete().eq('id', id); fetchData(); loading.value = false }

        function openMapConfigModal(map = null) { formMap.value = map ? { ...map } : { name: '', description: '', image_url: '' }; modalMapConfig.value = true }
        async function submitMapConfig() {
            loading.value = true
            const { error } = formMap.value.id ? await sb.from('maps').update(formMap.value).eq('id', formMap.value.id) : await sb.from('maps').insert([formMap.value])
            if (!error) { showToast("บันทึกแผนที่สำเร็จ"); modalMapConfig.value = false; fetchMaps() } else { showToast(error.message, 'error') }
            loading.value = false
        }
        async function deleteMap(id) { if (!confirm("ลบแผนที่นี้?")) return; loading.value = true; await sb.from('maps').delete().eq('id', id); fetchMaps(); loading.value = false }
        function openMapDetail(map) { currentMap.value = map; currentView.value = 'map_detail' }

        /* ------------------------------------------
           5.2 MAP CELL INTERACTION
           ------------------------------------------ */
        function handleCellClick(x, y) {
            const occupants = getOccupants(x, y)
            selectedCell.value = { x, y, occupants }
            if (occupants.length > 0) modalCellDetail.value = true
            else if (isAdmin.value) openPlaceModal(x, y)
        }

        function openPlaceModal(x, y) {
            modalCellDetail.value = false
            selectedCell.value.x = x
            selectedCell.value.y = y
            formPlacement.value = { player_id: '' }
            modalPlaceEntity.value = true
        }

        async function submitPlacement() {
            if (!formPlacement.value.player_id) return
            loading.value = true
            // Ensure player is not in multiple positions: remove all positions for that player first
            await sb.from('map_positions').delete().eq('player_id', formPlacement.value.player_id)
            const payload = { map_id: currentMap.value.id, player_id: formPlacement.value.player_id, pos_x: selectedCell.value.x, pos_y: selectedCell.value.y }
            const { error } = await sb.from('map_positions').insert([payload])
            if (!error) { showToast("วางตัวละครเรียบร้อย"); modalPlaceEntity.value = false; fetchMaps() } else { showToast(error.message, 'error') }
            loading.value = false
        }

        function removePosition(posId) {
            modals.value.confirm = {
                title: 'ยืนยันการย้าย',
                message: 'นำตัวละครออกจากจุดนี้?',
                type: 'delete',
                confirmText: 'นำออก',
                onConfirm: async () => {
                    modals.value.confirm = null
                    loading.value = true
                    const { error } = await sb.from('map_positions').delete().eq('id', posId)
                    if (!error) { modalCellDetail.value = false; fetchMaps(); showToast("นำออกเรียบร้อย", 'success') } else { showToast(error.message, 'error') }
                    loading.value = false
                }
            }
        }

        /* ------------------------------------------
           5.3 UPGRADE / GRANT / STATUS MANAGEMENT
           ------------------------------------------ */
        function openUpgradeModal(player) {
            if (player.skill_points <= 0) { showToast("ไม่มีแต้ม SP", 'error'); return }
            upgradeForm.value = {
                id: player.id,
                remainingSP: player.skill_points,
                ...Object.fromEntries(CONFIG.stats.map(s => [s.key, player[s.key]])),
                ...Object.fromEntries(CONFIG.stats.map(s => [s.mod, player[s.mod]]))
            }
            modals.value.upgrade = true
        }

        function increaseStat(statKey) {
            if (upgradeForm.value.remainingSP > 0) {
                upgradeForm.value[statKey]++
                upgradeForm.value.remainingSP--
                calculateModifier(statKey, upgradeForm.value)
            } else showToast("SP หมดแล้ว", 'error')
        }

        async function submitUpgrade() {
            if (loading.value) return
            loading.value = true
            const updatePayload = { skill_points: upgradeForm.value.remainingSP }
            CONFIG.stats.forEach(s => {
                updatePayload[s.key] = upgradeForm.value[s.key]
                updatePayload[s.mod] = upgradeForm.value[s.mod]
            })
            const { error } = await sb.from('players').update(updatePayload).eq('id', upgradeForm.value.id)
            if (!error) { showToast("อัปเกรดสำเร็จ!", 'success'); modals.value.upgrade = false; fetchData() } else { showToast(error.message, 'error') }
            loading.value = false
        }

        function openGrantModal(player) { grantData.value = { target: player, amount: 0 }; modals.value.grant = true }

        async function submitGrant() {
            if (loading.value || grantData.value.amount <= 0) return
            loading.value = true
            const newPoints = (grantData.value.target.skill_points || 0) + grantData.value.amount
            const { error } = await sb.from('players').update({ skill_points: newPoints }).eq('id', grantData.value.target.id)
            if (!error) { showToast(`มอบ ${grantData.value.amount} SP แล้ว`, 'success'); modals.value.grant = false; fetchData() } else { showToast(error.message, 'error') }
            loading.value = false
        }

        function changeStatus(id, newStatus) {
            modals.value.confirm = {
                title: 'เปลี่ยนสถานะ',
                message: `เปลี่ยนเป็น "${newStatus}"?`,
                type: 'info',
                confirmText: 'ยืนยัน',
                onConfirm: async () => {
                    modals.value.confirm = null
                    loading.value = true
                    const { error } = await sb.from('players').update({ status: newStatus }).eq('id', id)
                    if (!error) { showToast("สถานะเปลี่ยนแล้ว", 'success'); fetchData() } else showToast("เกิดข้อผิดพลาด", 'error')
                    loading.value = false
                }
            }
        }

        function confirmDelete(id, type) {
            modals.value.confirm = {
                title: 'ยืนยันการลบ',
                message: 'ข้อมูลจะหายไปถาวร ยืนยันที่จะลบ?',
                type: 'delete',
                confirmText: 'ลบทิ้ง',
                onConfirm: async () => {
                    modals.value.confirm = null
                    loading.value = true
                    const skillTable = type === 'player' ? 'player_skills' : 'enemy_skills'
                    const idCol = type === 'player' ? 'player_id' : 'enemy_id'
                    const mainTable = type === 'player' ? 'players' : 'enemies'
                    await sb.from(skillTable).delete().eq(idCol, id)
                    await sb.from(mainTable).delete().eq('id', id)
                    showToast("ลบข้อมูลสำเร็จ", 'success')
                    fetchData()
                    loading.value = false
                }
            }
        }

        function openEmbedModal(player) {
            const cardUrl = `${window.location.origin}/card.html?id=${player.id}`
            embedCode.value = `<iframe src="${cardUrl}" width="350" height="550" style="border:none; border-radius: 8px; overflow:hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" title="${player.character_name}"></iframe>`
            modals.value.embed = true
        }

        function copyEmbedCode() { navigator.clipboard.writeText(embedCode.value).then(() => showToast("คัดลอกแล้ว", "success")) }

        /* ==========================================
           6. ECONOMY SYSTEM INTEGRATION (Phase 2)
           - if economy.js is loaded it exposes window.useEconomy
           ========================================== */
        const economy = window.useEconomy ? window.useEconomy(sb, currentUser, loading, showToast, modals, CONFIG) : {}

        /* ==========================================
           7. INIT (onMounted) & RETURN (expose to template)
           ========================================== */
        onMounted(() => {
            // initialize session & fetch data if logged in
            sb.auth.getSession().then(({ data }) => {
                session.value = data.session
                if (session.value) fetchData()
            })
            // listen for auth changes
            sb.auth.onAuthStateChange((_event, _session) => {
                session.value = _session
                if (_session) fetchData()
            })
        })

        // return all bindings used by templates
        return {
            // constants & config
            RANK_GROUPS, statsConfig: CONFIG.stats, skillLabels: CONFIG.skills, headerImg,

            // core state
            session, loading, toasts, currentUser, currentView,
            players, enemies, pathwaysList, sequencesList, mapsList, currentMap, mapPositions,

            // computed helpers & functions
            isAdmin, isSuperAdmin, roleLabel, getJobTitle, availableSequencesForEdit, isUserInMap, getOccupants, otherPlayers,

            // auth & basic actions
            email, password, handleLogin, handleLogout,
            selectedCharacter, selectedSkills, showFullDetail,

            // modal & form state
            modals, modalType, editTab,
            form, formSkills, upgradeForm, grantData, embedCode,
            modalPathway, modalSequence, formPathway, formSequence,
            modalMapConfig, modalCellDetail, modalPlaceEntity, formMap, selectedCell, formPlacement,

            // CRUD actions
            openCreateModal, submitCreate, openEditModal, submitEdit, calculateModifier,
            openUpgradeModal, increaseStat, submitUpgrade, openGrantModal, submitGrant,
            changeStatus, confirmDelete, openEmbedModal, copyEmbedCode,
            openPathwayModal, submitPathway, deletePathway, openSequenceModal, submitSequence, deleteSequence,
            openMapConfigModal, submitMapConfig, deleteMap, openMapDetail, handleCellClick, openPlaceModal, submitPlacement, removePosition,

            // economy exports (may be undefined until economy.js loaded)
            ...economy
        }
    }
}).mount('#app')