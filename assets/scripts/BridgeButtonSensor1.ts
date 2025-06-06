import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeButtonSensor1 extends cc.Component {
    @property(cc.Node)
    bridge: cc.Node = null;

    @property({ tooltip: "監聽的 Box ID（Firebase）" })
    boxId: string = "box3";

    @property({ tooltip: "Firebase 上對應的 sensor ID" })
    sensorId: string = "sensor1";

    private playerCount: number = 0;
    private itemCount: number = 0;
    private remotePlayerCount: number = 0;

    private firebase = null;
    private isControlling = false;
    private hasUploadedInitialInfo = false;

    onLoad() {
        this.firebase = FirebaseManager.getInstance();
        if (!this.firebase?.database) return;

        const localId = cc.sys.localStorage.getItem("playerId");

        // ✅ 初始化 sensor 的 position 與 size
        this.uploadSensorInitialInfo();

        // ✅ 嘗試成為 controller
        this.firebase.database.ref(`sensors/${this.sensorId}/controllerId`).once("value", (snap) => {
            const val = snap.val();
            if (!val) {
                this.firebase.database.ref(`sensors/${this.sensorId}`).update({ controllerId: localId });
                this.isControlling = true;
            } else if (val === localId) {
                this.isControlling = true;
            }
        });

        // ✅ 監聽 sensor 狀態變化（所有人）
        this.firebase.database.ref(`sensors/${this.sensorId}/triggered`).on("value", (snap) => {
            const val = snap.val();
            if (val === true) {
                this.tryStartBridge();
            } else {
                this.tryStopBridge();
            }
        });

        // ✅ 監聽玩家位置（所有人）
        this.firebase.database.ref("players").on("value", (snapshot) => {
            const players = snapshot.val();
            let count = 0;
            const sensorPos = this.node.convertToWorldSpaceAR(cc.v2());
            const size = this.node.getContentSize();
            const halfWidth = size.width / 2 * this.node.scaleX;
            const halfHeight = size.height / 2 * this.node.scaleY;

            for (const playerId in players) {
                const p = players[playerId];
                if (typeof p?.x !== "number" || typeof p?.y !== "number") continue;

                const dx = Math.abs(p.x - sensorPos.x);
                const dy = Math.abs(p.y - sensorPos.y);

                if (dx <= halfWidth && dy <= halfHeight) {
                    count++;
                }
            }

            this.remotePlayerCount = count;
        });

        this.schedule(this.checkBoxOverlap.bind(this), 0.1);
    }

    private uploadSensorInitialInfo() {
        if (this.hasUploadedInitialInfo) return;
        const pos = this.node.convertToWorldSpaceAR(cc.v2());
        const size = this.node.getContentSize();

        this.firebase.database.ref(`sensors/${this.sensorId}/info`).set({
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            width: Math.round(size.width * this.node.scaleX),
            height: Math.round(size.height * this.node.scaleY)
        });

        this.hasUploadedInitialInfo = true;
    }

    private checkBoxOverlap() {
        if (!this.isControlling) return;

        const boxRef = this.firebase.database.ref(`boxes/${this.boxId}/position`);
        boxRef.once("value", (snap) => {
            const pos = snap.val();
            if (!pos) return;

            const sensorPos = this.node.convertToWorldSpaceAR(cc.v2());
            const size = this.node.getContentSize();
            const halfWidth = size.width / 2 * this.node.scaleX;
            const halfHeight = size.height / 2 * this.node.scaleY;

            const dx = Math.abs(pos.x - sensorPos.x);
            const dy = Math.abs(pos.y - sensorPos.y);
            const inRange = dx <= halfWidth && dy <= halfHeight;

            // ✅ 只在狀態變化時才更新 Firebase
            this.firebase.database.ref(`sensors/${this.sensorId}/triggered`).once("value", (triggerSnap) => {
                const wasTriggered = triggerSnap.val();
                if (wasTriggered !== inRange) {
                    this.firebase.database.ref(`sensors/${this.sensorId}`).update({ triggered: inRange });
                    cc.log(`[BridgeSensor] ✅ updated sensor ${this.sensorId} triggered=${inRange}`);
                }
            });
        });
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === "Player") {
            this.playerCount++;
        } else if (otherCollider.node.group === "Item") {
            this.itemCount++;
        }
    }

    onEndContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === "Player") {
            this.playerCount = Math.max(0, this.playerCount - 1);
        } else if (otherCollider.node.group === "Item") {
            this.itemCount = Math.max(0, this.itemCount - 1);
        }
    }

    private tryStartBridge() {
        this.bridge.getComponent("BridgeMoveController")?.startOscillation();
    }

    private tryStopBridge() {
        this.bridge.getComponent("BridgeMoveController")?.stopOscillation();
    }
}
