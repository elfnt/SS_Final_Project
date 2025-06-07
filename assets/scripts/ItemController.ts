// ItemController.ts (Final Authoritative Version)
import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class ItemController extends cc.Component {
    @property({ tooltip: "Firebase 上的 item ID" })
    itemId: string = "item1";

    @property({ tooltip: "插值速度 (建議 10-20)" })
    lerpSpeed: number = 15;

    private isControlling: boolean = false;
    private targetPos: cc.Vec2 = null;
    private rb: cc.RigidBody = null;
    private initialPosition: cc.Vec2 = null;
    private syncInterval = 0.1;
    private timeSinceLastSync = 0;

    onLoad() {
        const pos3 = this.node.position.clone();
        this.initialPosition = cc.v2(pos3.x, pos3.y);
        this.targetPos = this.initialPosition.clone();
        this.rb = this.getComponent(cc.RigidBody);
        this.initializeWithTransaction();
        this.listenToFirebase();
    }

    update(dt: number) {
        if (!this.node.active) return;
        if (this.isControlling) {
            // Controller's logic: Send updates periodically
            this.timeSinceLastSync += dt;
            if (this.timeSinceLastSync >= this.syncInterval) {
                this.syncStateToFirebase();
                this.timeSinceLastSync = 0;
            }
        } else {
            // Remote's logic: Smoothly interpolate to the target position
            if (this.targetPos) {
                 const targetVec3 = new cc.Vec3(this.targetPos.x, this.targetPos.y, 0);
                 this.node.position = this.node.position.lerp(targetVec3, dt * this.lerpSpeed);
            }
        }
    }

    private initializeWithTransaction() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        const localId = cc.sys.localStorage.getItem("playerId");
        const itemRef = db.ref(`items/${this.itemId}`);
        itemRef.transaction((data) => {
            if (data === null) return {
                active: true,
                position: { x: Math.round(this.initialPosition.x), y: Math.round(this.initialPosition.y) },
                controllerId: localId // First player becomes permanent controller
            };
        });
    }

    private listenToFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        const localId = cc.sys.localStorage.getItem("playerId");
        db.ref(`items/${this.itemId}`).on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data || data.active === false) { this.node.active = false; return; }
            this.node.active = true;
            
            this.isControlling = (data.controllerId === localId);
            if (this.rb) {
                this.rb.enabled = this.isControlling;
            }
            if (!this.isControlling && data.position) {
                this.targetPos = cc.v2(data.position.x, data.position.y);
            }
        });
    }

    private syncStateToFirebase() {
        if (!this.isControlling) return;
        const curPos = this.node.getPosition();
        FirebaseManager.getInstance().database.ref(`items/${this.itemId}`).update({
            'position/x': Math.round(curPos.x),
            'position/y': Math.round(curPos.y)
        });
    }
    
    // --- Public Methods for Player Script to Call ---
    public onPickedUpByPlayer() {
        if (!this.isControlling) return;
        FirebaseManager.getInstance().database.ref(`items/${this.itemId}/active`).set(false);
    }
    
    public onDroppedByPlayer(dropPos: cc.Vec2) {
        if (!this.isControlling) return;
        FirebaseManager.getInstance().database.ref(`items/${this.itemId}`).update({
            active: true,
            position: { x: Math.round(dropPos.x), y: Math.round(dropPos.y) }
        });
    }
}