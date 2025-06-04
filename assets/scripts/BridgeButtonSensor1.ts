import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeButtonSensor1 extends cc.Component {
    @property(cc.Node)
    bridge: cc.Node = null;

    @property({ tooltip: "監聽的 Box ID（Firebase）" })
    boxId: string = "box3";

    private playerCount: number = 0;
    private itemCount: number = 0;
    private boxTriggered: boolean = false;

    onLoad() {
        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database) return;

        // 監聽 Firebase 上 box 的位置
        firebase.database.ref(`boxes/${this.boxId}/position`).on("value", (snapshot) => {
            const pos = snapshot.val();
            if (!pos) return;

            const boxPos = cc.v2(pos.x, pos.y);
            const sensorPos = this.node.getPosition();
            const size = this.node.getContentSize();

            // 檢查是否在 sensor 範圍內
            const inRange =
                Math.abs(boxPos.x - sensorPos.x) <= size.width / 2 &&
                Math.abs(boxPos.y - sensorPos.y) <= size.height / 2;

            if (inRange && !this.boxTriggered) {
                this.boxTriggered = true;
                this.tryStartBridge();
            } else if (!inRange && this.boxTriggered) {
                this.boxTriggered = false;
                this.tryStopBridge();
            }
        });
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === "Player") {
            this.playerCount++;
        } else if (otherCollider.node.group === "Item") {
            this.itemCount++;
        }
        this.tryStartBridge();
    }

    onEndContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === "Player") {
            this.playerCount = Math.max(0, this.playerCount - 1);
        } else if (otherCollider.node.group === "Item") {
            this.itemCount = Math.max(0, this.itemCount - 1);
        }
        this.tryStopBridge();
    }

    private tryStartBridge() {
        if (this.playerCount > 0 || this.itemCount > 0 || this.boxTriggered) {
            this.bridge.getComponent("BridgeMoveController")?.startOscillation();
        }
    }

    private tryStopBridge() {
        if (this.playerCount === 0 && this.itemCount === 0 && !this.boxTriggered) {
            this.bridge.getComponent("BridgeMoveController")?.stopOscillation();
        }
    }
}
