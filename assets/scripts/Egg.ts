import FirebaseManager from "./FirebaseManager";
const { ccclass, property } = cc._decorator;

// --- 線性插值輔助 ---
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
function lerpVec2(a: cc.Vec2, b: cc.Vec2, t: number): cc.Vec2 {
    return cc.v2(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
}
function lerpAngle(a: number, b: number, t: number): number {
    // 處理跨 0~360 的插值
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
}

@ccclass
export default class Egg extends cc.Component {
    @property({ tooltip: "Firebase 上的蛋 ID" })
    eggId: string = "egg1"; // 每顆蛋唯一

    @property moveSpeed = 5;
    @property jumpForce = 10;
    @property({ type: cc.SpriteFrame, tooltip: 'Normal egg appearance' }) normalSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame, tooltip: 'Cracked egg appearance' }) crackedSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame, tooltip: 'Broken egg appearance' }) brokenSprite: cc.SpriteFrame = null;
    @property maxLife = 100;
    @property({ tooltip: 'Enable keyboard debug (C crack / B break)' }) enableDebugControls = true;
    @property({ tooltip: 'Name of the ground group' }) groundGroup = 'Ground';

    private sprite: cc.Sprite = null;
    private velocity = cc.v2(0, 0);
    private currentLife = 100;
    private lastY = 0;
    private isAlive = true;
    private lastGroundContact: cc.Node = null;
    private rb: cc.RigidBody = null;
    private respawnPoint: cc.Vec2 = null;

    private syncInterval = 0.05;
    private timeSinceLastSync = 0;

    private lastSyncedPos: cc.Vec2 = null;
    private lastSyncedRot: number = 0;
    private lastSyncedLife: number = 0;

    // --- 平滑插值的目標值 ---
    private targetPos: cc.Vec2 = null;
    private targetRot: number = 0;
    private targetLife: number = 100;

    // --- 插值參數 ---
    private lerpFactor = 0.35; // 插值比例，越大越快跟上遠端，建議0.2~0.5

    onLoad() {
        this.sprite = this.getComponent(cc.Sprite) || this.node.getComponentInChildren(cc.Sprite);
        if (this.sprite && this.normalSprite) this.sprite.spriteFrame = this.normalSprite;

        this.rb = this.getComponent(cc.RigidBody);
        this.respawnPoint = this.node.getPosition().clone();
        this.currentLife = this.maxLife;
        this.lastY = this.node.y;

        this.targetPos = this.node.getPosition().clone();
        this.targetRot = this.node.angle;
        this.targetLife = this.currentLife;

        this.initEggInFirebase();
        this.listenToFirebase();
        cc.log(`[Egg][${this.eggId}] onLoad called!`);
    }

    onEnable() {
        if (this.enableDebugControls) {
            cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        }
    }
    onDisable() {
        if (this.enableDebugControls) {
            cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        }
    }
    private onKeyDown(e: cc.Event.EventKeyboard) {
        if (!this.isAlive) return;
        switch (e.keyCode) {
            case cc.macro.KEY.c:
                this.currentLife = this.maxLife / 2;
                this.updateEggAppearance();
                break;
            case cc.macro.KEY.b:
                this.currentLife = 0;
                this.die();
                break;
        }
    }

    // 落地與受傷邏輯（保持你原本的寫法）
    onBeginContact(contact, selfCollider, otherCollider) {
        const other = otherCollider.node;
        const name = other.name.toLowerCase();
        const isSafe = name.includes("spring") || name.includes("sponge");
        if (isSafe) {
            cc.log(`[Egg][${this.eggId}] Safe landing on ${other.name}, skipping damage.`);
            this.lastY = this.node.y;
            return;
        }
        if (other.group !== this.groundGroup) return;
        if (this.lastGroundContact === other) return;
        this.lastGroundContact = other;

        const fallHeight = this.lastY - this.node.y;
        cc.log(`[Egg][${this.eggId}] Fall height: ${fallHeight}`);

        if (fallHeight < 3) {
            cc.log(`[Egg][${this.eggId}] Fall too short (${fallHeight}), ignoring.`);
            return;
        }
        if (fallHeight > 100) {
            const normalized = Math.min((fallHeight - 100) / 400, 1);
            const damage = Math.floor(this.maxLife * normalized);
            this.currentLife = Math.max(0, this.currentLife - damage);
            this.updateEggAppearance();

            if (this.currentLife <= 0) {
                this.die();
            }
            cc.log(`[Egg][${this.eggId}] Fall damage: ${damage}, Remaining life: ${this.currentLife}`);
        }
        this.lastY = this.node.y;
    }
    onEndContact(contact, selfCol, otherCol) {
        if (otherCol.node.group !== this.groundGroup) return;
        if (this.lastGroundContact === otherCol.node) {
            this.lastGroundContact = null;
        }
        this.lastY = this.node.y;
    }

    update(dt: number) {
        if (!this.isAlive) return;
        if (!this.rb) {
            this.velocity.y += -20 * dt;
            let pos = this.node.position;
            pos.y += this.velocity.y;
            this.node.setPosition(pos);
        }
        if (this.node.y > this.lastY) this.lastY = this.node.y;

        // === 只有蛋有移動/旋轉/生命變化時才同步 ===
        this.timeSinceLastSync += dt;
        if (this.timeSinceLastSync >= this.syncInterval) {
            const curPos = this.node.getPosition();
            const curRot = this.node.angle;
            const curLife = this.currentLife;

            if (
                !this.lastSyncedPos ||
                Math.abs(curPos.x - this.lastSyncedPos.x) > 1 ||
                Math.abs(curPos.y - this.lastSyncedPos.y) > 1 ||
                Math.abs(curRot - this.lastSyncedRot) > 0.5 ||
                curLife !== this.lastSyncedLife
            ) {
                this.syncStateToFirebase();
                this.lastSyncedPos = curPos.clone();
                this.lastSyncedRot = curRot;
                this.lastSyncedLife = curLife;
            }
            this.timeSinceLastSync = 0;
        }

        // ----------- **平滑插值顯示** -----------
        // 插值 position
        if (this.targetPos) {
            let cur = this.node.getPosition();
            let lerped = lerpVec2(cur, this.targetPos, this.lerpFactor);
            this.node.setPosition(lerped);
        }
        // 插值 rotation
        if (typeof this.targetRot === "number") {
            let curA = this.node.angle;
            let lerpedA = lerpAngle(curA, this.targetRot, this.lerpFactor);
            this.node.angle = lerpedA;
        }
        // 生命值可以直接跳變（不影響體感）
        if (typeof this.targetLife === "number" && this.currentLife !== this.targetLife) {
            this.currentLife = this.targetLife;
            this.updateEggAppearance();
        }
    }

    private initEggInFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        db.ref(`eggs/${this.eggId}`).once("value", (snap) => {
            if (!snap.exists()) {
                db.ref(`eggs/${this.eggId}`).set({
                    life: this.currentLife,
                    position: { x: Math.round(this.node.x), y: Math.round(this.node.y) },
                    rotation: Math.round(this.node.angle)
                });
                cc.log(`[Egg][${this.eggId}] 初始化到 Firebase`);
            }
        });
    }

    private listenToFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        cc.log(`[Egg][${this.eggId}] listenToFirebase 被呼叫！`);
        if (!db) return;
        db.ref(`eggs/${this.eggId}`).on("value", (snap) => {
            const data = snap.val();
            cc.log(`[Egg][${this.eggId}] [監聽] Firebase 狀態：`, data);
            if (!data) return;

            // 更新「目標狀態」（update 裡插值用）
            if (data.position) {
                this.targetPos = cc.v2(data.position.x, data.position.y);
            }
            if (typeof data.rotation === "number") {
                this.targetRot = data.rotation;
            }
            if (typeof data.life === "number") {
                this.targetLife = data.life;
            }
        });
    }

    private syncStateToFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        db.ref(`eggs/${this.eggId}`).update({
            life: this.currentLife,
            position: { x: Math.round(this.node.x), y: Math.round(this.node.y) },
            rotation: Math.round(this.node.angle)
        });
        cc.log(`[Egg][${this.eggId}] [寫入] Firebase:`, {
            life: this.currentLife,
            position: { x: Math.round(this.node.x), y: Math.round(this.node.y) },
            rotation: Math.round(this.node.angle)
        });
    }

    private updateEggAppearance() {
        if (!this.sprite) return;
        if (this.currentLife <= 0 && this.brokenSprite) {
            this.sprite.spriteFrame = this.brokenSprite;
        } else if (this.currentLife < this.maxLife && this.crackedSprite) {
            this.sprite.spriteFrame = this.crackedSprite;
        } else if (this.normalSprite) {
            this.sprite.spriteFrame = this.normalSprite;
        }
    }

    private die() {
        if (!this.isAlive) return;
        this.isAlive = false;
        this.currentLife = 0;
        this.updateEggAppearance();
        cc.log(`[Egg][${this.eggId}] [死亡] Egg broken. Respawning in 3 seconds...`);
        this.scheduleOnce(() => this.respawn(), 3);
    }

    public respawn() {
        this.node.setPosition(this.respawnPoint);
        if (this.rb) {
            this.rb.linearVelocity = cc.v2(0, 0);
            this.rb.angularVelocity = 0;
            this.rb.awake = true;
        }
        this.currentLife = this.maxLife;
        this.updateEggAppearance();
        this.isAlive = true;
        this.velocity = cc.v2(0, 0);
        this.lastGroundContact = null;
        this.lastY = this.node.y;
        const collider = this.getComponent(cc.PhysicsBoxCollider);
        if (collider) {
            collider.enabled = true;
            collider.apply();
        }

        // respawn 也立刻套用到「插值目標」
        this.targetPos = this.node.getPosition().clone();
        this.targetRot = this.node.angle;
        this.targetLife = this.currentLife;
    }
}
