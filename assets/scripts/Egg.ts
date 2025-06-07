// Egg.ts (Refactored for Smooth Sync)
import FirebaseManager from "./FirebaseManager";
const { ccclass, property } = cc._decorator;

// --- Helper functions for interpolation ---
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
function lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
}

@ccclass
export default class Egg extends cc.Component {
    @property({ tooltip: "Firebase 上的蛋 ID" })
    eggId: string = "egg1";

    @property({ type: cc.SpriteFrame, tooltip: 'Normal egg appearance' }) normalSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame, tooltip: 'Cracked egg appearance' }) crackedSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame, tooltip: 'Broken egg appearance' }) brokenSprite: cc.SpriteFrame = null;
    @property maxLife = 100;
    @property({ tooltip: 'Name of the ground group' }) groundGroup = 'Ground';
    
    // --- NEW: Interpolation and control properties ---
    @property({ tooltip: "插值速度，越大越快跟上，建議 5-15" })
    lerpSpeed: number = 12;

    private isControlling: boolean = false;
    private controllerId: string = null;
    private targetPos: cc.Vec2 = null;
    private targetRot: number = 0;
    // ---

    private sprite: cc.Sprite = null;
    private currentLife = 100;
    private lastY = 0;
    private isAlive = true;
    private rb: cc.RigidBody = null;
    private respawnPoint: cc.Vec2 = null;
    
    private syncInterval = 0.05;
    private timeSinceLastSync = 0;

    onLoad() {
        this.sprite = this.getComponent(cc.Sprite) || this.node.getComponentInChildren(cc.Sprite);
        this.rb = this.getComponent(cc.RigidBody);

        this.respawnPoint = this.node.getPosition().clone();
        this.currentLife = this.maxLife;
        this.lastY = this.node.y;

        this.targetPos = this.node.getPosition().clone();
        this.targetRot = this.node.angle;

        this.initEggInFirebase();
        this.listenToFirebase();
    }

    // The old contact logic is only relevant for the controller now
    onBeginContact(contact, selfCollider, otherCollider) {
        if (!this.isControlling || !this.isAlive) return;

        const other = otherCollider.node;
        const name = other.name.toLowerCase();
        const isSafe = name.includes("spring") || name.includes("sponge");
        if (isSafe) return;
        if (other.group !== this.groundGroup) return;

        const fallHeight = this.lastY - this.node.y;
        if (fallHeight < 3) return;

        if (fallHeight > 100) {
            const normalized = Math.min((fallHeight - 100) / 400, 1);
            const damage = Math.floor(this.maxLife * normalized);
            const newLife = Math.max(0, this.currentLife - damage);
            
            // Controller updates the life value in Firebase
            // The listener will handle the visual change for all clients
            if (newLife !== this.currentLife) {
                FirebaseManager.getInstance().database.ref(`eggs/${this.eggId}/life`).set(newLife);
            }
        }
        this.lastY = this.node.y;
    }
    
    onEndContact(contact, selfCol, otherCol) {
        if (!this.isControlling) return;
        if (otherCol.node.group !== this.groundGroup) return;
        this.lastY = this.node.y;
    }

    update(dt: number) {
        if (!this.isAlive) return;

        if (this.isControlling) {
            // --- CONTROLLER LOGIC ---
            // Update lastY for fall damage calculation
            if (this.node.y > this.lastY) this.lastY = this.node.y;

            // Send updates periodically
            this.timeSinceLastSync += dt;
            if (this.timeSinceLastSync >= this.syncInterval) {
                this.syncStateToFirebase();
                this.timeSinceLastSync = 0;
            }
        } else {
            // --- REMOTE LOGIC ---
            // Smoothly interpolate towards the target state
            if (this.targetPos) {
                const lerpedPos2 = cc.v2(this.node.x, this.node.y).lerp(this.targetPos, dt * this.lerpSpeed);
                this.node.position = cc.v3(lerpedPos2.x, lerpedPos2.y, this.node.position.z);
            }
            if (typeof this.targetRot === "number") {
                this.node.angle = lerpAngle(this.node.angle, this.targetRot, dt * this.lerpSpeed);
            }
        }
    }

    private initEggInFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;

        const localId = cc.sys.localStorage.getItem("playerId");

        db.ref(`eggs/${this.eggId}`).once("value", (snap) => {
            if (!snap.exists()) {
                db.ref(`eggs/${this.eggId}`).set({
                    life: this.maxLife,
                    position: { x: Math.round(this.node.x), y: Math.round(this.node.y) },
                    rotation: Math.round(this.node.angle),
                    controllerId: localId // First client becomes controller
                });
                cc.log(`[Egg][${this.eggId}] 初始化到 Firebase, 控制者為 ${localId}`);
            }
        });
    }

    private listenToFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        
        const localId = cc.sys.localStorage.getItem("playerId");

        db.ref(`eggs/${this.eggId}`).on("value", (snap) => {
            const data = snap.val();
            if (!data) return;

            this.isControlling = data.controllerId === localId;
            this.controllerId = data.controllerId;

            if (this.rb) {
                this.rb.enabled = this.isControlling;
            }

            // Update local state for all clients from Firebase (the single source of truth)
            if (typeof data.life === "number" && this.currentLife !== data.life) {
                this.currentLife = data.life;
                this.updateEggAppearance();
                if (this.currentLife <= 0) {
                    this.die();
                } else {
                    this.isAlive = true; // Make sure it's alive if life is restored
                }
            }

            if (!this.isControlling) {
                // Remote clients update their targets for interpolation
                if (data.position) {
                    this.targetPos = cc.v2(data.position.x, data.position.y);
                }
                if (typeof data.rotation === "number") {
                    this.targetRot = data.rotation;
                }
            }
        });
    }

    private syncStateToFirebase() {
        // ONLY the controller sends its state
        if (!this.isControlling) return;

        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;

        db.ref(`eggs/${this.eggId}`).update({
            // Note: Life is updated separately on damage event for responsiveness
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
        this.updateEggAppearance(); // Visuals handled by listener
        cc.log(`[Egg][${this.eggId}] [死亡] Egg broken.`);

        // The controller is responsible for starting the respawn timer
        if (this.isControlling) {
            this.scheduleOnce(() => this.respawn(), 3);
        }
    }

    public respawn() {
        // Only the controller can execute the respawn and update Firebase
        if (!this.isControlling) return;
        
        cc.log(`[Egg][${this.eggId}] Respawning...`);
        
        // Controller resets its own physics state
        this.node.setPosition(this.respawnPoint);
        if (this.rb) {
            this.rb.linearVelocity = cc.v2(0, 0);
            this.rb.angularVelocity = 0;
            this.rb.awake = true;
        }
        this.lastY = this.node.y;
        
        // Controller tells Firebase the new state for everyone
        FirebaseManager.getInstance().database.ref(`eggs/${this.eggId}`).update({
            life: this.maxLife,
            position: { x: Math.round(this.respawnPoint.x), y: Math.round(this.respawnPoint.y) },
            rotation: 0
        });
    }
}