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
    private boxTriggered: boolean = false;
    private maxRetry = 10;
    private retryInterval = 0.5;

    onLoad() {
        this.forceResetBoxTriggered(() => this.initWithRetry(0));
    }

    private forceResetBoxTriggered(callback: () => void) {
        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database) {
            cc.error(`[Sensor] ❌ 無法重設 boxTriggered，Firebase 尚未就緒`);
            return;
        }

        const path = `boxes/${this.boxId}/boxTriggered`;
        firebase.database.ref(path).set(false)
            .then(() => {
                cc.log(`[Sensor] 🧹 強制初始化 boxTriggered=false`);
                callback();
            })
            .catch(err => cc.error(`[Sensor] ❌ 強制初始化失敗`, err));
    }

    private initWithRetry(attempt: number) {
        const firebase = FirebaseManager.getInstance();
        if (!firebase || !firebase.database) {
            if (attempt >= this.maxRetry) {
                cc.error(`[Sensor] ❌ Firebase 初始化失敗：超過重試次數 ${this.maxRetry}`);
                return;
            }

            cc.warn(`[Sensor] ⏳ Firebase 尚未就緒，延遲再試... (${attempt + 1})`);
            this.scheduleOnce(() => this.initWithRetry(attempt + 1), this.retryInterval);
            return;
        }

        this.init(firebase);
    }

    private init(firebase: FirebaseManager) {
        cc.log(`[Sensor] ✅ Firebase 就緒，初始化感應器，boxId="${this.boxId}"`);

        const path = `boxes/${this.boxId}/boxTriggered`;

        // ✅ 監聽 boxTriggered 狀態同步
        firebase.database.ref(path).on("value", (snapshot) => {
            const val = snapshot.val();
            if (typeof val === "boolean") {
                this.boxTriggered = val;
                cc.log(`[Sensor] 🟡 boxTriggered（來自 Firebase）= ${val}`);
                if (val) this.tryStartBridge();
                else this.tryStopBridge();
            }
        });

        // ✅ 監聽 box 位置
        const posPath = `boxes/${this.boxId}/position`;
        firebase.database.ref(posPath).on("value", (snapshot) => {
            const pos = snapshot.val();
            if (!pos) return;
            this.checkOverlapWithSensor(cc.v2(pos.x, pos.y));
        });

        // ✅ 監聽玩家位置
        firebase.database.ref("players").on("value", (snapshot) => {
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

    private checkOverlapWithSensor(pos: cc.Vec2) {
        const sensorPos = this.node.getPosition();
        const size = this.node.getContentSize();

        const dx = Math.abs(pos.x - sensorPos.x);
        const dy = Math.abs(pos.y - sensorPos.y);
        const inRange = dx <= size.width / 2 && dy <= size.height / 2;

        cc.log(`[Sensor] 🔍 檢查範圍：inRange=${inRange}, boxTriggered=${this.boxTriggered}`);

        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database) return;

        const path = `boxes/${this.boxId}/boxTriggered`;
        if (inRange && !this.boxTriggered) {
            cc.log(`[Sensor] ✅ box 進入感應 → 寫入 ${path} = true`);
            firebase.database.ref(path).set(true);
        }
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        const nodeName = otherCollider.node.name;
        const nodeGroup = otherCollider.node.group;
        cc.log(`[Sensor] 💥 接觸：name=${nodeName}, group=${nodeGroup}`);

        const firebase = FirebaseManager.getInstance();
        const path = `boxes/${this.boxId}/boxTriggered`;

        if (nodeName === this.boxId) {
            firebase.database.ref(path).set(true)
                .then(() => cc.log(`[Sensor] ✅ box 接觸 → boxTriggered = true`))
                .catch(err => cc.error(`[Sensor] ❌ boxTriggered 寫入失敗`, err));
        }

        if (nodeName === "Player") {
            this.playerCount++;
        } else if (nodeGroup === "Item") {
            this.itemCount++;
        }

        this.tryStartBridge();
    }

    onEndContact(contact, selfCollider, otherCollider) {
        const nodeName = otherCollider.node.name;
        const nodeGroup = otherCollider.node.group;

        if (nodeName === "Player") {
            this.playerCount = Math.max(0, this.playerCount - 1);
        } else if (nodeGroup === "Item") {
            this.itemCount = Math.max(0, this.itemCount - 1);
        }

        if (nodeName === this.boxId) {
            const firebase = FirebaseManager.getInstance();
            const path = `boxes/${this.boxId}/boxTriggered`;

            firebase.database.ref(path).set(false)
                .then(() => cc.log(`[Sensor] 📦 離開 box → boxTriggered = false`))
                .catch(err => cc.error(`[Sensor] ❌ boxTriggered 清除失敗`, err));
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
            cc.log(`[Bridge] ✅ 啟動橋梁`);
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
            cc.log(`[Bridge] ⛔ 停止橋梁`);
            this.bridge.getComponent("BridgeMoveController")?.stopOscillation();
        }
    }
}
