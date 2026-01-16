// economy.js
// โมดูลจัดการระบบเศรษฐกิจและไอเทม

window.useEconomy = function (sb, currentUser, loading, showToast, modals, CONFIG) {
    const { ref, computed } = Vue

    // ==========================================
    // 1. STATE MANAGEMENT
    // ==========================================
    const inventoryList = ref([])
    const shopList = ref([])
    
    // Bank State
    const bankAmount = ref(0)
    const bankMode = ref('deposit')

    // Transfer Items State
    const transferData = ref({ item: null, targetId: "", amount: 1 })

    // NEW: Money & Shop State
    const grantMoneyData = ref({ target: null, amount: 0 })
    const transferMoneyData = ref({ targetId: "", amount: 0 })
    const formItem = ref({})

    // ==========================================
    // 2. FETCH ACTIONS
    // ==========================================
    async function fetchEconomyData() {
        if (!currentUser.value) return
        
        let { data: shopData } = await sb.from('items').select('*').order('price_buy')
        shopList.value = shopData || []

        let { data: invData } = await sb.from('inventory').select('*, items(*)').eq('player_id', currentUser.value.id).order('updated_at')
        inventoryList.value = invData || []
    }

    // ==========================================
    // 3. ITEM ACTIONS (Buy, Sell, Use, Equip, Discard)
    // ==========================================
    async function buyItem(item) {
        if (!currentUser.value) return
        if (currentUser.value.money < item.price_buy) { showToast("เงินไม่พอ!", "error"); return; }
        if(!confirm(`ซื้อ ${item.name} ราคา ${item.price_buy}?`)) return;

        loading.value = true
        const newMoney = currentUser.value.money - item.price_buy
        const { error } = await sb.from('players').update({ money: newMoney }).eq('id', currentUser.value.id)
        if(error) { showToast(error.message, 'error'); loading.value = false; return; }
        
        const existing = inventoryList.value.find(i => i.item_id === item.id)
        if (existing) {
            await sb.from('inventory').update({ quantity: existing.quantity + 1 }).eq('id', existing.id)
        } else {
            await sb.from('inventory').insert([{ player_id: currentUser.value.id, item_id: item.id, quantity: 1 }])
        }

        currentUser.value.money = newMoney
        showToast(`ซื้อ ${item.name} สำเร็จ`, "success")
        await fetchEconomyData()
        loading.value = false
    }

    async function sellItem(invItem) {
        if(!confirm(`ขาย ${invItem.items.name} คืนร้านราคา ${invItem.items.price_sell}?`)) return;
        loading.value = true
        
        const newMoney = currentUser.value.money + invItem.items.price_sell
        await sb.from('players').update({ money: newMoney }).eq('id', currentUser.value.id)
        
        if(invItem.quantity > 1) {
            await sb.from('inventory').update({ quantity: invItem.quantity - 1 }).eq('id', invItem.id)
        } else {
            await sb.from('inventory').delete().eq('id', invItem.id)
        }
        
        currentUser.value.money = newMoney
        showToast(`ขาย ${invItem.items.name} แล้ว`, "success")
        await fetchEconomyData()
        loading.value = false
    }

    async function useItem(invItem) {
        const effects = invItem.items.effects
        if(!effects || Object.keys(effects).length === 0) { showToast("ไอเทมนี้ไม่มีผลพิเศษ", "info"); return; }
        
        loading.value = true
        let msg = []
        let updateData = {}

        if(effects.heal_hp) {
            const newHp = (currentUser.value.hp || 0) + effects.heal_hp
            updateData.hp = newHp
            msg.push(`ฟื้นฟู ${effects.heal_hp} HP`)
            currentUser.value.hp = newHp 
        }

        CONFIG.stats.forEach(stat => {
            const buffKey = `buff_${stat.key}`
            if (effects[buffKey]) {
                const val = effects[buffKey]
                const currentVal = currentUser.value[stat.key] || 10
                const newVal = currentVal + val
                
                updateData[stat.key] = newVal
                const newMod = Math.floor((newVal - 10) / 2)
                updateData[stat.mod] = newMod

                msg.push(`${stat.label} ${val > 0 ? '+' : ''}${val}`)
                currentUser.value[stat.key] = newVal
                currentUser.value[stat.mod] = newMod
            }
        })

        if (effects.advance_sequence) {
            let currentSeq = parseInt(currentUser.value.sequence) || 9
            if (currentSeq > 0) {
                const newSeq = currentSeq - 1
                updateData.sequence = newSeq.toString()
                msg.push(`เลื่อนสู่ลำดับ ${newSeq}`)
                currentUser.value.sequence = newSeq.toString()
            } else {
                msg.push(`คุณอยู่ในลำดับสูงสุดแล้ว`)
            }
        }

        if (effects.buff_atk) {
            const newAtk = (currentUser.value.atk || 0) + effects.buff_atk
            updateData.atk = newAtk
            msg.push(`ATK ${effects.buff_atk > 0 ? '+' : ''}${effects.buff_atk}`)
            currentUser.value.atk = newAtk
        }

        if (effects.buff_ac) {
            const newAc = (currentUser.value.ac || 10) + effects.buff_ac
            updateData.ac = newAc
            msg.push(`AC ${effects.buff_ac > 0 ? '+' : ''}${effects.buff_ac}`)
            currentUser.value.ac = newAc
        }

        if(Object.keys(updateData).length > 0) {
            const { error } = await sb.from('players').update(updateData).eq('id', currentUser.value.id)
            if (!error) {
                if(invItem.items.type === 'consumable') {
                    if(invItem.quantity > 1) await sb.from('inventory').update({ quantity: invItem.quantity - 1 }).eq('id', invItem.id)
                    else await sb.from('inventory').delete().eq('id', invItem.id)
                }
                showToast(`ใช้ไอเทม: ${msg.join(', ')}`, "success")
                await fetchEconomyData()
            } else {
                showToast(error.message, 'error')
            }
        } else {
            showToast("ใช้ไอเทมแล้วแต่ไม่มีอะไรเกิดขึ้น", "info")
        }
        loading.value = false
    }

    async function discardItem(invItem) {
        modals.value.confirm = {
            title: 'ทิ้งไอเทม',
            message: `คุณต้องการทิ้ง ${invItem.items.name} ใช่หรือไม่? (ไม่ได้เงินคืน)`,
            type: 'delete',
            confirmText: 'ทิ้งเลย',
            onConfirm: async () => {
                modals.value.confirm = null; loading.value = true
                if(invItem.quantity > 1) {
                    await sb.from('inventory').update({ quantity: invItem.quantity - 1 }).eq('id', invItem.id)
                } else {
                    await sb.from('inventory').delete().eq('id', invItem.id)
                }
                showToast("ทิ้งไอเทมแล้ว", "success")
                await fetchEconomyData(); loading.value = false
            }
        }
    }

    async function toggleEquip(invItem) {
        if(invItem.items.type !== 'equipment') return
        loading.value = true
        const newStatus = !invItem.is_equipped
        await sb.from('inventory').update({ is_equipped: newStatus }).eq('id', invItem.id)
        showToast(newStatus ? "สวมใส่แล้ว" : "ถอดออกแล้ว", "success")
        await fetchEconomyData()
        loading.value = false
    }

    // ==========================================
    // 4. BANK & MONEY ACTIONS
    // ==========================================
    function openBankModal(mode) {
        bankMode.value = mode; bankAmount.value = 0; modals.value.bank = true
    }

    async function submitBankTransaction() {
        const amount = parseInt(bankAmount.value)
        if(amount <= 0) { showToast("กรุณาระบุจำนวนเงิน", "error"); return; }
        
        loading.value = true
        let newMoney = currentUser.value.money; let newBank = currentUser.value.bank_balance
        
        if(bankMode.value === 'deposit') {
            if(amount > newMoney) { showToast("เงินสดไม่พอฝาก", "error"); loading.value = false; return; }
            newMoney -= amount; newBank += amount
        } else {
            if(amount > newBank) { showToast("ยอดเงินในธนาคารไม่พอ", "error"); loading.value = false; return; }
            newMoney += amount; newBank -= amount
        }
        
        const { error } = await sb.from('players').update({ money: newMoney, bank_balance: newBank }).eq('id', currentUser.value.id)
        if(!error) {
            currentUser.value.money = newMoney; currentUser.value.bank_balance = newBank
            showToast("ทำรายการสำเร็จ", "success"); modals.value.bank = false
        } else { showToast(error.message, "error") }
        loading.value = false
    }

    // --- NEW: Transfer Money ---
    function openTransferMoneyModal() {
        transferMoneyData.value = { targetId: "", amount: 0 }
        modals.value.transferMoney = true
    }

    async function submitTransferMoney() {
        const { targetId, amount } = transferMoneyData.value
        if (!targetId || amount <= 0) { showToast("ข้อมูลไม่ถูกต้อง", "error"); return }
        if (currentUser.value.bank_balance < amount) { showToast("ยอดเงินในธนาคารไม่พอ", "error"); return }

        loading.value = true
        // 1. Deduct Sender
        const newBalance = currentUser.value.bank_balance - amount
        await sb.from('players').update({ bank_balance: newBalance }).eq('id', currentUser.value.id)
        
        // 2. Add to Receiver (ดึงค่าเก่าก่อนบวก)
        const { data: target } = await sb.from('players').select('bank_balance').eq('id', targetId).single()
        if (target) {
            await sb.from('players').update({ bank_balance: (target.bank_balance || 0) + amount }).eq('id', targetId)
            
            currentUser.value.bank_balance = newBalance
            showToast("โอนเงินสำเร็จ", "success")
            modals.value.transferMoney = false
        } else {
            showToast("ไม่พบผู้รับ", "error")
        }
        loading.value = false
    }

    // --- NEW: Admin Grant Money ---
    function openGrantMoneyModal(player) {
        grantMoneyData.value = { target: player, amount: 0 }
        modals.value.grantMoney = true
    }

    async function submitGrantMoney() {
        const { target, amount } = grantMoneyData.value
        if (!target || amount <= 0) return
        loading.value = true
        
        // บวกเพิ่มเข้าไปยังธนาคาร (ไม่ทับ)
        const newBankBalance = (target.bank_balance || 0) + amount
        const { error } = await sb.from('players').update({ bank_balance: newBankBalance }).eq('id', target.id)
        
        if (!error) {
            showToast(`เสกเงิน ${amount} เข้าธนาคาร ${target.character_name} แล้ว`, "success")
            modals.value.grantMoney = false
            // ถ้าเสกให้ตัวเอง ให้อัปเดต UI ด้วย
            if (target.id === currentUser.value.id) currentUser.value.bank_balance = newBankBalance
        } else {
            showToast(error.message, "error")
        }
        loading.value = false
    }

    // ==========================================
    // 5. ITEM TRANSFER & SHOP MANAGEMENT
    // ==========================================
    function openTransferModal(invItem) {
        transferData.value = { item: invItem, targetId: "", amount: 1 }
        modals.value.transfer = true
    }

    async function submitTransfer() {
        const { item, targetId, amount } = transferData.value
        if (!targetId) { showToast("กรุณาเลือกผู้รับ", "error"); return }
        if (amount <= 0 || amount > item.quantity) { showToast("จำนวนไม่ถูกต้อง", "error"); return }

        loading.value = true
        if (item.quantity === amount) {
            await sb.from('inventory').delete().eq('id', item.id)
        } else {
            await sb.from('inventory').update({ quantity: item.quantity - amount }).eq('id', item.id)
        }

        const { data: existing } = await sb.from('inventory').select('*').eq('player_id', targetId).eq('item_id', item.item_id).single()
        if (existing) {
            await sb.from('inventory').update({ quantity: existing.quantity + amount }).eq('id', existing.id)
        } else {
            await sb.from('inventory').insert({ player_id: targetId, item_id: item.item_id, quantity: amount })
        }

        showToast(`ส่งของเรียบร้อย`, "success")
        modals.value.transfer = false
        await fetchEconomyData()
        loading.value = false
    }

    // --- NEW: Shop CRUD (Admin) ---
    function openItemModal(item = null) {
        if (item) {
            // Edit: Clone data & convert JSON to string for textarea
            formItem.value = { ...item, effects: JSON.stringify(item.effects, null, 2) }
        } else {
            // Add New
            formItem.value = { name: '', description: '', type: 'consumable', price_buy: 0, price_sell: 0, image_url: '', effects: '{}' }
        }
        modals.value.item = true
    }

    async function submitItem() {
        loading.value = true
        try {
            // Parse JSON string back to object
            const payload = { ...formItem.value }
            payload.effects = JSON.parse(payload.effects) 

            if (payload.id) {
                await sb.from('items').update(payload).eq('id', payload.id)
            } else {
                await sb.from('items').insert([payload])
            }
            showToast("บันทึกสินค้าสำเร็จ", "success")
            modals.value.item = false
            fetchEconomyData()
        } catch (e) {
            showToast("รูปแบบ JSON ใน Effects ไม่ถูกต้อง", "error")
        }
        loading.value = false
    }

    async function deleteItem(id) {
        if(!confirm("ยืนยันลบสินค้านี้?")) return
        loading.value = true
        await sb.from('items').delete().eq('id', id)
        showToast("ลบสินค้าแล้ว", "success")
        fetchEconomyData()
        loading.value = false
    }

    return {
        inventoryList, shopList, bankAmount, bankMode, transferData, 
        grantMoneyData, transferMoneyData, formItem, // New State
        
        fetchEconomyData, buyItem, sellItem, useItem, discardItem, toggleEquip,
        openBankModal, submitBankTransaction, openTransferModal, submitTransfer,
        
        // New Exports
        openGrantMoneyModal, submitGrantMoney,
        openTransferMoneyModal, submitTransferMoney,
        openItemModal, submitItem, deleteItem
    }
}