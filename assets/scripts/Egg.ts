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

    @property({ type: cc.SpriteFrame }) normalSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame }) crackedSprite: cc.SpriteFrame = null;
    @property({ type: cc.SpriteFrame }) brokenSprite: cc.SpriteFrame = null;
    @property maxLife = 100;
    @property({ tooltip: 'Name of the ground group' }) groundGroup = 'Ground';
    @property({ tooltip: "插值速度 (建議 10-20)" }) lerpSpeed: number = 15;

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
        this.respawnPoint = cc.v2(this.node.x, this.node.y);
        this.currentLife = this.maxLife;
        this.lastY = this.node.y;
        this.targetPos = cc.v2(this.node.x, this.node.y);
        this.targetRot = this.node.angle;
        this.initializeWithTransaction();
        this.listenToFirebase();
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        const playerComp = otherCollider.node.getComponent("Player") || otherCollider.node.getComponent("Other-Player");
        if (playerComp?.playerId) {
            this.touchingPlayerIds.add(playerComp.playerId);
            this.tryTakeControl(playerComp.playerId);
        }
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
        if (playerComp?.playerId) this.touchingPlayerIds.delete(playerComp.playerId);
        if (!this.isControlling || otherCol.node.group !== this.groundGroup) return;
        this.lastY = this.node.y;
    }

    update(dt: number) {
        if (!this.isAlive) return;
        if (this.isControlling) {
            if (this.node.y > this.lastY) this.lastY = this.node.y;
            this.timeSinceLastSync += dt;
            if (this.timeSinceLastSync >= this.syncInterval) {
                this.syncStateToFirebase();
                this.timeSinceLastSync = 0;
            }
        } else {
            if (this.targetPos) {
                const targetPos3 = new cc.Vec3(this.targetPos.x, this.targetPos.y, this.node.position.z);
                this.node.position = this.node.position.lerp(targetPos3, dt * this.lerpSpeed);
            }
            if (typeof this.targetRot === "number") this.node.angle = lerpAngle(this.node.angle, this.targetRot, dt * this.lerpSpeed);
        }
    }
    
    private initializeWithTransaction() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        const localId = cc.sys.localStorage.getItem("playerId");
        const eggRef = db.ref(`eggs/${this.eggId}`);
        eggRef.transaction((data) => {
            if (data === null) return {
                life: this.maxLife,
                position: { x: Math.round(this.node.x), y: Math.round(this.node.y) },
                rotation: Math.round(this.node.angle),
                controllerId: localId
            };
        }, (error) => { if (error) cc.error('[Egg] Transaction failed!', error); });
    }

    private tryTakeControl(newPlayerId: string) {
        const localId = cc.sys.localStorage.getItem("playerId");
        const ref = FirebaseManager.getInstance().database.ref(`eggs/${this.eggId}/controllerId`);
        ref.once("value", snapshot => {
            const currentController = snapshot.val();
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
            if (!data) { this.node.active = false; return; }
            this.node.active = true;
            this.isControlling = data.controllerId === localId;
            if (this.rb) this.rb.enabled = this.isControlling;
            if (typeof data.life === "number" && this.currentLife !== data.life) {
                this.currentLife = data.life;
                this.updateEggAppearance();
                if (this.currentLife <= 0) this.die(); else this.isAlive = true;
            }
            if (!this.isControlling) {
                if (data.position) this.targetPos = cc.v2(data.position.x, data.position.y);
                if (typeof data.rotation === "number") this.targetRot = data.rotation;
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
        if (this.currentLife <= 0) this.sprite.spriteFrame = this.brokenSprite;
        else if (this.currentLife < this.maxLife) this.sprite.spriteFrame = this.crackedSprite;
        else this.sprite.spriteFrame = this.normalSprite;
    }

    private die() {
        if (!this.isAlive) return;
        this.isAlive = false;
        if (this.isControlling) this.scheduleOnce(() => this.respawn(), 3);
    }

    public respawn() {
        if (!this.isControlling) return;
        FirebaseManager.getInstance().database.ref(`eggs/${this.eggId}`).update({
            life: this.maxLife,
            position: { x: Math.round(this.respawnPoint.x), y: Math.round(this.respawnPoint.y) },
            rotation: 0
        }).then(() => {
            this.node.setPosition(this.respawnPoint);
            this.node.angle = 0;
            this.lastY = this.node.y;
            if (this.rb) { this.rb.linearVelocity = cc.v2(0, 0); this.rb.angularVelocity = 0; }
        });
    }
}