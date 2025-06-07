// ItemController.ts (Final Version with Public Methods)
import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

// NEW: Re-using the lerp helper function
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

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
        this.initialPosition = cc.v2(this.node.position.x, this.node.position.y);
        this.targetPos = this.initialPosition.clone();
        this.rb = this.getComponent(cc.RigidBody);
        this.initializeWithTransaction();
        this.listenToFirebase();
    }

    update(dt: number) {
        if (!this.node.active) return;
        if (this.isControlling) {
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
            if (this.rb) this.rb.enabled = this.isControlling;
            if (!this.isControlling && data.position) this.targetPos = cc.v2(data.position.x, data.position.y);
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
    
    // --- NEWLY ADDED PUBLIC METHODS FOR PLAYER SCRIPT TO CALL ---
    /**
     * Called by the Player script when it wants to pick this item up.
     */
    public onPickedUpByPlayer() {
        // Only the authoritative controller for this item can confirm the pickup in the database.
        if (!this.isControlling) {
            console.log(`[ItemController] A remote player picked me up, but I am the controller. Ignoring remote command.`);
            return;
        }
        console.log(`[ItemController] I am the controller and I've been picked up. Updating Firebase.`);
        FirebaseManager.getInstance().database.ref(`items/${this.itemId}/active`).set(false);
    }
    
    /**
     * Called by the Player script when it wants to drop this item.
     * @param dropPos The world position where the item should be dropped.
     */
    public onDroppedByPlayer(dropPos: cc.Vec2) {
        // Only the authoritative controller can set the new position in the database.
        if (!this.isControlling) return;
        
        console.log(`[ItemController] I am the controller and I've been dropped. Updating Firebase.`);
        FirebaseManager.getInstance().database.ref(`items/${this.itemId}`).update({
            active: true,
            position: { x: Math.round(dropPos.x), y: Math.round(dropPos.y) }
        });
    }
}