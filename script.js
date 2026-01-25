/**
 * =========================================================
 * WHISPER OF THE SHADOW - Main Application Script
 * =========================================================
 * Victorian Era RPG Character Management System
 * Built with Vue 3 + Supabase
 * =========================================================
 */

// =============================================================================
// SECTION 0: PWA SERVICE WORKER REGISTRATION
// =============================================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then((registration) => {
                console.log('[PWA] Service Worker registered:', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('[PWA] New version available! Refresh to update.');
                        }
                    });
                });
            })
            .catch((error) => {
                console.log('[PWA] Service Worker registration failed:', error);
            });
    });
}

// =============================================================================
// SECTION 1: CONFIGURATION & CONSTANTS
// =============================================================================

/**
 * Supabase Configuration
 * - Database connection settings
 */
const SUPABASE_URL = 'https://kllwutyulbppgqgwydno.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbHd1dHl1bGJwcGdxZ3d5ZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODQ1MzUsImV4cCI6MjA4NDA2MDUzNX0.ohqUm1pVR9FtWagNie6u8TiNmGOuH78H7WkIKMm2ALM'
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

/**
 * Game Constants
 * - Rank groups for Pathway sequences
 */
const RANK_GROUPS = [
    'Low (9-8)',
    'Mid (7-5)',
    'High (4)',
    'Saint (3)',
    'Angel (2-1)',
    'Deity (0)'
]

/**
 * Application Configuration
 * - Default images, stats, and skill labels
 */
const CONFIG = {
    // Default placeholder images
    defaultImg: 'https://via.placeholder.com/300',
    headerImg: 'https://via.placeholder.com/1200x400?text=Victorian+Era+Campaign',

    // Character stats configuration
    stats: [
        { label: 'STR', key: 'str', mod: 'str_mod' },
        { label: 'AGI', key: 'agi', mod: 'agi_mod' },
        { label: 'INT', key: 'int_stat', mod: 'int_mod' },
        { label: 'DEX', key: 'dex', mod: 'dex_mod' },
        { label: 'CON', key: 'con', mod: 'con_mod' },
        { label: 'WIS', key: 'wis', mod: 'wis_mod' },
        { label: 'CHA', key: 'cha', mod: 'cha_mod' }
    ],

    // Skill labels (English + Thai)
    skills: {
        athletics: 'Athletics (กรีฑา)',
        acrobatics: 'Acrobatics (กายกรรม)',
        sleight_of_hand: 'Sleight of Hand (มือไว)',
        stealth: 'Stealth (ลอบเร้น)',
        arcana: 'Arcana (เวทมนตร์)',
        history: 'History (ประวัติศาสตร์)',
        investigation: 'Investigation (สืบสวน)',
        nature: 'Nature (ธรรมชาติ)',
        religion: 'Religion (ศาสนา)',
        animal_handling: 'Animal Handling (คุมสัตว์)',
        insight: 'Insight (หยั่งรู้)',
        medicine: 'Medicine (การแพทย์)',
        perception: 'Perception (การรับรู้)',
        survival: 'Survival (เอาตัวรอด)',
        deception: 'Deception (หลอกลวง)',
        intimidation: 'Intimidation (ข่มขู่)',
        performance: 'Performance (การแสดง)',
        persuasion: 'Persuasion (ชักจูง)'
    }
}

// =============================================================================
// SECTION 2: VUE APPLICATION
// =============================================================================

const { createApp, ref, computed, onMounted } = Vue

createApp({
    setup() {

        // =====================================================================
        // 2.1 STATE MANAGEMENT
        // =====================================================================

        // ----- System State -----
        const session = ref(null)
        const loading = ref(false)
        const currentView = ref('dashboard')
        const toasts = ref([])

        // ----- Core Data Entities -----
        const currentUser = ref(null)
        const players = ref([])
        const enemies = ref([])
        const pathwaysList = ref([])
        const sequencesList = ref([])

        // ----- Map System -----
        const mapsList = ref([])
        const mapPositions = ref([])
        const currentMap = ref(null)

        // ----- Transaction Logs System -----
        const transactionLogs = ref([])
        const logsPage = ref(1)
        const logsTotalPages = ref(1)
        const logsPerPage = 25
        const logsFilter = ref('')  // กรองตามชื่อผู้เล่น
        const logsLoading = ref(false)

        // ----- Map Edit Mode State -----
        const isMapEditMode = ref(false)  // โหมดแก้ไขตำแหน่ง
        const draggingCharacter = ref(null)  // ตัวละครที่กำลังลาก
        const dragPosition = ref({ x: 0, y: 0 })  // ตำแหน่งระหว่างลาก (real-time)
        const mapContainerRef = ref(null)  // ref สำหรับ container แผนที่
        const nearbyCharacters = ref([])  // ตัวละครที่อยู่ใกล้กัน
        const showNearbyModal = ref(false)  // แสดง modal รายชื่อคนใกล้เคียง
        const clickedPosition = ref({ x: 0, y: 0 })  // ตำแหน่งที่คลิก
        let touchTimer = null  // timer สำหรับ long press

        // ----- UI / Form Inputs -----
        const email = ref('')
        const password = ref('')
        const selectedCharacter = ref(null)
        const selectedSkills = ref({})
        const currentUserSkills = ref({})  // Skills for dashboard display

        // ----- Modal States -----
        const modals = ref({
            // Core Modals
            create: false,
            edit: false,
            grant: false,
            upgrade: false,
            confirm: false,
            embed: false,
            // Economy Modals
            bank: false,
            transfer: false,
            grantMoney: false,
            transferMoney: false,
            item: false
        })

        // Specialized Modals (Magic & Map)
        const modalPathway = ref(false)
        const modalSequence = ref(false)
        const modalMapConfig = ref(false)
        const modalCellDetail = ref(false)
        const modalPlaceEntity = ref(false)
        const modalNearbyCharacters = ref(false)  // Modal แสดงตัวละครใกล้กัน

        // ----- Form Data -----
        const modalType = ref('player')
        const editTab = ref('general')
        const form = ref({})
        const formSkills = ref({})
        const upgradeForm = ref({})
        const grantData = ref({ target: null, amount: 0 })
        const embedCode = ref('')

        // Pathway & Sequence Forms
        const formPathway = ref({})
        const formSequence = ref({})

        // Map Forms
        const formMap = ref({})
        const selectedCell = ref({ x: 1, y: 1, occupants: [] })
        const formPlacement = ref({ player_id: '' })

        // =====================================================================
        // 2.2 COMPUTED PROPERTIES & HELPER FUNCTIONS
        // =====================================================================

        // ----- Authorization Computed -----
        const isAdmin = computed(() => {
            return ['dungeon_master', 'assistant'].includes(currentUser.value?.role)
        })

        const isSuperAdmin = computed(() => {
            return currentUser.value?.role === 'dungeon_master'
        })

        // ----- UI Computed -----
        const headerImg = ref(CONFIG.headerImg)

        const otherPlayers = computed(() => {
            if (!currentUser.value) return []
            return players.value.filter(p =>
                p.id !== currentUser.value.id && p.status !== 'hide'
            )
        })

        const availableSequencesForEdit = computed(() => {
            const selectedPathName = form.value.pathways
            if (!selectedPathName) return []

            const path = pathwaysList.value.find(p => p.name === selectedPathName)
            if (!path) return []

            return sequencesList.value
                .filter(s => s.pathway_id === path.id)
                .sort((a, b) => b.seq_number - a.seq_number)
        })

        // ----- Helper Functions -----

        /**
         * Convert role key to Thai label
         */
        function roleLabel(role) {
            const roleMap = {
                'dungeon_master': 'ผู้คุมกฎ (DM)',
                'assistant': 'ผู้ช่วย (Assistant)'
            }
            return roleMap[role] || 'ผู้เล่น (Player)'
        }

        /**
         * Display toast notification
         */
        function showToast(msg, type = 'success', title = 'แจ้งเตือน') {
            const id = Date.now()
            toasts.value.push({ id, msg, type, title })
            setTimeout(() => {
                toasts.value = toasts.value.filter(t => t.id !== id)
            }, 3000)
        }

        /**
         * Show confirmation modal (replaces browser confirm)
         * @param {Object} options - Modal options
         * @param {string} options.title - Modal title
         * @param {string} options.message - Modal message
         * @param {string} options.type - Modal type: 'delete' | 'confirm' | 'use'
         * @param {string} options.confirmText - Text for confirm button
         * @param {Function} options.onConfirm - Callback when confirmed
         */
        function showConfirmModal({ title, message, type = 'confirm', confirmText = 'ยืนยัน', onConfirm }) {
            modals.value.confirm = {
                title,
                message,
                type,
                confirmText,
                onConfirm: async () => {
                    modals.value.confirm = null
                    if (onConfirm) await onConfirm()
                }
            }
        }

        /**
         * Calculate stat modifier from score
         */
        function calculateModifier(statKey, targetForm = form.value) {
            const config = CONFIG.stats.find(s => s.key === statKey)
            if (config) {
                const score = targetForm[statKey] || 10
                targetForm[config.mod] = Math.floor((score - 10) / 2)
            }
        }

        /**
         * Get job title from pathway and sequence number
         */
        function getJobTitle(pathwayName, seqNum) {
            const path = pathwaysList.value.find(p => p.name === pathwayName)
            if (!path) return ''

            const seq = sequencesList.value.find(
                s => s.pathway_id === path.id && s.seq_number == seqNum
            )
            return seq ? seq.title : ''
        }

        /**
         * Check if current user is in a specific map
         */
        function isUserInMap(mapId) {
            if (!currentUser.value) return false
            return mapPositions.value.some(
                p => p.map_id === mapId && p.player_id === currentUser.value.id
            )
        }

        /**
         * Get all characters at a specific map position
         */
        function getOccupants(x, y) {
            if (!currentMap.value) return []

            const positions = mapPositions.value.filter(
                p => p.map_id === currentMap.value.id && p.pos_x === x && p.pos_y === y
            )

            return positions
                .map(pos => {
                    const player = players.value.find(pl => pl.id === pos.player_id)
                    return player ? { ...player, pos_id: pos.id } : null
                })
                .filter(Boolean)
        }

        // =====================================================================
        // 2.3 AUTHENTICATION ACTIONS
        // =====================================================================

        /**
         * Handle user login
         */
        async function handleLogin() {
            if (loading.value) return

            loading.value = true
            const { error } = await sb.auth.signInWithPassword({
                email: email.value,
                password: password.value
            })

            if (error) {
                showToast(error.message, 'error', 'Login Failed')
            } else {
                showToast('ยินดีต้อนรับสู่โลกวิคตอเรียน', 'success', 'Login Success')
            }
            loading.value = false
        }

        /**
         * Handle user logout
         */
        async function handleLogout() {
            await sb.auth.signOut()
            session.value = null
            currentUser.value = null
        }

        // =====================================================================
        // 2.4 DATA FETCHING
        // =====================================================================

        /**
         * Fetch all required data from database
         */
        async function fetchData() {
            loading.value = true

            // Get authenticated user
            const { data: { user } } = await sb.auth.getUser()

            // Fetch Pathways & Sequences
            const { data: pathData } = await sb.from('pathways').select('*').order('name')
            pathwaysList.value = pathData || []

            const { data: seqData } = await sb.from('sequences')
                .select('*')
                .order('seq_number', { ascending: false })
            sequencesList.value = seqData || []

            // Fetch Maps
            await fetchMaps(false)

            // Fetch User-specific data
            if (user) {
                // Get current user's player data
                const { data } = await sb.from('players')
                    .select('*')
                    .eq('auth_id', user.id)
                    .single()

                currentUser.value = data || {
                    role: 'guest',
                    character_name: 'Unknown',
                    money: 0,
                    bank_balance: 0
                }

                // Fetch current user's skills for dashboard display
                if (data) {
                    const { data: skillsData } = await sb.from('player_skills')
                        .select('*')
                        .eq('player_id', data.id)
                        .single()

                    if (skillsData) {
                        const { player_id: _, id: __, ...skills } = skillsData
                        currentUserSkills.value = skills
                    } else {
                        currentUserSkills.value = {}
                    }
                }

                // Fetch economy data if module exists
                if (economy && economy.fetchEconomyData) {
                    await economy.fetchEconomyData()
                }

                // Fetch all players and enemies
                const { data: pData } = await sb.from('players')
                    .select('*')
                    .order('character_name')
                players.value = pData || []

                const { data: eData } = await sb.from('enemies')
                    .select('*')
                    .order('character_name')
                enemies.value = eData || []
            }

            loading.value = false
        }

        /**
         * Fetch map data
         */
        async function fetchMaps(toggleLoading = true) {
            if (toggleLoading) loading.value = true

            const { data: mData } = await sb.from('maps')
                .select('*')
                .order('created_at')
            mapsList.value = mData || []

            const { data: pData } = await sb.from('map_positions').select('*')
            mapPositions.value = pData || []

            if (toggleLoading) loading.value = false
        }

        // =====================================================================
        // 2.4.5 TRANSACTION LOGS
        // =====================================================================

        /**
         * Fetch transaction logs with pagination
         */
        async function fetchTransactionLogs() {
            logsLoading.value = true

            const from = (logsPage.value - 1) * logsPerPage
            const to = from + logsPerPage - 1

            let query = sb.from('transaction_logs')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })

            // ถ้าไม่ใช่ Admin ให้ดูแค่ที่เกี่ยวกับตัวเอง
            if (!isAdmin.value && currentUser.value) {
                query = query.or(`actor_id.eq.${currentUser.value.id},target_id.eq.${currentUser.value.id}`)
            }

            // กรองตามชื่อ (ถ้ามี)
            if (logsFilter.value.trim()) {
                const filterText = `%${logsFilter.value.trim()}%`
                query = query.or(`actor_name.ilike.${filterText},target_name.ilike.${filterText}`)
            }

            const { data, count, error } = await query.range(from, to)

            console.log('Transaction Logs:', { data, count, error, isAdmin: isAdmin.value })

            if (!error) {
                transactionLogs.value = data || []
                logsTotalPages.value = Math.ceil((count || 0) / logsPerPage)
            } else {
                console.error('Logs error:', error)
                showToast('โหลด Log ไม่สำเร็จ: ' + error.message, 'error')
            }

            logsLoading.value = false
        }

        /**
         * Go to specific log page
         */
        function goToLogPage(page) {
            const p = parseInt(page)
            if (p >= 1 && p <= logsTotalPages.value) {
                logsPage.value = p
                fetchTransactionLogs()
            }
        }

        /**
         * Navigate log pages
         */
        function nextLogPage() {
            if (logsPage.value < logsTotalPages.value) {
                logsPage.value++
                fetchTransactionLogs()
            }
        }

        function prevLogPage() {
            if (logsPage.value > 1) {
                logsPage.value--
                fetchTransactionLogs()
            }
        }

        /**
         * Apply log filter
         */
        function applyLogFilter() {
            logsPage.value = 1
            fetchTransactionLogs()
        }

        /**
         * Get action type label in Thai
         */
        function getActionLabel(actionType) {
            const labels = {
                'money_transfer': '💸 โอนเงิน',
                'money_grant': '✨ เสกเงิน',
                'item_use': '🧪 ใช้ไอเทม',
                'item_transfer': '📦 ส่งไอเทม',
                'item_discard': '🗑️ ทิ้งไอเทม',
                'item_create': '➕ เพิ่มสินค้า',
                'item_delete': '❌ ลบสินค้า',
                'item_buy': '🛒 ซื้อไอเทม',
                'item_sell': '💰 ขายไอเทม',
                'bank_deposit': '🏦 ฝากเงิน',
                'bank_withdraw': '🏦 ถอนเงิน'
            }
            return labels[actionType] || actionType
        }

        /**
         * Format date for display
         */
        function formatLogDate(dateStr) {
            const d = new Date(dateStr)
            return d.toLocaleString('th-TH', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        }

        // =====================================================================
        // 2.5 CHARACTER CRUD OPERATIONS
        // =====================================================================

        /**
         * Show full character detail in modal
         */
        async function showFullDetail(char, type = 'player') {
            if (loading.value) return

            selectedCharacter.value = char

            const table = type === 'player' ? 'player_skills' : 'enemy_skills'
            const idCol = type === 'player' ? 'player_id' : 'enemy_id'

            const { data } = await sb.from(table)
                .select('*')
                .eq(idCol, char.id)
                .single()

            if (data) {
                const { [idCol]: _, id, ...skills } = data
                selectedSkills.value = skills
            } else {
                selectedSkills.value = {}
            }
        }

        /**
         * Open create character modal
         */
        function openCreateModal(type) {
            modalType.value = type
            form.value = {
                name: '',
                character_name: '',
                pathways: '',
                sequence: '',
                hp: 10,
                role: 'player',
                status: 'active',
                character_img_url: CONFIG.defaultImg,
                skill_points: 0
            }
            modals.value.create = true
        }

        /**
         * Submit create character form
         */
        async function submitCreate() {
            if (loading.value) return
            loading.value = true

            const table = modalType.value === 'player' ? 'players' : 'enemies'
            const { data, error } = await sb.from(table).insert([form.value]).select()

            if (!error && data.length > 0) {
                const skillTable = modalType.value === 'player' ? 'player_skills' : 'enemy_skills'
                const idCol = modalType.value === 'player' ? 'player_id' : 'enemy_id'

                await sb.from(skillTable).insert([{ [idCol]: data[0].id }])
                showToast('สร้างตัวละครสำเร็จ', 'success')
                modals.value.create = false
                fetchData()
            } else {
                showToast(error?.message || 'Error', 'error')
            }

            loading.value = false
        }

        /**
         * Open edit character modal
         */
        async function openEditModal(char, type) {
            modalType.value = type
            editTab.value = 'general'
            form.value = { ...char }
            loading.value = true

            const skillTable = type === 'player' ? 'player_skills' : 'enemy_skills'
            const idCol = type === 'player' ? 'player_id' : 'enemy_id'

            const { data } = await sb.from(skillTable)
                .select('*')
                .eq(idCol, char.id)
                .single()

            if (data) {
                const { [idCol]: _, id, ...rest } = data
                formSkills.value = rest
            } else {
                formSkills.value = {}
            }

            loading.value = false
            modals.value.edit = true
        }

        /**
         * Submit edit character form
         */
        async function submitEdit() {
            if (loading.value) return
            loading.value = true

            const table = modalType.value === 'player' ? 'players' : 'enemies'
            const skillTable = modalType.value === 'player' ? 'player_skills' : 'enemy_skills'
            const idCol = modalType.value === 'player' ? 'player_id' : 'enemy_id'

            const { error: err1 } = await sb.from(table)
                .update(form.value)
                .eq('id', form.value.id)

            const { error: err2 } = await sb.from(skillTable)
                .update(formSkills.value)
                .eq(idCol, form.value.id)

            if (!err1 && !err2) {
                showToast('บันทึกข้อมูลสำเร็จ', 'success')
                modals.value.edit = false
                fetchData()
            } else {
                showToast(err1?.message || err2?.message, 'error')
            }

            loading.value = false
        }

        // =====================================================================
        // 2.6 PATHWAY & SEQUENCE MANAGEMENT
        // =====================================================================

        /**
         * Open pathway modal (create/edit)
         */
        function openPathwayModal(path = null) {
            formPathway.value = path
                ? { ...path }
                : { name: '', goo_group: '' }
            modalPathway.value = true
        }

        /**
         * Submit pathway form
         */
        async function submitPathway() {
            loading.value = true

            const { error } = formPathway.value.id
                ? await sb.from('pathways').update(formPathway.value).eq('id', formPathway.value.id)
                : await sb.from('pathways').insert([formPathway.value])

            if (!error) {
                showToast('บันทึกสำเร็จ')
                modalPathway.value = false
                fetchData()
            } else {
                showToast(error.message, 'error')
            }

            loading.value = false
        }

        /**
         * Delete pathway
         */
        async function deletePathway(id) {
            showConfirmModal({
                title: 'ลบ Pathway',
                message: 'คุณแน่ใจหรือไม่ว่าต้องการลบ Pathway นี้?',
                type: 'delete',
                confirmText: 'ลบเลย',
                onConfirm: async () => {
                    loading.value = true
                    await sb.from('pathways').delete().eq('id', id)
                    fetchData()
                    loading.value = false
                }
            })
        }

        /**
         * Open sequence modal (create/edit)
         */
        function openSequenceModal(pathwayId, seq = null) {
            formSequence.value = seq
                ? { ...seq }
                : { pathway_id: pathwayId, seq_number: 9, title: '', rank_group: 'Low (9-8)' }
            modalSequence.value = true
        }

        /**
         * Submit sequence form
         */
        async function submitSequence() {
            loading.value = true

            const { error } = formSequence.value.id
                ? await sb.from('sequences').update(formSequence.value).eq('id', formSequence.value.id)
                : await sb.from('sequences').insert([formSequence.value])

            if (!error) {
                showToast('บันทึกสำเร็จ')
                modalSequence.value = false
                fetchData()
            } else {
                showToast(error.message, 'error')
            }

            loading.value = false
        }

        /**
         * Delete sequence
         */
        async function deleteSequence(id) {
            showConfirmModal({
                title: 'ลบ Sequence',
                message: 'คุณแน่ใจหรือไม่ว่าต้องการลบ Sequence นี้?',
                type: 'delete',
                confirmText: 'ลบเลย',
                onConfirm: async () => {
                    loading.value = true
                    await sb.from('sequences').delete().eq('id', id)
                    fetchData()
                    loading.value = false
                }
            })
        }
        // =====================================================================
        // 2.7 MAP MANAGEMENT
        // =====================================================================

        /**
         * Open map configuration modal
         */
        function openMapConfigModal(map = null) {
            formMap.value = map
                ? { ...map }
                : { name: '', description: '', image_url: '' }
            modalMapConfig.value = true
        }

        /**
         * Submit map configuration
         */
        async function submitMapConfig() {
            loading.value = true

            const { error } = formMap.value.id
                ? await sb.from('maps').update(formMap.value).eq('id', formMap.value.id)
                : await sb.from('maps').insert([formMap.value])

            if (!error) {
                showToast('บันทึกแผนที่สำเร็จ')
                modalMapConfig.value = false
                fetchMaps()
            } else {
                showToast(error.message, 'error')
            }

            loading.value = false
        }

        /**
         * Delete map
         */
        async function deleteMap(id) {
            showConfirmModal({
                title: 'ลบแผนที่',
                message: 'คุณแน่ใจหรือไม่ว่าต้องการลบแผนที่นี้?',
                type: 'delete',
                confirmText: 'ลบเลย',
                onConfirm: async () => {
                    loading.value = true
                    await sb.from('maps').delete().eq('id', id)
                    fetchMaps()
                    loading.value = false
                }
            })
        }

        /**
         * Open map detail view
         */
        function openMapDetail(map) {
            currentMap.value = map
            currentView.value = 'map_detail'
        }

        /**
         * Handle cell click on map grid
         */
        function handleCellClick(x, y) {
            const occupants = getOccupants(x, y)
            selectedCell.value = { x, y, occupants }

            if (occupants.length > 0) {
                modalCellDetail.value = true
            } else if (isAdmin.value) {
                openPlaceModal(x, y)
            }
        }

        /**
         * Open placement modal for map
         */
        function openPlaceModal(x, y) {
            modalCellDetail.value = false
            selectedCell.value.x = x
            selectedCell.value.y = y
            formPlacement.value = { type: 'player', id: '' }
            placementSearch.value = ''
            modalPlaceEntity.value = true
        }

        // Search state for placement
        const placementSearch = ref('')
        
        /**
         * Get filtered entities for placement
         */
        const placementOptions = computed(() => {
            const type = formPlacement.value.type
            const search = placementSearch.value.toLowerCase()
            const source = type === 'player' ? players.value : enemies.value
            
            if (!search) return source

            // Exact match auto-select check could be here, but usually triggered by user action
            const filtered = source.filter(entity => {
                const name = entity.character_name || ''
                const realName = entity.name || ''
                return name.toLowerCase().includes(search) || realName.toLowerCase().includes(search)
            })

            // Auto-select if exact match or only one result after typing at least 2 chars
            if (filtered.length === 1 && search.length >= 2) {
                 // Optional: Auto selected logic, but might be annoying if typing not finished. 
                 // We will let user click.
            }

            return filtered
        })

        function selectPlacementTarget(entity) {
            formPlacement.value.id = entity.id
            placementSearch.value = entity.character_name
        }

        /**
         * Submit character placement on map
         */
        async function submitPlacement() {
            if (!formPlacement.value.id) return

            loading.value = true

            const payload = {
                map_id: currentMap.value.id,
                pos_x: selectedCell.value.x,
                pos_y: selectedCell.value.y
            }

            if (formPlacement.value.type === 'player') {
                payload.player_id = formPlacement.value.id
                // Remove existing position for this player
                await sb.from('map_positions').delete().eq('player_id', formPlacement.value.id)
            } else {
                payload.enemy_id = formPlacement.value.id
                // Remove existing position for this enemy (optional, enemies might have duplicates? No, usually unique instance)
                await sb.from('map_positions').delete().eq('enemy_id', formPlacement.value.id)
            }

            const { error } = await sb.from('map_positions').insert([payload])

            if (!error) {
                showToast('วางตัวละครเรียบร้อย')
                modalPlaceEntity.value = false
                fetchMaps()
            } else {
                showToast(error.message, 'error')
            }

            loading.value = false
        }

        /**
         * Remove character from map position
         */
        function removePosition(posId) {
            showConfirmModal({
                title: 'ยืนยันการย้าย',
                message: 'นำตัวละครออกจากจุดนี้?',
                type: 'delete',
                confirmText: 'นำออก',
                onConfirm: async () => {
                    loading.value = true

                    const { error } = await sb.from('map_positions')
                        .delete()
                        .eq('id', posId)

                    if (!error) {
                        modalCellDetail.value = false
                        modalNearbyCharacters.value = false
                        isMapEditMode.value = false
                        fetchMaps()
                        showToast('นำออกเรียบร้อย', 'success')
                    } else {
                        showToast(error.message, 'error')
                    }

                    loading.value = false
                }
            })
        }

        // =====================================================================
        // 2.7.5 MAP FREE-FORM DRAG & DROP SYSTEM
        // =====================================================================

        /**
         * Toggle map edit mode
         */
        function toggleMapEditMode() {
            isMapEditMode.value = !isMapEditMode.value
            if (!isMapEditMode.value) {
                draggingCharacter.value = null
            }
        }

        /**
         * Get characters at or near a specific position (within proximity)
         * @param {number} x - X position (0-100 percent)
         * @param {number} y - Y position (0-100 percent)
         * @param {number} proximity - Proximity threshold (default 5%)
         */
        function getCharactersNearPosition(x, y, proximity = 5) {
            if (!currentMap.value) return []

            const positions = mapPositions.value.filter(p => {
                if (p.map_id !== currentMap.value.id) return false
                const posX = p.pos_x_percent ?? ((p.pos_x - 1) / 12 * 100 + 4)
                const posY = p.pos_y_percent ?? ((p.pos_y - 1) / 12 * 100 + 4)
                return Math.abs(posX - x) <= proximity && Math.abs(posY - y) <= proximity
            })

            return positions.map(pos => {
                let entity = null
                if (pos.player_id) {
                    entity = players.value.find(pl => pl.id === pos.player_id)
                } else if (pos.enemy_id) {
                    entity = enemies.value.find(e => e.id === pos.enemy_id)
                }
                
                return entity ? { 
                    ...entity, 
                    pos_id: pos.id, 
                    pos_x_percent: pos.pos_x_percent ?? ((pos.pos_x - 1) / 12 * 100 + 4), 
                    pos_y_percent: pos.pos_y_percent ?? ((pos.pos_y - 1) / 12 * 100 + 4),
                    is_enemy: !!pos.enemy_id
                } : null
            }).filter(Boolean)
        }

        /**
         * Get all characters on current map with their positions
         */
        function getMapCharacters() {
            if (!currentMap.value) return []

            const positions = mapPositions.value.filter(p => p.map_id === currentMap.value.id)

            return positions.map(pos => {
                let entity = null
                if (pos.player_id) {
                    entity = players.value.find(pl => pl.id === pos.player_id)
                } else if (pos.enemy_id) {
                    entity = enemies.value.find(e => e.id === pos.enemy_id)
                }

                if (!entity) return null

                // Support both new percent system and old grid system
                const posX = pos.pos_x_percent ?? ((pos.pos_x - 1) / 12 * 100 + 4)
                const posY = pos.pos_y_percent ?? ((pos.pos_y - 1) / 12 * 100 + 4)

                return {
                    ...entity,
                    pos_id: pos.id,
                    pos_x_percent: posX,
                    pos_y_percent: posY,
                    is_enemy: !!pos.enemy_id
                }
            }).filter(Boolean)
        }

        /**
         * Handle map click/tap - show character info or nearby list
         */
        function handleMapClick(event) {
            if (isMapEditMode.value) return  // Don't show info in edit mode

            const rect = event.currentTarget.getBoundingClientRect()
            const x = ((event.clientX - rect.left) / rect.width) * 100
            const y = ((event.clientY - rect.top) / rect.height) * 100

            clickedPosition.value = { x, y }

            const nearby = getCharactersNearPosition(x, y, 8)  // 8% radius

            if (nearby.length > 1) {
                // Multiple characters nearby - show list modal
                nearbyCharacters.value = nearby
                modalNearbyCharacters.value = true
            } else if (nearby.length === 1) {
                // Single character - show their detail
                showFullDetail(nearby[0], 'player')
            } else if (isAdmin.value) {
                // No character - admin can place one
                openPlaceModalAtPosition(x, y)
            }
        }

        /**
         * Open placement modal at specific percentage position
         */
        function openPlaceModalAtPosition(x, y) {
            selectedCell.value = { x, y, occupants: [] }
            formPlacement.value = { player_id: '' }
            modalPlaceEntity.value = true
        }

        /**
         * Submit character placement at percentage position
         */
        async function submitPlacementPercent() {
            if (!formPlacement.value.player_id) return

            loading.value = true

            // Remove existing position for this player
            await sb.from('map_positions')
                .delete()
                .eq('player_id', formPlacement.value.player_id)

            // Insert new position with percentage values
            const payload = {
                map_id: currentMap.value.id,
                player_id: formPlacement.value.player_id,
                pos_x: 1,  // Keep for backward compatibility
                pos_y: 1,
                pos_x_percent: selectedCell.value.x,
                pos_y_percent: selectedCell.value.y
            }

            const { error } = await sb.from('map_positions').insert([payload])

            if (!error) {
                showToast('วางตัวละครเรียบร้อย')
                modalPlaceEntity.value = false
                fetchMaps()
            } else {
                showToast(error.message, 'error')
            }

            loading.value = false
        }

        /**
         * Start dragging a character (mouse)
         */
        function startDrag(event, character) {
            if (!isMapEditMode.value) return
            event.preventDefault()
            event.stopPropagation()
            draggingCharacter.value = character
            dragPosition.value = {
                x: character.pos_x_percent,
                y: character.pos_y_percent
            }
        }

        /**
         * Handle drag movement (mouse)
         */
        function onDrag(event) {
            if (!draggingCharacter.value || !isMapEditMode.value) return

            const container = event.currentTarget
            const rect = container.getBoundingClientRect()
            const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
            const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))

            // Update drag position (reactive, will update UI immediately)
            dragPosition.value = { x, y }
        }

        /**
         * End dragging and save position
         */
        async function endDrag() {
            if (!draggingCharacter.value) return

            const char = draggingCharacter.value
            const finalX = dragPosition.value.x
            const finalY = dragPosition.value.y

            // Optimistic Update: Update local state immediately
            const localPosIndex = mapPositions.value.findIndex(p => p.id === char.pos_id)
            if (localPosIndex !== -1) {
                mapPositions.value[localPosIndex].pos_x_percent = finalX
                mapPositions.value[localPosIndex].pos_y_percent = finalY
            }

            // Reset dragging state immediately to show optimistic position
            draggingCharacter.value = null

            // Perform DB update in background (don't block UI)
            sb.from('map_positions')
                .update({
                    pos_x_percent: finalX,
                    pos_y_percent: finalY
                })
                .eq('id', char.pos_id)
                .then(({ error }) => {
                    if (error) {
                        showToast('บันทึกตำแหน่งไม่สำเร็จ: ' + error.message, 'error')
                        // Optional: Revert position here if needed
                    } else {
                        // Success silently
                        console.log('Position saved')
                    }
                })
        }

        /**
         * Touch start - initiate long press detection
         */
        function handleTouchStart(event) {
            if (isMapEditMode.value) {
                // In edit mode, start dragging immediately
                const touch = event.touches[0]
                const container = event.currentTarget
                const rect = container.getBoundingClientRect()
                const x = ((touch.clientX - rect.left) / rect.width) * 100
                const y = ((touch.clientY - rect.top) / rect.height) * 100

                const nearby = getCharactersNearPosition(x, y, 8)
                if (nearby.length > 0) {
                    event.preventDefault()
                    draggingCharacter.value = nearby[0]
                    dragPosition.value = {
                        x: nearby[0].pos_x_percent,
                        y: nearby[0].pos_y_percent
                    }
                }
            } else {
                // Not in edit mode - detect long press to enter edit mode
                touchTimer = setTimeout(() => {
                    if (isAdmin.value) {
                        isMapEditMode.value = true
                        showToast('โหมดแก้ไขเปิดแล้ว - ลากตัวละครเพื่อย้ายตำแหน่ง', 'info')
                    }
                }, 800)  // 800ms long press
            }
        }

        /**
         * Touch move - handle dragging
         */
        function handleTouchMove(event) {
            clearTimeout(touchTimer)

            if (!draggingCharacter.value || !isMapEditMode.value) return
            event.preventDefault()

            const touch = event.touches[0]
            const container = event.currentTarget
            const rect = container.getBoundingClientRect()
            const x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100))
            const y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100))

            // Update drag position (reactive)
            dragPosition.value = { x, y }
        }

        /**
         * Touch end - save position or trigger click
         */
        function handleTouchEnd(event) {
            clearTimeout(touchTimer)

            if (draggingCharacter.value) {
                endDrag()
            }
        }

        // =====================================================================
        // 2.8 SKILL POINTS & STATUS MANAGEMENT
        // =====================================================================

        /**
         * Open upgrade modal for spending skill points
         */
        function openUpgradeModal(player) {
            if (player.skill_points <= 0) {
                showToast('ไม่มีแต้ม SP', 'error')
                return
            }

            upgradeForm.value = {
                id: player.id,
                remainingSP: player.skill_points,
                ...Object.fromEntries(CONFIG.stats.map(s => [s.key, player[s.key]])),
                ...Object.fromEntries(CONFIG.stats.map(s => [s.mod, player[s.mod]]))
            }
            modals.value.upgrade = true
        }

        /**
         * Increase a stat using skill points
         */
        function increaseStat(statKey) {
            if (upgradeForm.value.remainingSP > 0) {
                upgradeForm.value[statKey]++
                upgradeForm.value.remainingSP--
                calculateModifier(statKey, upgradeForm.value)
            } else {
                showToast('SP หมดแล้ว', 'error')
            }
        }

        /**
         * Submit upgrade form
         */
        async function submitUpgrade() {
            if (loading.value) return
            loading.value = true

            const updatePayload = {
                skill_points: upgradeForm.value.remainingSP
            }

            CONFIG.stats.forEach(s => {
                updatePayload[s.key] = upgradeForm.value[s.key]
                updatePayload[s.mod] = upgradeForm.value[s.mod]
            })

            const { error } = await sb.from('players')
                .update(updatePayload)
                .eq('id', upgradeForm.value.id)

            if (!error) {
                showToast('อัปเกรดสำเร็จ!', 'success')
                modals.value.upgrade = false
                fetchData()
            } else {
                showToast(error.message, 'error')
            }

            loading.value = false
        }

        /**
         * Open grant SP modal (Admin)
         */
        function openGrantModal(player) {
            grantData.value = { target: player, amount: 0 }
            modals.value.grant = true
        }

        /**
         * Submit grant SP
         */
        async function submitGrant() {
            if (loading.value || grantData.value.amount <= 0) return
            loading.value = true

            const newPoints = (grantData.value.target.skill_points || 0) + grantData.value.amount

            const { error } = await sb.from('players')
                .update({ skill_points: newPoints })
                .eq('id', grantData.value.target.id)

            if (!error) {
                showToast(`มอบ ${grantData.value.amount} SP แล้ว`, 'success')
                modals.value.grant = false
                fetchData()
            } else {
                showToast(error.message, 'error')
            }

            loading.value = false
        }

        /**
         * Change player status (Admin)
         */
        function changeStatus(id, newStatus) {
            modals.value.confirm = {
                title: 'เปลี่ยนสถานะ',
                message: `เปลี่ยนเป็น "${newStatus}"?`,
                type: 'info',
                confirmText: 'ยืนยัน',
                onConfirm: async () => {
                    modals.value.confirm = null
                    loading.value = true

                    const { error } = await sb.from('players')
                        .update({ status: newStatus })
                        .eq('id', id)

                    if (!error) {
                        showToast('สถานะเปลี่ยนแล้ว', 'success')
                        fetchData()
                    } else {
                        showToast('เกิดข้อผิดพลาด', 'error')
                    }

                    loading.value = false
                }
            }
        }

        /**
         * Confirm and delete character
         */
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

                    showToast('ลบข้อมูลสำเร็จ', 'success')
                    fetchData()
                    loading.value = false
                }
            }
        }

        // =====================================================================
        // 2.9 EMBED & UTILITY FUNCTIONS
        // =====================================================================

        /**
         * Open embed code modal
         */
        function openEmbedModal(player) {
            const cardUrl = `${window.location.origin}/card.html?id=${player.id}`
            embedCode.value = `<iframe src="${cardUrl}" width="350" height="550" style="border:none; border-radius: 8px; overflow:hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" title="${player.character_name}"></iframe>`
            modals.value.embed = true
        }

        /**
         * Copy embed code to clipboard
         */
        function copyEmbedCode() {
            navigator.clipboard.writeText(embedCode.value)
                .then(() => showToast('คัดลอกแล้ว', 'success'))
        }

        // =====================================================================
        // 2.10 ECONOMY SYSTEM INTEGRATION
        // =====================================================================

        /**
         * Load economy module from economy.js if available
         * This provides: bank, shop, inventory, money transfer features
         */
        const economy = window.useEconomy
            ? window.useEconomy(sb, currentUser, players, loading, showToast, showConfirmModal, modals, CONFIG)
            : {}

        // =====================================================================
        // 2.11 INITIALIZATION & LIFECYCLE
        // =====================================================================

        onMounted(() => {
            // Check existing session
            sb.auth.getSession().then(({ data }) => {
                session.value = data.session
                if (session.value) fetchData()
            })

            // Listen for auth state changes
            sb.auth.onAuthStateChange((_event, _session) => {
                session.value = _session
                if (_session) fetchData()
            })
        })

        // =====================================================================
        // 2.12 RETURN PUBLIC API
        // =====================================================================

        return {
            // ----- Constants -----
            RANK_GROUPS,
            statsConfig: CONFIG.stats,
            skillLabels: CONFIG.skills,
            headerImg,

            // ----- Core State -----
            session,
            loading,
            toasts,
            currentUser,
            currentView,

            // ----- Data Collections -----
            players,
            enemies,
            pathwaysList,
            sequencesList,
            mapsList,
            currentMap,
            mapPositions,

            // ----- Computed Properties -----
            isAdmin,
            isSuperAdmin,
            roleLabel,
            getJobTitle,
            availableSequencesForEdit,
            isUserInMap,
            getOccupants,
            otherPlayers,

            // ----- Authentication -----
            email,
            password,
            handleLogin,
            handleLogout,

            // ----- Character Detail -----
            selectedCharacter,
            selectedSkills,
            currentUserSkills,
            showFullDetail,

            // ----- Modal States -----
            modals,
            modalType,
            editTab,

            // ----- Form Data -----
            form,
            formSkills,
            upgradeForm,
            grantData,
            embedCode,

            // ----- Pathway/Sequence Modals -----
            modalPathway,
            modalSequence,
            formPathway,
            formSequence,

            // ----- Map Modals -----
            modalMapConfig,
            modalCellDetail,
            modalPlaceEntity,
            modalNearbyCharacters,
            formMap,
            selectedCell,
            formPlacement,
            placementSearch,
            placementOptions,
            selectPlacementTarget,

            // ----- Map Edit Mode & Drag System -----
            isMapEditMode,
            draggingCharacter,
            dragPosition,
            nearbyCharacters,
            clickedPosition,
            toggleMapEditMode,
            getMapCharacters,
            getCharactersNearPosition,
            handleMapClick,
            openPlaceModalAtPosition,
            submitPlacementPercent,
            startDrag,
            onDrag,
            endDrag,
            handleTouchStart,
            handleTouchMove,
            handleTouchEnd,

            // ----- Character CRUD -----
            openCreateModal,
            submitCreate,
            openEditModal,
            submitEdit,
            calculateModifier,

            // ----- Skill Points & Status -----
            openUpgradeModal,
            increaseStat,
            submitUpgrade,
            openGrantModal,
            submitGrant,
            changeStatus,
            confirmDelete,

            // ----- Embed & Utility -----
            openEmbedModal,
            copyEmbedCode,

            // ----- Pathway & Sequence CRUD -----
            openPathwayModal,
            submitPathway,
            deletePathway,
            openSequenceModal,
            submitSequence,
            deleteSequence,

            // ----- Map CRUD -----
            openMapConfigModal,
            submitMapConfig,
            deleteMap,
            openMapDetail,
            handleCellClick,
            openPlaceModal,
            submitPlacement,
            removePosition,

            // ----- Transaction Logs -----
            transactionLogs,
            logsPage,
            logsTotalPages,
            logsPerPage,
            logsFilter,
            logsLoading,
            fetchTransactionLogs,
            goToLogPage,
            nextLogPage,
            prevLogPage,
            applyLogFilter,
            getActionLabel,
            formatLogDate,

            // ----- Economy Module (spread) -----
            ...economy
        }
    }
}).mount('#app')