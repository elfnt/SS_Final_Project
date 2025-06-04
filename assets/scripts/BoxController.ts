import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class BoxController extends cc.Component {

    @property({ tooltip: "Firebase 上的 box ID" })
    boxId: string = "box1";

    @property({ type: cc.Label, tooltip: "顯示剩餘人數的 Label" })
    labelNode: cc.Label = null;

    private touchingPlayerIds: Set<string> = new Set();
    private lastSentPos: cc.Vec2 = null;
    private isControlling: boolean = false;
    private initialPosition: cc.Vec2 = null;

    onLoad() {
        this.node.getComponent(cc.PhysicsBoxCollider)?.apply();
        this.initialPosition = this.node.getPosition().clone();
        this.listenToRemoteBoxPosition();
        this.setInitialBoxPositionToFirebase();
    }

    start() {
        this.resetToInitialPosition();
    }

    update() {
        if (!this.isControlling) return;

        const currentPos = this.node.getPosition();
        if (!this.lastSentPos || !currentPos.fuzzyEquals(this.lastSentPos, 0.5)) {
            this.lastSentPos = currentPos.clone();
            this.updateBoxPositionInFirebase();
        }
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        const playerComp = otherCollider.node.getComponent("Player") || otherCollider.node.getComponent("Other-Player");
        const playerId = playerComp?.playerId;
        cc.log(`[BoxController] 檢查 controller：目前接觸者 = ${playerId}`);
        if (playerId && !this.touchingPlayerIds.has(playerId)) {
            this.touchingPlayerIds.add(playerId);
            this.updateBoxStatusInFirebase();
            this.tryTakeControl(playerId);
        }
    }

    onEndContact(contact, selfCollider, otherCollider) {
        const playerComp = otherCollider.node.getComponent("Player") || otherCollider.node.getComponent("Other-Player");
        const playerId = playerComp?.playerId;

        if (playerId && this.touchingPlayerIds.has(playerId)) {
            this.touchingPlayerIds.delete(playerId);
            this.updateBoxStatusInFirebase();
            if (this.touchingPlayerIds.size === 0) {
                this.releaseControl();
            }
        }
    }

    private setInitialBoxPositionToFirebase() {
        const firebaseManager = FirebaseManager.getInstance();
        if (firebaseManager?.database) {
            firebaseManager.database.ref(`boxes/${this.boxId}/position`).set({
                x: Math.round(this.initialPosition.x),
                y: Math.round(this.initialPosition.y)
            });
            cc.log(`[BoxController] 初始位置已寫入 Firebase：(${this.initialPosition.x}, ${this.initialPosition.y})`);
        }
    }

    private resetToInitialPosition() {
        if (this.initialPosition) {
            this.node.setPosition(this.initialPosition);
            this.updateBoxPositionInFirebase();
        }
    }

    private updateBoxStatusInFirebase() {
        let remaining: number;
        if (this.boxId === "box2") {
            remaining = Math.max(0, 1 - this.touchingPlayerIds.size);
        } else {
            remaining = 3 - this.touchingPlayerIds.size;
        }

        if (this.labelNode) {
            this.labelNode.string = remaining.toString();
        }

        const firebaseManager = FirebaseManager.getInstance();
        if (firebaseManager?.database) {
            firebaseManager.database.ref(`boxes/${this.boxId}`).update({
                status: remaining
            });
        }
    }

    private updateBoxPositionInFirebase() {
        const firebaseManager = FirebaseManager.getInstance();
        if (firebaseManager?.database) {
            firebaseManager.database.ref(`boxes/${this.boxId}/position`).set({
                x: Math.round(this.node.x),
                y: Math.round(this.node.y)
            });
        }
    }

    private listenToRemoteBoxPosition() {
        const firebaseManager = FirebaseManager.getInstance();
        if (firebaseManager?.database) {
            firebaseManager.database.ref(`boxes/${this.boxId}/position`).on("value", (snapshot) => {
                const pos = snapshot.val();
                if (!this.isControlling && pos && (Math.abs(pos.x - this.node.x) > 0.5 || Math.abs(pos.y - this.node.y) > 0.5)) {
                    this.node.setPosition(pos.x, pos.y);
                }
            });
        }
    }

    private tryTakeControl(playerId: string) {
        const localId = cc.sys.localStorage.getItem("playerId");
        if (playerId === localId) {
            this.isControlling = true;
            cc.log(`[BoxController] 控制者設定為本機玩家：${playerId}`);
        } else {
            cc.log(`[BoxController] 玩家 ${playerId} 接觸了 box，但不是本機玩家 ${localId}`);
        }
    }

    private releaseControl() {
        this.isControlling = false;
    }
}
