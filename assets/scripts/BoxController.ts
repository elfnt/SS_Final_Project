import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class BoxLogicController extends cc.Component {
    @property({ tooltip: "Firebase 上的 box ID" })
    boxId: string = "box1";

    @property({ tooltip: "是否啟用自動重生（y < 門檻）" })
    enableAutoRespawn: boolean = true;

    @property({ tooltip: "y < ? 就會觸發重生" })
    fallThreshold: number = -1200;

    @property({ tooltip: "重生後停用幾秒（防止爭奪）" })
    respawnLockSeconds: number = 0.5;

    @property({ tooltip: "重生預設角度" })
    angleISet: number = 0;

    @property({ type: cc.Label, tooltip: "顯示剩餘人數的 Label" })
    labelNode: cc.Label = null;

    private rb: cc.RigidBody = null;
    private initialPosition: cc.Vec2 = null;
    private originalBodyType: number = null;

    private isRespawning: boolean = false;
    private isControlling: boolean = false;
    private controllerId: string = null;
    private touchingPlayerIds: Set<string> = new Set();

    private lastSentPos: cc.Vec2 = null;
    private lastSentRot: number = null;

    onLoad() {
        this.rb = this.getComponent(cc.RigidBody);
        this.initialPosition = this.node.getPosition().clone();
        this.originalBodyType = this.rb.type;

        const firebase = FirebaseManager.getInstance();
        const localId = cc.sys.localStorage.getItem("playerId");

        firebase.database.ref(`boxes/${this.boxId}/controllerId`).once("value", snapshot => {
            if (!snapshot.exists()) {
                firebase.database.ref(`boxes/${this.boxId}`).update({
                    controllerId: localId
                });
                cc.log(`[BoxLogic] 初始控制者設為 ${localId}`);
            }
        });

        this.listenToFirebase();
        this.uploadInitialPosition();
    }

    start() {
        this.schedule(() => {
            if (!this.isRespawning && this.isControlling) {
                this.tryUploadPosition();
            }
        }, 0.05);
    }

    update(dt: number) {
        if (this.enableAutoRespawn && !this.isRespawning && this.node.y < this.fallThreshold) {
            this.doRespawn();
        }
    }

    onBeginContact(contact, self, other) {
        const comp = other.node.getComponent("Player") || other.node.getComponent("Other-Player");
        const id = comp?.playerId;
        if (id) {
            this.touchingPlayerIds.add(id);
            this.tryTakeControl(id);
            this.updateRemainingStatus();
        }
    }

    onEndContact(contact, self, other) {
        const comp = other.node.getComponent("Player") || other.node.getComponent("Other-Player");
        const id = comp?.playerId;
        if (id) {
            this.touchingPlayerIds.delete(id);
            this.updateRemainingStatus();
        }
    }

    private tryTakeControl(id: string) {
        const localId = cc.sys.localStorage.getItem("playerId");
        const firebase = FirebaseManager.getInstance();
        firebase.database.ref(`boxes/${this.boxId}/controllerId`).once("value", snapshot => {
            const current = snapshot.val();
            if (!current || current === id) {
                if (id === localId) {
                    this.isControlling = true;
                    this.controllerId = id;
                    firebase.database.ref(`boxes/${this.boxId}`).update({ controllerId: id });
                    cc.log(`[BoxLogic] ${id} 成為控制者`);
                }
            }
        });
    }

    private tryUploadPosition() {
        const pos = this.node.getPosition();
        const angle = this.node.angle;

        const xChanged = !this.lastSentPos || Math.abs(pos.x - this.lastSentPos.x) > 0.5;
        const yChanged = !this.lastSentPos || Math.abs(pos.y - this.lastSentPos.y) > 0.5;
        const rotChanged = this.lastSentRot === null || Math.abs(angle - this.lastSentRot) > 1;

        if (xChanged || yChanged || rotChanged) {
            this.lastSentPos = pos.clone();
            this.lastSentRot = angle;
            const firebase = FirebaseManager.getInstance();
            firebase.database.ref(`boxes/${this.boxId}/position`).set({
                x: Math.round(pos.x),
                y: Math.round(pos.y),
                rotation: Math.round(angle)
            });
        }
    }

    private listenToFirebase() {
        const firebase = FirebaseManager.getInstance();
        const localId = cc.sys.localStorage.getItem("playerId");
        const boxRef = firebase.database.ref(`boxes/${this.boxId}`);

        boxRef.on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const remoteController = data.controllerId;
            this.controllerId = remoteController;
            this.isControlling = (remoteController === localId);

            this.isRespawning = !!data.isRespawn;

            const pos = data.position;
            if (!this.isControlling && pos) {
                this.node.setPosition(pos.x, pos.y);
                if (typeof pos.rotation === "number") {
                    this.node.angle = pos.rotation;
                }
            }
        });
    }

    private doRespawn() {
        this.isRespawning = true;
        const firebase = FirebaseManager.getInstance();
        const ref = firebase.database.ref(`boxes/${this.boxId}`);

        this.rb.enabled = false;
        this.node.setPosition(this.initialPosition);
        this.node.angle = this.angleISet;
        this.rb.linearVelocity = cc.Vec2.ZERO;
        this.rb.angularVelocity = 0;

        this.scheduleOnce(() => {
            this.rb.enabled = true;
            this.rb.awake = true;
        }, 0.05);

        ref.update({
            isRespawn: true,
            position: {
                x: Math.round(this.initialPosition.x),
                y: Math.round(this.initialPosition.y),
                rotation: Math.round(this.angleISet)
            }
        }).then(() => {
            cc.log(`[BoxLogic] isRespawn = true`);
            setTimeout(() => {
                ref.update({ isRespawn: false });
                this.isRespawning = false;
                cc.log(`[BoxLogic] isRespawn = false`);
            }, this.respawnLockSeconds * 1000);
        });
    }

    private uploadInitialPosition() {
        const firebase = FirebaseManager.getInstance();
        firebase.database.ref(`boxes/${this.boxId}/position`).set({
            x: Math.round(this.initialPosition.x),
            y: Math.round(this.initialPosition.y),
            rotation: Math.round(this.node.angle)
        });
    }

    private updateRemainingStatus() {
        let remaining: number;
        if (this.boxId === "box2") {
            remaining = Math.max(0, 1 - this.touchingPlayerIds.size);
        } else {
            remaining = Math.max(0, 3 - this.touchingPlayerIds.size);
        }

        if (this.labelNode) {
            this.labelNode.string = remaining.toString();
        }

        const firebase = FirebaseManager.getInstance();
        firebase.database.ref(`boxes/${this.boxId}`).update({
            status: remaining
        });
    }
}
