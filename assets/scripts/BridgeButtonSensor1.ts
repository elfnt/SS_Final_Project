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
    private remotePlayerCount: number = 0;

    onLoad() {
        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database) return;

        // ✅ 監聽 box 位置（舊功能）
        firebase.database.ref(`boxes/${this.boxId}/position`).on("value", (snapshot) => {
            const pos = snapshot.val();
            if (!pos) return;

            const boxPos = cc.v2(pos.x, pos.y);
            this.checkOverlapWithSensor(boxPos, "Box");
        });

        // ✅ 監聽所有玩家位置（新功能）
        firebase.database.ref("players").on("value", (snapshot) => {
            const players = snapshot.val();
            let count = 0;
            const sensorPos = this.node.getPosition();
            const size = this.node.getContentSize();

            for (const playerId in players) {
                const p = players[playerId];
                if (!p?.x || !p?.y) continue;

                const dx = Math.abs(p.x - sensorPos.x);
                const dy = Math.abs(p.y - sensorPos.y);

                if (dx <= size.width / 2 && dy <= size.height / 2) {
                    count++;
                }
            }

            this.remotePlayerCount = count;
            this.tryStartBridge();
            this.tryStopBridge();
        });
    }

    private checkOverlapWithSensor(pos: cc.Vec2, type: string) {
        const sensorPos = this.node.getPosition();
        const size = this.node.getContentSize();

        const inRange =
            Math.abs(pos.x - sensorPos.x) <= size.width / 2 &&
            Math.abs(pos.y - sensorPos.y) <= size.height / 2;

        if (type === "Box") {
            if (inRange && !this.boxTriggered) {
                this.boxTriggered = true;
                this.tryStartBridge();
            } else if (!inRange && this.boxTriggered) {
                this.boxTriggered = false;
                this.tryStopBridge();
            }
        }
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
        if (
            this.playerCount > 0 ||
            this.remotePlayerCount > 0 ||
            this.itemCount > 0 ||
            this.boxTriggered
        ) {
            this.bridge.getComponent("BridgeMoveController")?.startOscillation();
        }
    }

    private tryStopBridge() {
        if (
            this.playerCount === 0 &&
            this.remotePlayerCount === 0 &&
            this.itemCount === 0 &&
            !this.boxTriggered
        ) {
            this.bridge.getComponent("BridgeMoveController")?.stopOscillation();
        }
    }
}
