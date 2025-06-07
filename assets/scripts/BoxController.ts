// BoxController.ts (Final Authoritative Version)
import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

function lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
}

@ccclass
export default class BoxController extends cc.Component {
    @property({ tooltip: "Firebase 上的 box ID" })
    boxId: string = "box1";

    @property({ tooltip: "插值速度 (建議 10-20)" })
    lerpSpeed: number = 15;

    private isControlling: boolean = false;
    private targetPosition: cc.Vec2 = null;
    private targetRotation: number = 0;
    private touchingPlayerIds: Set<string> = new Set();
    private rb: cc.RigidBody = null;
    private initialPosition: cc.Vec2 = null;
    private syncInterval = 0.05;
    private timeSinceLastSync = 0;

    onLoad() {
        this.rb = this.getComponent(cc.RigidBody);
        this.initialPosition = cc.v2(this.node.position.x, this.node.position.y);
        this.targetPosition = cc.v2(this.node.position.x, this.node.position.y);
        this.targetRotation = this.node.angle;
        this.initializeWithTransaction();
        this.listenToFirebase();
    }

    update(dt: number) {
        if (this.isControlling) {
            // Controller runs physics and sends updates.
            this.timeSinceLastSync += dt;
            if (this.timeSinceLastSync >= this.syncInterval) {
                this.syncStateToFirebase();
                this.timeSinceLastSync = 0;
            }
        } else {
            // Remote smoothly interpolates.
            if (this.targetPosition) {
                 const targetVec3 = new cc.Vec3(this.targetPosition.x, this.targetPosition.y, 0);
                 this.node.position = this.node.position.lerp(targetVec3, dt * this.lerpSpeed);
            }
            if (typeof this.targetRotation === "number") {
                this.node.angle = lerpAngle(this.node.angle, this.targetRotation, dt * this.lerpSpeed);
            }
        }
    }
    
    onBeginContact(contact, self, other) {
        const playerComp = other.node.getComponent("Player") || other.node.getComponent("Other-Player");
        if (playerComp?.playerId) {
            this.touchingPlayerIds.add(playerComp.playerId);
            this.tryTakeControl(playerComp.playerId);
        }
    }

    onEndContact(contact, self, other) {
        const playerComp = other.node.getComponent("Player") || other.node.getComponent("Other-Player");
        if (playerComp?.playerId) {
            this.touchingPlayerIds.delete(playerComp.playerId);
        }
    }
    
    private initializeWithTransaction() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        const localId = cc.sys.localStorage.getItem("playerId");
        const boxRef = db.ref(`boxes/${this.boxId}`);
        boxRef.transaction((data) => {
            if (data === null) return {
                position: { x: Math.round(this.initialPosition.x), y: Math.round(this.initialPosition.y), rotation: Math.round(this.node.angle) },
                controllerId: localId
            };
        });
    }

    private tryTakeControl(newPlayerId: string) {
        const localId = cc.sys.localStorage.getItem("playerId");
        const ref = FirebaseManager.getInstance().database.ref(`boxes/${this.boxId}/controllerId`);
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
        const boxRef = db.ref(`boxes/${this.boxId}`);
        boxRef.on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            this.isControlling = (data.controllerId === localId);
            if (this.rb) {
                this.rb.enabled = this.isControlling;
            }

            if (!this.isControlling && data.position) {
                this.targetPosition = cc.v2(data.position.x, data.position.y);
                this.targetRotation = data.position.rotation || 0;
            }
        });
    }

    private syncStateToFirebase() {
        if (!this.isControlling) return;
        FirebaseManager.getInstance().database.ref(`boxes/${this.boxId}/position`).set({
            x: Math.round(this.node.x),
            y: Math.round(this.node.y),
            rotation: Math.round(this.node.angle)
        });
    }
}