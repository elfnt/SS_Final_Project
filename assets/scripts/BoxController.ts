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
    private lastSentRot: number = null;
    private isControlling: boolean = false;
    private initialPosition: cc.Vec2 = null;

    onLoad() {
        this.node.getComponent(cc.PhysicsBoxCollider)?.apply();
    }

    start() {
        this.scheduleOnce(() => {
            this.initialPosition = this.node.getPosition().clone();

            const firebaseManager = FirebaseManager.getInstance();
            if (firebaseManager?.database) {
                firebaseManager.database.ref(`boxes/${this.boxId}/position`).set({
                    x: Math.round(this.initialPosition.x),
                    y: Math.round(this.initialPosition.y),
                    rotation: Math.round(this.node.angle)
                });
                cc.log(`[→ BoxController] 設定 box '${this.boxId}' 初始位置與角度: (${this.initialPosition.x}, ${this.initialPosition.y}, rot=${this.node.angle})`);
            }

            this.listenToRemoteBoxPosition();
            this.node.setPosition(this.initialPosition);
        }, 0);
    }

    update() {
        const currentPos = this.node.getPosition();
        const currentRot = this.node.angle;

        const xChanged = !this.lastSentPos || Math.abs(currentPos.x - this.lastSentPos.x) > 0.5;
        const yChanged = !this.lastSentPos || Math.abs(currentPos.y - this.lastSentPos.y) > 0.5;
        const rotChanged = this.lastSentRot === null || Math.abs(currentRot - this.lastSentRot) > 1;

        if (xChanged || yChanged || rotChanged) {
            this.lastSentPos = currentPos.clone();
            this.lastSentRot = currentRot;
            this.updateBoxPositionInFirebase();
        }
    }

    private updateBoxPositionInFirebase() {
        const firebaseManager = FirebaseManager.getInstance();
        if (firebaseManager?.database) {
            firebaseManager.database.ref(`boxes/${this.boxId}/position`).set({
                x: Math.round(this.node.x),
                y: Math.round(this.node.y),
                rotation: Math.round(this.node.angle)
            });
        }
    }

    private listenToRemoteBoxPosition() {
        const firebaseManager = FirebaseManager.getInstance();
        if (firebaseManager?.database) {
            firebaseManager.database.ref(`boxes/${this.boxId}/position`).on("value", (snapshot) => {
                const pos = snapshot.val();
                if (!this.isControlling && pos) {
                    if (Math.abs(pos.x - this.node.x) > 0.5 || Math.abs(pos.y - this.node.y) > 0.5) {
                        this.node.setPosition(pos.x, pos.y);
                    }
                    if (typeof pos.rotation === "number" && Math.abs(pos.rotation - this.node.angle) > 1) {
                        this.node.angle = pos.rotation;
                    }
                }
            });
        }
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        const playerComp =
            otherCollider.node.getComponent("Player") ||
            otherCollider.node.getComponent("Other-Player");
        const playerId = playerComp?.playerId;
        cc.log(`[BoxController] 檢查 controller：目前接觸者 = ${playerId}`);
        if (playerId && !this.touchingPlayerIds.has(playerId)) {
            this.touchingPlayerIds.add(playerId);
            this.updateBoxStatusInFirebase();
            this.tryTakeControl(playerId);
        }
    }

    onEndContact(contact, selfCollider, otherCollider) {
        const playerComp =
            otherCollider.node.getComponent("Player") ||
            otherCollider.node.getComponent("Other-Player");
        const playerId = playerComp?.playerId;

        if (playerId && this.touchingPlayerIds.has(playerId)) {
            this.touchingPlayerIds.delete(playerId);
            this.updateBoxStatusInFirebase();
            if (this.touchingPlayerIds.size === 0) {
                this.releaseControl();
            }
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
