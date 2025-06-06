import FirebaseManager from "./FirebaseManager";
const { ccclass, property } = cc._decorator;

@ccclass
export default class Egg extends cc.Component {
    @property({ tooltip: "Firebase 上的蛋 ID" })
    eggId: string = "egg1";

    @property moveSpeed = 5;
    @property jumpForce = 10;
    @property({ type: cc.SpriteFrame, tooltip: 'Normal egg appearance' }) normalSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame, tooltip: 'Cracked egg appearance' }) crackedSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame, tooltip: 'Broken egg appearance' }) brokenSprite: cc.SpriteFrame = null;
    @property maxLife = 100;
    @property({ tooltip: 'Enable keyboard debug (C crack / B break)' }) enableDebugControls = true;
    @property({ tooltip: 'Name of the ground group' }) groundGroup = 'Ground';
    @property({ type: cc.Prefab, tooltip: '爆炸粒子特效 prefab' }) explosionPrefab: cc.Prefab = null;

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
            // 🔥 觸發爆炸粒子特效
            if (this.explosionPrefab) {
                const explosion = cc.instantiate(this.explosionPrefab);
                explosion.setPosition(this.node.getPosition()); // 或者改為 contact.getWorldManifold().points[0]
                this.node.parent.addChild(explosion); // 加到蛋的父節點或 Canvas 上
            }
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

    // 🚩🚩🚩 這才是所有人都同步的方式，會自動監聽變化
    private listenToFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        db.ref(`eggs/${this.eggId}`).on("value", (snap) => {
            const data = snap.val();
            if (!data) return;
            if (data.position) this.node.setPosition(data.position.x, data.position.y);
            if (typeof data.rotation === "number") this.node.angle = data.rotation;
            if (typeof data.life === "number" && this.currentLife !== data.life) {
                this.currentLife = data.life;
                this.updateEggAppearance();
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
    }
}
