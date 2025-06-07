// Egg.ts (Final Authoritative Version)
import FirebaseManager from "./FirebaseManager";
const { ccclass, property } = cc._decorator;

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

    @property({ type: cc.SpriteFrame })
    normalSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame })
    crackedSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame })
    brokenSprite: cc.SpriteFrame = null;

    @property
    maxLife = 100;

    @property({ tooltip: 'Name of the ground group' })
    groundGroup = 'Ground';

    @property({ tooltip: "插值速度 (建議 10-20)" })
    lerpSpeed: number = 15;

    // --- State Properties ---
    private isControlling: boolean = false;
    private targetPos: cc.Vec2 = null;
    private targetRot: number = 0;
    private touchingPlayerIds: Set<string> = new Set();
    
    private sprite: cc.Sprite = null;
    private currentLife = 100;
    private lastY = 0;
    private isAlive = true;
    private rb: cc.RigidBody = null;
    private respawnPoint: cc.Vec2 = null;
    
    private syncInterval = 0.05;
    private timeSinceLastSync = 0;

    onLoad() {
        this.sprite = this.getComponent(cc.Sprite);
        this.rb = this.getComponent(cc.RigidBody);
        this.respawnPoint = this.node.position.clone();
        this.currentLife = this.maxLife;
        this.lastY = this.node.y;
        this.targetPos = this.node.position.clone() as cc.Vec2;
        this.targetRot = this.node.angle;
        
        this.initializeWithTransaction();
        this.listenToFirebase();
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        // All clients check for touch so they know who is eligible to take control.
        const playerComp = otherCollider.node.getComponent("Player") || otherCollider.node.getComponent("Other-Player");
        if (playerComp?.playerId) {
            this.touchingPlayerIds.add(playerComp.playerId);
            this.tryTakeControl(playerComp.playerId);
        }

        // Only the authoritative controller calculates physics damage.
        if (!this.isControlling || !this.isAlive) return;
        if (otherCollider.node.group !== this.groundGroup) return;
        
        const fallHeight = this.lastY - this.node.y;
        if (fallHeight > 100) {
            const damage = Math.floor(this.maxLife * Math.min((fallHeight - 100) / 400, 1));
            const newLife = Math.max(0, this.currentLife - damage);
            if (newLife !== this.currentLife) {
                FirebaseManager.getInstance().database.ref(`eggs/${this.eggId}/life`).set(newLife);
            }
        }
        this.lastY = this.node.y;
    }
    
    onEndContact(contact, selfCol, otherCol) {
        const playerComp = otherCol.node.getComponent("Player") || otherCol.node.getComponent("Other-Player");
        if (playerComp?.playerId) {
            this.touchingPlayerIds.delete(playerComp.playerId);
        }

        if (!this.isControlling || otherCol.node.group !== this.groundGroup) return;
        this.lastY = this.node.y;
    }

    update(dt: number) {
        if (!this.isAlive) return;

        // The core of the synchronization logic: separate paths for controller and remotes.
        if (this.isControlling) {
            // I am the controller. I run physics and send updates to Firebase.
            if (this.node.y > this.lastY) {
                this.lastY = this.node.y;
            }
            this.timeSinceLastSync += dt;
            if (this.timeSinceLastSync >= this.syncInterval) {
                this.syncStateToFirebase();
                this.timeSinceLastSync = 0;
            }
        } else {
            // I am a remote. My physics is disabled. I only follow the controller's state.
            if (this.targetPos) {
                const targetVec3 = new cc.Vec3(this.targetPos.x, this.targetPos.y, 0);
                this.node.position = this.node.position.lerp(targetVec3, dt * this.lerpSpeed);
            }
            if (typeof this.targetRot === "number") {
                this.node.angle = lerpAngle(this.node.angle, this.targetRot, dt * this.lerpSpeed);
            }
        }
    }
    
    private initializeWithTransaction() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        const localId = cc.sys.localStorage.getItem("playerId");
        const eggRef = db.ref(`eggs/${this.eggId}`);

        eggRef.transaction((data) => {
            if (data === null) {
                // If the egg doesn't exist in the database, create it.
                // The first player to do this becomes the initial controller.
                return {
                    life: this.maxLife,
                    position: { x: Math.round(this.node.x), y: Math.round(this.node.y) },
                    rotation: Math.round(this.node.angle),
                    controllerId: localId
                };
            }
            // If data exists, do nothing (abort the transaction).
        }, (error) => { 
            if (error) cc.error('[Egg] Transaction failed!', error);
        });
    }

    private tryTakeControl(newPlayerId: string) {
        const localId = cc.sys.localStorage.getItem("playerId");
        const ref = FirebaseManager.getInstance().database.ref(`eggs/${this.eggId}/controllerId`);

        ref.once("value", snapshot => {
            const currentController = snapshot.val();
            // Take control if:
            // 1. The current controller is no longer touching the egg.
            // 2. The new player IS touching the egg.
            // 3. The new player is ME (this client).
            if ((!currentController || !this.touchingPlayerIds.has(currentController)) && this.touchingPlayerIds.has(newPlayerId) && newPlayerId === localId) {
                ref.set(newPlayerId);
            }
        });
    }

    private listenToFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        const localId = cc.sys.localStorage.getItem("playerId");

        db.ref(`eggs/${this.eggId}`).on("value", (snap) => {
            const data = snap.val();
            if (!data) {
                this.node.active = false;
                return;
            }
            this.node.active = true;

            // Update my role based on who Firebase says the controller is.
            this.isControlling = (data.controllerId === localId);
            if (this.rb) {
                this.rb.enabled = this.isControlling;
            }

            // Sync life value for all clients.
            if (typeof data.life === "number" && this.currentLife !== data.life) {
                this.currentLife = data.life;
                this.updateEggAppearance();
                if (this.currentLife <= 0) {
                    this.die();
                } else {
                    this.isAlive = true;
                }
            }

            // If I am a remote, update my target position to follow.
            if (!this.isControlling) {
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
        if (!this.isControlling) return;
        FirebaseManager.getInstance().database.ref(`eggs/${this.eggId}`).update({
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
        // The controller is responsible for initiating the respawn process.
        if (this.isControlling) {
            this.scheduleOnce(() => this.respawn(), 3);
        }
    }

    public respawn() {
        if (!this.isControlling) return;
        
        // The controller tells Firebase that the egg has respawned.
        FirebaseManager.getInstance().database.ref(`eggs/${this.eggId}`).update({
            life: this.maxLife,
            position: { x: Math.round(this.respawnPoint.x), y: Math.round(this.respawnPoint.y) },
            rotation: 0
        }).then(() => {
            // The controller also resets its own local physics state.
            this.node.setPosition(this.respawnPoint);
            this.node.angle = 0;
            this.lastY = this.node.y;
            if (this.rb) {
                this.rb.linearVelocity = cc.v2(0, 0);
                this.rb.angularVelocity = 0;
            }
        });
    }
}