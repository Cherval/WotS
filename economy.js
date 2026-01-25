/**
 * =========================================================
 * WHISPER OF THE SHADOW - Economy System Module
 * =========================================================
 * Handles: Shop, Inventory, Bank, Money Transfer, Items
 * =========================================================
 */

window.useEconomy = function (sb, currentUser, players, loading, showToast, showConfirmModal, modals, CONFIG) {
    const { ref, computed } = Vue

    // =============================================================================
    // SECTION 1: STATE MANAGEMENT
    // =============================================================================

    // ----- Inventory & Shop State -----
    const inventoryList = ref([])
    const shopList = ref([])

    // ----- Bank State -----
    const bankAmount = ref(0)
    const bankMode = ref('deposit')  // 'deposit' | 'withdraw'

    // ----- Item Transfer State -----
    const transferData = ref({
        item: null,
        targetId: '',
        amount: 1
    })

    // ----- Money Grant & Transfer State -----
    const grantMoneyData = ref({
        target: null,
        amount: 0
    })

    const transferMoneyData = ref({
        targetId: '',
        amount: 0
    })

    // ----- Item Form State (Admin) -----
    const formItem = ref({})

    // =============================================================================
    // SECTION 1.5: TRANSACTION LOGGING
    // =============================================================================

    /**
     * Log a transaction to the database
     * @param {string} actionType - Type of action
     * @param {Object} options - Log options
     */
    async function logTransaction(actionType, options = {}) {
        const payload = {
            action_type: actionType,
            actor_id: currentUser.value?.id,
            actor_name: currentUser.value?.character_name || currentUser.value?.name,
            target_id: options.targetId || null,
            target_name: options.targetName || null,
            item_id: options.itemId || null,
            item_name: options.itemName || null,
            amount: options.amount || null,
            details: options.details || {}
        }

        console.log('Logging transaction:', payload)

        // Fire and forget - don't wait for response
        sb.from('transaction_logs').insert([payload]).then(({ data, error }) => {
            if (error) {
                console.error('Log error:', error)
            } else {
                console.log('Log saved:', data)
            }
        })
    }

    // =============================================================================
    // SECTION 2: DATA FETCHING
    // =============================================================================

    /**
     * Fetch economy-related data (shop items & player inventory)
     */
    async function fetchEconomyData() {
        if (!currentUser.value) return

        // Fetch shop items
        const { data: shopData } = await sb.from('items')
            .select('*')
            .order('price_buy')
        shopList.value = shopData || []

        // Fetch player inventory with item details
        const { data: invData } = await sb.from('inventory')
            .select('*, items(*)')
            .eq('player_id', currentUser.value.id)
            .order('updated_at')
        inventoryList.value = invData || []
    }

    // =============================================================================
    // SECTION 3: ITEM ACTIONS (Buy, Sell, Use, Equip, Discard)
    // =============================================================================

    /**
     * Buy an item from shop
     */
    async function buyItem(item) {
        if (!currentUser.value) return

        // Check if player has enough money
        if (currentUser.value.money < item.price_buy) {
            showToast('เงินไม่พอ!', 'error')
            return
        }

        showConfirmModal({
            title: 'ยืนยันการซื้อ',
            message: `ซื้อ ${item.name} ราคา ${item.price_buy} เหรียญ?`,
            type: 'confirm',
            confirmText: 'ซื้อเลย',
            onConfirm: async () => {
                loading.value = true

                // Deduct money
                const newMoney = currentUser.value.money - item.price_buy
                const { error } = await sb.from('players')
                    .update({ money: newMoney })
                    .eq('id', currentUser.value.id)

                if (error) {
                    showToast(error.message, 'error')
                    loading.value = false
                    return
                }

                // Add to inventory (or increase quantity if exists)
                const existing = inventoryList.value.find(i => i.item_id === item.id)

                if (existing) {
                    await sb.from('inventory')
                        .update({ quantity: existing.quantity + 1 })
                        .eq('id', existing.id)
                } else {
                    await sb.from('inventory')
                        .insert([{
                            player_id: currentUser.value.id,
                            item_id: item.id,
                            quantity: 1
                        }])
                }

                currentUser.value.money = newMoney
                showToast(`ซื้อ ${item.name} สำเร็จ`, 'success')

                // Log transaction
                logTransaction('item_buy', {
                    itemId: item.id,
                    itemName: item.name,
                    amount: -item.price_buy,
                    details: { price: item.price_buy }
                })

                await fetchEconomyData()
                loading.value = false
            }
        })
    }

    /**
     * Sell an item back to shop
     */
    async function sellItem(invItem) {
        showConfirmModal({
            title: 'ยืนยันการขาย',
            message: `ขาย ${invItem.items.name} คืนร้านในราคา ${invItem.items.price_sell} เหรียญ?`,
            type: 'confirm',
            confirmText: 'ขายเลย',
            onConfirm: async () => {
                loading.value = true

                // Add money
                const newMoney = currentUser.value.money + invItem.items.price_sell
                await sb.from('players')
                    .update({ money: newMoney })
                    .eq('id', currentUser.value.id)

                // Remove from inventory (or decrease quantity)
                if (invItem.quantity > 1) {
                    await sb.from('inventory')
                        .update({ quantity: invItem.quantity - 1 })
                        .eq('id', invItem.id)
                } else {
                    await sb.from('inventory')
                        .delete()
                        .eq('id', invItem.id)
                }

                currentUser.value.money = newMoney
                showToast(`ขาย ${invItem.items.name} แล้ว`, 'success')

                // Log transaction
                logTransaction('item_sell', {
                    itemId: invItem.items.id,
                    itemName: invItem.items.name,
                    amount: invItem.items.price_sell,
                    details: { price: invItem.items.price_sell }
                })

                await fetchEconomyData()
                loading.value = false
            }
        })
    }

    /**
     * Use a consumable item
     */
    async function useItem(invItem) {
        const effects = invItem.items.effects

        // Check if item has effects
        if (!effects || Object.keys(effects).length === 0) {
            showToast('ไอเทมนี้ไม่มีผลพิเศษ', 'info')
            return
        }

        // Build effects preview for confirmation
        let previewMessages = []
        if (effects.heal_hp) previewMessages.push(`ฟื้นฟู ${effects.heal_hp} HP`)
        CONFIG.stats.forEach(stat => {
            const buffKey = `buff_${stat.key}`
            if (effects[buffKey]) {
                previewMessages.push(`${stat.label} ${effects[buffKey] > 0 ? '+' : ''}${effects[buffKey]}`)
            }
        })
        if (effects.advance_sequence) previewMessages.push('เลื่อนลำดับ')
        if (effects.buff_atk) previewMessages.push(`ATK ${effects.buff_atk > 0 ? '+' : ''}${effects.buff_atk}`)
        if (effects.buff_ac) previewMessages.push(`AC ${effects.buff_ac > 0 ? '+' : ''}${effects.buff_ac}`)

        const effectsText = previewMessages.length > 0 ? `\n\nผลของไอเทม: ${previewMessages.join(', ')}` : ''

        showConfirmModal({
            title: 'ยืนยันการใช้ไอเทม',
            message: `คุณต้องการใช้ "${invItem.items.name}" หรือไม่?${effectsText}`,
            type: 'use',
            confirmText: 'ใช้เลย',
            onConfirm: async () => {
                loading.value = true

                let messages = []
                let updateData = {}

                // ----- Process HP Healing -----
                if (effects.heal_hp) {
                    const newHp = (currentUser.value.hp || 0) + effects.heal_hp
                    updateData.hp = newHp
                    messages.push(`ฟื้นฟู ${effects.heal_hp} HP`)
                    currentUser.value.hp = newHp
                }

                // ----- Process Stat Buffs -----
                CONFIG.stats.forEach(stat => {
                    const buffKey = `buff_${stat.key}`
                    if (effects[buffKey]) {
                        const buffValue = effects[buffKey]
                        const currentVal = currentUser.value[stat.key] || 10
                        const newVal = currentVal + buffValue
                        const newMod = Math.floor((newVal - 10) / 2)

                        updateData[stat.key] = newVal
                        updateData[stat.mod] = newMod

                        messages.push(`${stat.label} ${buffValue > 0 ? '+' : ''}${buffValue}`)
                        currentUser.value[stat.key] = newVal
                        currentUser.value[stat.mod] = newMod
                    }
                })

                // ----- Process Sequence Advancement -----
                if (effects.advance_sequence) {
                    let currentSeq = parseInt(currentUser.value.sequence) || 9
                    if (currentSeq > 0) {
                        const newSeq = currentSeq - 1
                        updateData.sequence = newSeq.toString()
                        messages.push(`เลื่อนสู่ลำดับ ${newSeq}`)
                        currentUser.value.sequence = newSeq.toString()
                    } else {
                        messages.push('คุณอยู่ในลำดับสูงสุดแล้ว')
                    }
                }

                // ----- Process ATK Buff -----
                if (effects.buff_atk) {
                    const newAtk = (currentUser.value.atk || 0) + effects.buff_atk
                    updateData.atk = newAtk
                    messages.push(`ATK ${effects.buff_atk > 0 ? '+' : ''}${effects.buff_atk}`)
                    currentUser.value.atk = newAtk
                }

                // ----- Process AC Buff -----
                if (effects.buff_ac) {
                    const newAc = (currentUser.value.ac || 10) + effects.buff_ac
                    updateData.ac = newAc
                    messages.push(`AC ${effects.buff_ac > 0 ? '+' : ''}${effects.buff_ac}`)
                    currentUser.value.ac = newAc
                }

                // ----- Apply Updates -----
                if (Object.keys(updateData).length > 0) {
                    const { error } = await sb.from('players')
                        .update(updateData)
                        .eq('id', currentUser.value.id)

                    if (!error) {
                        // Sync players array to keep Players view updated
                        const playerIndex = players.value.findIndex(p => p.id === currentUser.value.id)
                        if (playerIndex !== -1) {
                            Object.assign(players.value[playerIndex], updateData)
                        }

                        // Consume item if consumable
                        if (invItem.items.type === 'consumable') {
                            if (invItem.quantity > 1) {
                                await sb.from('inventory')
                                    .update({ quantity: invItem.quantity - 1 })
                                    .eq('id', invItem.id)
                            } else {
                                await sb.from('inventory')
                                    .delete()
                                    .eq('id', invItem.id)
                            }
                        }

                        showToast(`ใช้ไอเทม: ${messages.join(', ')}`, 'success')

                        // Log transaction
                        logTransaction('item_use', {
                            itemId: invItem.items.id,
                            itemName: invItem.items.name,
                            amount: 1,
                            details: { effects: messages }
                        })

                        await fetchEconomyData()
                    } else {
                        showToast(error.message, 'error')
                    }
                } else {
                    showToast('ใช้ไอเทมแล้วแต่ไม่มีอะไรเกิดขึ้น', 'info')
                }

                loading.value = false
            }
        })
    }

    /**
     * Discard an item from inventory
     */
    async function discardItem(invItem) {
        showConfirmModal({
            title: 'ทิ้งไอเทม',
            message: `คุณต้องการทิ้ง ${invItem.items.name} ใช่หรือไม่? (ไม่ได้เงินคืน)`,
            type: 'delete',
            confirmText: 'ทิ้งเลย',
            onConfirm: async () => {
                loading.value = true

                if (invItem.quantity > 1) {
                    await sb.from('inventory')
                        .update({ quantity: invItem.quantity - 1 })
                        .eq('id', invItem.id)
                } else {
                    await sb.from('inventory')
                        .delete()
                        .eq('id', invItem.id)
                }

                showToast('ทิ้งไอเทมแล้ว', 'success')

                // Log transaction
                logTransaction('item_discard', {
                    itemId: invItem.items.id,
                    itemName: invItem.items.name,
                    amount: 1
                })

                await fetchEconomyData()
                loading.value = false
            }
        })
    }

    /**
     * Toggle equipment status
     */
    async function toggleEquip(invItem) {
        if (invItem.items.type !== 'equipment') return

        loading.value = true

        const newStatus = !invItem.is_equipped
        await sb.from('inventory')
            .update({ is_equipped: newStatus })
            .eq('id', invItem.id)

        showToast(newStatus ? 'สวมใส่แล้ว' : 'ถอดออกแล้ว', 'success')
        await fetchEconomyData()
        loading.value = false
    }

    // =============================================================================
    // SECTION 4: BANK OPERATIONS
    // =============================================================================

    /**
     * Open bank modal
     */
    function openBankModal(mode) {
        bankMode.value = mode
        bankAmount.value = 0
        modals.value.bank = true
    }

    /**
     * Submit bank transaction (deposit/withdraw)
     */
    async function submitBankTransaction() {
        const amount = parseInt(bankAmount.value)

        if (amount <= 0) {
            showToast('กรุณาระบุจำนวนเงิน', 'error')
            return
        }

        loading.value = true

        let newMoney = currentUser.value.money
        let newBank = currentUser.value.bank_balance

        if (bankMode.value === 'deposit') {
            // Check if player has enough cash
            if (amount > newMoney) {
                showToast('เงินสดไม่พอฝาก', 'error')
                loading.value = false
                return
            }
            newMoney -= amount
            newBank += amount
        } else {
            // Check if player has enough in bank
            if (amount > newBank) {
                showToast('ยอดเงินในธนาคารไม่พอ', 'error')
                loading.value = false
                return
            }
            newMoney += amount
            newBank -= amount
        }

        const { error } = await sb.from('players')
            .update({ money: newMoney, bank_balance: newBank })
            .eq('id', currentUser.value.id)

        if (!error) {
            currentUser.value.money = newMoney
            currentUser.value.bank_balance = newBank
            showToast('ทำรายการสำเร็จ', 'success')

            // Log transaction
            logTransaction(bankMode.value === 'deposit' ? 'bank_deposit' : 'bank_withdraw', {
                amount: bankMode.value === 'deposit' ? -amount : amount,
                details: { type: bankMode.value }
            })

            modals.value.bank = false
        } else {
            showToast(error.message, 'error')
        }

        loading.value = false
    }

    // =============================================================================
    // SECTION 5: MONEY TRANSFER
    // =============================================================================

    // Transfer states with Search
    const transferMoneySearch = ref('')
    const transferSearch = ref('')

    /**
     * Open money transfer modal
     */
    function openTransferMoneyModal() {
        transferMoneyData.value = { targetId: '', amount: 0 }
        transferMoneySearch.value = ''
        modals.value.transferMoney = true
    }

    /**
     * Get filtered players for money transfer dropdown
     */
    const moneyTransferPlayers = computed(() => {
        if (!transferMoneySearch.value) return players.value.filter(p => p.id !== currentUser.value.id)
        
        const search = transferMoneySearch.value.toLowerCase()
        return players.value.filter(p => 
            p.id !== currentUser.value.id && 
            (p.character_name.toLowerCase().includes(search) || 
             p.name.toLowerCase().includes(search))
        )
    })

    function selectMoneyTransferTarget(player) {
        transferMoneyData.value.targetId = player.id
        transferMoneySearch.value = player.character_name
    }

    /**
     * Submit money transfer to another player
     */
    async function submitTransferMoney() {
        const { targetId, amount } = transferMoneyData.value

        // Validation
        if (!targetId || amount <= 0) {
            showToast('ข้อมูลไม่ถูกต้อง', 'error')
            return
        }

        if (currentUser.value.bank_balance < amount) {
            showToast('ยอดเงินในธนาคารไม่พอ', 'error')
            return
        }

        loading.value = true

        // 1. Deduct from sender
        const newBalance = currentUser.value.bank_balance - amount
        await sb.from('players')
            .update({ bank_balance: newBalance })
            .eq('id', currentUser.value.id)

        // 2. Add to receiver
        const { data: target } = await sb.from('players')
            .select('bank_balance')
            .eq('id', targetId)
            .single()

        if (target) {
            await sb.from('players')
                .update({ bank_balance: (target.bank_balance || 0) + amount })
                .eq('id', targetId)

            currentUser.value.bank_balance = newBalance
            showToast('โอนเงินสำเร็จ', 'success')

            // Log transaction
            const targetPlayer = players.value.find(p => p.id === targetId)
            logTransaction('money_transfer', {
                targetId,
                targetName: targetPlayer ? targetPlayer.name : 'Unknown',
                amount: -amount,
                details: { recipient_received: amount }
            })

            modals.value.transferMoney = false
        } else {
            showToast('ไม่พบผู้รับ', 'error')
        }

        loading.value = false
    }

    // =============================================================================
    // SECTION 6: ADMIN - GRANT MONEY
    // =============================================================================

    /**
     * Open grant money modal (Admin)
     */
    function openGrantMoneyModal(player) {
        grantMoneyData.value = { target: player, amount: 0 }
        modals.value.grantMoney = true
    }

    /**
     * Submit grant money to player (Admin)
     */
    async function submitGrantMoney() {
        const { target, amount } = grantMoneyData.value

        if (!target || amount <= 0) return

        loading.value = true

        // Add to target's bank balance
        const newBankBalance = (target.bank_balance || 0) + amount
        const { error } = await sb.from('players')
            .update({ bank_balance: newBankBalance })
            .eq('id', target.id)

        if (!error) {
            showToast(`เสกเงิน ${amount} เข้าธนาคาร ${target.character_name} แล้ว`, 'success')

            // Log transaction
            logTransaction('money_grant', {
                targetId: target.id,
                targetName: target.character_name || target.name,
                amount: amount,
                details: { granted_to_bank: true }
            })

            modals.value.grantMoney = false

            // Update UI if granting to self
            if (target.id === currentUser.value.id) {
                currentUser.value.bank_balance = newBankBalance
            }
        } else {
            showToast(error.message, 'error')
        }

        loading.value = false
    }

    // =============================================================================
    // SECTION 7: ITEM TRANSFER BETWEEN PLAYERS
    // =============================================================================

    /**
     * Open item transfer modal
     */
    function openTransferModal(invItem) {
        transferData.value = {
            item: invItem,
            targetId: '',
            amount: 1
        }
        transferSearch.value = ''
        modals.value.transfer = true
    }

    /**
     * Get filtered players for item transfer dropdown
     */
    const itemTransferPlayers = computed(() => {
        if (!transferSearch.value) return players.value.filter(p => p.id !== currentUser.value.id)
        
        const search = transferSearch.value.toLowerCase()
        return players.value.filter(p => 
            p.id !== currentUser.value.id && 
            (p.character_name.toLowerCase().includes(search) || 
             p.name.toLowerCase().includes(search))
        )
    })

    function selectItemTransferTarget(player) {
        transferData.value.targetId = player.id
        transferSearch.value = player.character_name
    }

    /**
     * Submit item transfer to another player
     */
    async function submitTransfer() {
        const { item, targetId, amount } = transferData.value

        // Validation
        if (!targetId) {
            showToast('กรุณาเลือกผู้รับ', 'error')
            return
        }

        if (amount <= 0 || amount > item.quantity) {
            showToast('จำนวนไม่ถูกต้อง', 'error')
            return
        }

        loading.value = true

        // Remove from sender
        if (item.quantity === amount) {
            await sb.from('inventory')
                .delete()
                .eq('id', item.id)
        } else {
            await sb.from('inventory')
                .update({ quantity: item.quantity - amount })
                .eq('id', item.id)
        }

        // Add to receiver
        const { data: existing } = await sb.from('inventory')
            .select('*')
            .eq('player_id', targetId)
            .eq('item_id', item.item_id)
            .single()

        if (existing) {
            await sb.from('inventory')
                .update({ quantity: existing.quantity + amount })
                .eq('id', existing.id)
        } else {
            await sb.from('inventory')
                .insert({
                    player_id: targetId,
                    item_id: item.item_id,
                    quantity: amount
                })
        }

        showToast('ส่งของเรียบร้อย', 'success')

        // Log transaction
        const targetPlayer = players.value.find(p => p.id === targetId)
        logTransaction('item_transfer', {
            itemId: item.item_id,
            itemName: item.items?.name || 'Unknown',
            targetId,
            targetName: targetPlayer ? (targetPlayer.character_name || targetPlayer.name) : 'Unknown',
            amount: -amount,
            details: { transferred_quantity: amount }
        })

        modals.value.transfer = false
        await fetchEconomyData()
        loading.value = false
    }

    // =============================================================================
    // SECTION 8: ADMIN - SHOP ITEM MANAGEMENT
    // =============================================================================

    /**
     * Open item form modal (create/edit)
     */
    function openItemModal(item = null) {
        if (item) {
            // Edit: Clone data & convert effects JSON to string
            formItem.value = {
                ...item,
                effects: JSON.stringify(item.effects, null, 2)
            }
        } else {
            // Create new
            formItem.value = {
                name: '',
                description: '',
                type: 'consumable',
                price_buy: 0,
                price_sell: 0,
                image_url: '',
                effects: '{}'
            }
        }
        modals.value.item = true
    }

    /**
     * Submit item form (create/update)
     */
    async function submitItem() {
        loading.value = true

        try {
            // Parse effects JSON string back to object
            const payload = { ...formItem.value }
            payload.effects = JSON.parse(payload.effects)

            if (payload.id) {
                // Update existing item
                await sb.from('items')
                    .update(payload)
                    .eq('id', payload.id)

                showToast('บันทึกสินค้าสำเร็จ', 'success')
            } else {
                // Create new item
                const { data: newItem } = await sb.from('items')
                    .insert([payload])
                    .select()
                    .single()

                // Log creation
                if (newItem) {
                    logTransaction('item_create', {
                        itemId: newItem.id,
                        itemName: newItem.name,
                        details: { type: newItem.type, price_buy: newItem.price_buy, price_sell: newItem.price_sell }
                    })
                }

                showToast('สร้างสินค้าใหม่สำเร็จ', 'success')
            }

            modals.value.item = false
            fetchEconomyData()
        } catch (e) {
            showToast('รูปแบบ JSON ใน Effects ไม่ถูกต้อง', 'error')
        }

        loading.value = false
    }

    /**
     * Delete an item from shop
     */
    async function deleteItem(id) {
        // Find item name before deletion
        const itemToDelete = shopList.value.find(i => i.id === id)
        const itemName = itemToDelete ? itemToDelete.name : 'Unknown'

        showConfirmModal({
            title: 'ลบสินค้า',
            message: 'คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้?',
            type: 'delete',
            confirmText: 'ลบเลย',
            onConfirm: async () => {
                loading.value = true
                await sb.from('items').delete().eq('id', id)

                // Log deletion
                logTransaction('item_delete', {
                    itemId: id,
                    itemName: itemName,
                    details: { deleted_from_shop: true }
                })

                showToast('ลบสินค้าแล้ว', 'success')
                fetchEconomyData()
                loading.value = false
            }
        })
    }

    // =============================================================================
    // SECTION 9: RETURN PUBLIC API
    // =============================================================================

    return {
        // ----- State -----
        inventoryList,
        shopList,
        bankAmount,
        bankMode,
        transferData,
        grantMoneyData,
        transferMoneyData,
        formItem,
        
        // Search & Filter State
        transferMoneySearch,
        moneyTransferPlayers,
        selectMoneyTransferTarget,
        
        transferSearch,
        itemTransferPlayers,
        selectItemTransferTarget,

        // ----- Data Fetching -----
        fetchEconomyData,

        // ----- Item Actions -----
        buyItem,
        sellItem,
        useItem,
        discardItem,
        toggleEquip,

        // ----- Bank Actions -----
        openBankModal,
        submitBankTransaction,

        // ----- Item Transfer -----
        openTransferModal,
        submitTransfer,

        // ----- Money Transfer -----
        openTransferMoneyModal,
        submitTransferMoney,

        // ----- Admin: Grant Money -----
        openGrantMoneyModal,
        submitGrantMoney,

        // ----- Admin: Shop Management -----
        openItemModal,
        submitItem,
        deleteItem
    }
}