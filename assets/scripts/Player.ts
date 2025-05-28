const { ccclass, property } = cc._decorator;

@ccclass
export default class Player extends cc.Component {
/* ═══════════ Inspector ═══════════ */
@property moveSpeed = 200;
@property jumpHeight = 150;
@property({ type: cc.Node }) cameraNode: cc.Node = null;
@property({ type: cc.AudioClip }) jumpSound: cc.AudioClip = null;
@property({ type: cc.AudioClip }) deathSound: cc.AudioClip = null;
/** 頭頂空節點（場景中拖進來） */
/** 搜尋最近道具半徑 */
@property itemDetectRadius = 100;

/* ═══════════ 內部狀態 ═══════════ */
private anim: cc.Animation = null;
private rb: cc.RigidBody = null;
private dir = cc.v2(0, 0);
private isOnGround = false;
private isJumping  = false;
private isDead     = false;

/* === Item === */
private heldItem: cc.Node = null;
private nearestItem: cc.Node = null;
private originalWorldScale: cc.Vec2 = null;
private originalItemFixedRotation: boolean = null;
private originalItemFriction: number = null;
private lastFacing: number = 1;   // 1 = 朝右,  -1 = 朝左




/* ═══════════ Life-cycle ═══════════ */
onLoad() {
    this.anim = this.getComponent(cc.Animation);
    this.rb   = this.getComponent(cc.RigidBody);
    cc.director.getPhysicsManager().enabled = true;
    this.addKeyListeners();
}
onDestroy() { this.removeKeyListeners(); }

/* ═══════════ Input ═══════════ */
private addKeyListeners() {
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
}
private removeKeyListeners() {
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
}
private onKeyDown(e: cc.Event.EventKeyboard) {
    if (this.isDead) return;

    switch (e.keyCode) {
        /* ─── 移動 (A / D) ─── */
        case cc.macro.KEY.a:           // ←
            this.dir.x = -1;
            this.lastFacing = -1;      // 記錄最後朝向
            this.node.scaleX = -Math.abs(this.node.scaleX);
            break;

        case cc.macro.KEY.d:           // →
            this.dir.x = 1;
            this.lastFacing = 1;
            this.node.scaleX =  Math.abs(this.node.scaleX);
            break;

        /* ─── 跳躍 (Space) ─── */
        case cc.macro.KEY.space:
            if (this.isOnGround) this.jump();
            break;

        /* ─── 拾 / 放 (E) ─── */
        case cc.macro.KEY.e:
            if (this.heldItem) {
                this.dropItem();
            } else if (this.nearestItem && this.dir.x === 0) {
                this.pickUpItem(this.nearestItem);
            } else {
                cc.log("[DEBUG] 拿取失敗：請靜止時再撿起道具");
            }
            break;
    }
}

private onKeyUp(e: cc.Event.EventKeyboard) {
    if (this.isDead) return;

    if (e.keyCode === cc.macro.KEY.a && this.dir.x === -1) this.dir.x = 0;
    if (e.keyCode === cc.macro.KEY.d && this.dir.x ===  1) this.dir.x = 0;
}

/* ═══════════ update ═══════════ */
update(dt: number) {
    if (this.isDead) return;

    this.moveHorizontal();
    this.updateCamera();
    this.updateAnim();
    this.detectNearestItem();

    /* 站直＋禁止旋轉 */
    this.node.angle = 0;
    if (this.rb) {
        this.rb.angularVelocity = 0;
        this.rb.fixedRotation   = true;
    }
}

/* ═══════════ 移動 / 跳躍 ═══════════ */
private moveHorizontal() {
    if (!this.rb) return;
    const v = this.rb.linearVelocity;
    v.x = this.dir.x * this.moveSpeed;
    this.rb.linearVelocity = v;
}
private jump() {
    if (!this.rb) return;
    this.isOnGround = false;
    this.isJumping  = true;

    const g  = Math.abs(cc.director.getPhysicsManager().gravity.y);
    const vy = Math.sqrt(2 * g * this.jumpHeight);
    this.rb.linearVelocity = cc.v2(this.rb.linearVelocity.x, vy);

    if (this.jumpSound) cc.audioEngine.playEffect(this.jumpSound, false);
}

/* ═══════════ Ground Collision ═══════════ */
onBeginContact(contact, selfCol, otherCol) {
    if (this.isDead) return;
    if (otherCol.node.group === 'Ground' || otherCol.node.group === 'Item') {
        const n = contact.getWorldManifold().normal; // self → other
        if (n.y < -0.5) { this.isOnGround = true; this.isJumping = false; }
    }
}
onEndContact(contact, self, other) {
    if (other.node.group === 'Ground') this.isOnGround = false;
}

/* ═══════════ Camera ═══════════ */
private updateCamera() {
    if (!this.cameraNode) return;
    const w = cc.winSize;
    this.cameraNode.setPosition(this.node.x - w.width/2, this.node.y - w.height/2);
}

/* ═══════════ Animation ═══════════ */
private updateAnim() {
    let name = 'Default';
    if (this.isDead)            name = 'Die';
    else if (this.isJumping)    name = 'Jump';
    else if (this.dir.x !== 0)  name = 'Move';
    if (this.anim && (!this.anim.currentClip || this.anim.currentClip.name !== name))
        this.anim.play(name);
}

/* ═══════════ Item System ═══════════ */
private detectNearestItem() {
    const list: cc.Node[] = [];
    this.gatherItems(cc.director.getScene(), list);

    let near: cc.Node = null, min = this.itemDetectRadius;
    for (const it of list) {
        if (it === this.heldItem) continue;
        const d = this.node.position.sub(it.position).mag();
        if (d < min) { min = d; near = it; }
    }
    if (this.nearestItem && this.nearestItem !== near) this.highlight(this.nearestItem, false);
    this.nearestItem = near;
    if (this.nearestItem) this.highlight(this.nearestItem, true);
}
private gatherItems(n: cc.Node, out: cc.Node[]) {
    if (n.group === 'Item') out.push(n);
    n.children.forEach(c => this.gatherItems(c, out));
}
private highlight(n: cc.Node, on: boolean) {
    n.color   = on ? cc.color(255,255,0) : cc.Color.WHITE;
    n.opacity = on ? 230 : 255;
}

/* ---- 撿起 ---- */
private pickUpItem(item: cc.Node) {
    this.heldItem = item;
    this.highlight(item, false);

    // 記錄世界縮放
    const ws = cc.v2(item.scaleX * item.parent.scaleX,
                     item.scaleY * item.parent.scaleY);
    this.originalWorldScale = ws;

    // 記錄物理屬性
    const rb = item.getComponent(cc.RigidBody);
    const col = item.getComponent(cc.PhysicsBoxCollider);
    if (rb) {
        this.originalItemFixedRotation = rb.fixedRotation;
        rb.enabled = true;
        rb.type = cc.RigidBodyType.Dynamic;
        rb.fixedRotation = true;
        rb.linearVelocity = cc.v2(0, 0);
        rb.angularVelocity = 0;
    }
    if (col) {
        this.originalItemFriction = col.friction;
        col.friction = 100;
        col.apply();
    }

    // 將物品隱藏，模擬收入背包
    item.active = false;
}


/* ---- 放下 ---- */
private dropItem() {
    if (!this.heldItem) return;

    // ① 啟用物品（從背包取出）
    this.heldItem.active = true;

    // ② 判斷面向方向（若靜止則使用最後方向）
    const facing = this.dir.x !== 0 ? this.dir.x : this.lastFacing;
    const offset = cc.v3(100 * facing, -10, 0); // 向面對方向偏移 + 稍微往下
    const dropPos = this.node.position.add(offset); // 計算最終位置

    // ③ 掛回原場景層級並設定位置（使用 x, y 避開 Vec3 錯誤）
    this.heldItem.parent = this.node.parent;
    this.heldItem.setPosition(dropPos.x, dropPos.y);

    // ④ 還原縮放
    const pwsx = this.heldItem.parent.scaleX;
    const pwsy = this.heldItem.parent.scaleY;
    this.heldItem.setScale(
        this.originalWorldScale.x / pwsx,
        this.originalWorldScale.y / pwsy
    );

    // ⑤ 還原物理屬性
    const rb  = this.heldItem.getComponent(cc.RigidBody);
    const col = this.heldItem.getComponent(cc.PhysicsBoxCollider);
    if (rb && this.originalItemFixedRotation !== null) {
        rb.fixedRotation = this.originalItemFixedRotation;
        this.originalItemFixedRotation = null;
    }
    if (col && this.originalItemFriction !== null) {
        col.friction = this.originalItemFriction;
        col.apply();
        this.originalItemFriction = null;
    }

    // ⑥ 清空狀態
    this.heldItem = null;
    this.nearestItem = null;
    this.originalWorldScale = null;
}
}