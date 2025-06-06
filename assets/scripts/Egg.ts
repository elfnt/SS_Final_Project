import FirebaseManager from "./FirebaseManager";
const { ccclass, property } = cc._decorator;

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

    private syncInterval = 0.1;
    private timeSinceLastSync = 0;

    onLoad() {
        this.sprite = this.getComponent(cc.Sprite) || this.node.getComponentInChildren(cc.Sprite);
        if (this.sprite && this.normalSprite) this.sprite.spriteFrame = this.normalSprite;

        this.rb = this.getComponent(cc.RigidBody);
        this.respawnPoint = this.node.getPosition().clone();
        this.currentLife = this.maxLife;
        this.lastY = this.node.y;

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

    // ... 你的落地、受傷邏輯照舊 ...

    update(dt: number) {
        if (!this.isAlive) return;
        if (!this.rb) {
            this.velocity.y += -20 * dt;
            let pos = this.node.position;
            pos.y += this.velocity.y;
            this.node.setPosition(pos);
        }
        if (this.node.y > this.lastY) this.lastY = this.node.y;

        // ====== 所有人都會定時同步自己的蛋狀態到雲端 ======
        this.timeSinceLastSync += dt;
        if (this.timeSinceLastSync >= this.syncInterval) {
            this.syncStateToFirebase();
            this.timeSinceLastSync = 0;
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
            // 無論是不是自己都強制同步（但同步速度太快時畫面可能會有些小衝突，通常夠用了）
            this.node.setPosition(data.position.x, data.position.y);
            this.node.angle = data.rotation || 0;
            this.currentLife = data.life;
            this.updateEggAppearance();
            cc.log(`[Egg][${this.eggId}] [套用] position(${data.position.x}, ${data.position.y}) rotation(${data.rotation}), life(${data.life})`);
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

        // ✅ 廣播蛋已重生事件給 Dropbox
        cc.systemEvent.emit("EGG_RESPAWNED");
        cc.log("[Egg] 🎉 EGG_RESPAWNED 廣播發送");
    }

}
