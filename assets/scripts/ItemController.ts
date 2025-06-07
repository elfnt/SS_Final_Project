// ItemController.ts (Refactored for Smooth Sync)
import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

// NEW: Re-using the lerp helper function
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

@ccclass
export default class ItemController extends cc.Component {
    @property({ tooltip: "Firebase 上的 item ID（每個物品唯一）" })
    itemId: string = "item1";

    // --- NEW: Properties for smooth interpolation ---
    @property({ tooltip: "插值速度，越大越快跟上，建議 5-15" })
    lerpSpeed: number = 10;
    
    private targetPosition: cc.Vec2 = null;
    // ---

    private rb: cc.RigidBody = null;
    private initialPosition: cc.Vec2 = null;
    private isControlling: boolean = false;

    private lastSentPos: cc.Vec2 = null;

    onLoad() {
        this.initialPosition = this.node.getPosition().clone();
        this.targetPosition = this.initialPosition.clone();
        this.rb = this.getComponent(cc.RigidBody);
        
        this.initItemInFirebase();
        this.listenToFirebase();
    }

    start() {
        // Schedule position updates only if this client is the controller
        this.schedule(() => {
            if (this.isControlling && this.node.active) {
                this.tryUploadPosition();
            }
        }, 0.1); // Can be less frequent for simple items
    }

    update(dt: number) {
        // Remote client logic: Smoothly interpolate towards the target position
        if (!this.isControlling && this.node.active && this.targetPosition) {
            const currentPos = this.node.getPosition();
            const newPos = currentPos.lerp(this.targetPosition, dt * this.lerpSpeed);
            this.node.setPosition(newPos);
        }
    }

    private tryUploadPosition() {
        const curPos = this.node.getPosition();
        if (
            !this.lastSentPos ||
            Math.abs(curPos.x - this.lastSentPos.x) > 1 ||
            Math.abs(curPos.y - this.lastSentPos.y) > 1
        ) {
            const db = FirebaseManager.getInstance()?.database;
            if (!db) return;

            db.ref(`items/${this.itemId}/position`).set({
                x: Math.round(curPos.x),
                y: Math.round(curPos.y)
            });
            this.lastSentPos = curPos.clone();
        }
    }

    private initItemInFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;

        const localId = cc.sys.localStorage.getItem("playerId");
        const itemRef = db.ref(`items/${this.itemId}`);

        itemRef.once("value", (snapshot) => {
            if (!snapshot.exists()) {
                itemRef.set({
                    active: true,
                    position: { x: Math.round(this.initialPosition.x), y: Math.round(this.initialPosition.y) },
                    controllerId: localId // First one here becomes the controller
                });
                cc.log(`[ItemController] 初始化 ${this.itemId} 到 Firebase, 控制者為 ${localId}`);
            }
        });
    }

    private listenToFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        
        const localId = cc.sys.localStorage.getItem("playerId");

        db.ref(`items/${this.itemId}`).on("value", (snapshot) => {
            const itemData = snapshot.val();
            if (!itemData) {
                this.node.active = false;
                return;
            }

            this.isControlling = (itemData.controllerId === localId);

            if (this.rb) {
                // Controller has physics, remote does not
                this.rb.enabled = this.isControlling;
            }
            
            this.node.active = itemData.active;

            if (!this.isControlling && itemData.position) {
                // We are a remote client, so update the target position for lerping
                this.targetPosition = cc.v2(itemData.position.x, itemData.position.y);
            }
        });
    }

    public resetToInitial() {
        if (!this.isControlling) return; // Only controller can reset

        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        db.ref(`items/${this.itemId}`).update({
            active: true,
            position: { x: Math.round(this.initialPosition.x), y: Math.round(this.initialPosition.y) }
        });
        // The listener will handle the position update for all clients
    }
}