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

    private isRespawning: boolean = false;
    private isControlling: boolean = false;
    private controllerId: string = null;
    private touchingPlayerIds: Set<string> = new Set();

    private lastSentPos: cc.Vec2 = null;
    private lastSentRot: number = null;

    onLoad() {
        this.rb = this.getComponent(cc.RigidBody);
        this.initialPosition = this.node.getPosition().clone();

        const firebase = FirebaseManager.getInstance();
        const localId = cc.sys.localStorage.getItem("playerId");
        const ref = firebase.database.ref(`boxes/${this.boxId}`);

        // ✅ 初始化 Firebase 狀態
        ref.update({
            isRespawn: true,
            controllerId: localId,
            position: {
                x: Math.round(this.initialPosition.x),
                y: Math.round(this.initialPosition.y),
                rotation: Math.round(this.node.angle)
            },
            boxTriggered: false,
            status: 0
        }).then(() => {
            cc.log(`[BoxLogic] ✅ 開局初始化 isRespawn = true，並寫入初始位置`);

            // ✅ 更新 node 的位置
            this.node.setPosition(this.initialPosition);
            this.node.angle = this.angleISet;

            // ✅ 啟動 Firebase 監聽
            this.listenToFirebase();

            // ✅ 啟動位置上傳排程
            this.schedule(() => {
                if (!this.isRespawning && this.isControlling) {
                    this.tryUploadPosition();
                }
            }, 0.05);

            // ✅ 延遲清除重生狀態
            setTimeout(() => {
                ref.update({ isRespawn: false });
                this.isRespawning = false;
                cc.log(`[BoxLogic] 🕒 isRespawn = false`);
            }, this.respawnLockSeconds * 1000);
        });
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

            const controllerStillTouching = current && this.touchingPlayerIds.has(current);
            const isNewToucher = this.touchingPlayerIds.has(id);

            // ✅ 只有「controller 不在碰」且「新玩家碰到了」才換控制權
            if (!controllerStillTouching && isNewToucher) {
                if (id === localId) {
                    this.isControlling = true;
                    this.controllerId = id;
                    firebase.database.ref(`boxes/${this.boxId}`).update({
                        controllerId: id
                    });
                    cc.log(`[BoxLogic] 🎮 ${id} 成為新的控制者（原控制者已離開）`);
                }
            } else {
                cc.log(`[BoxLogic] ${id} 嘗試接管但 ${current} 仍為控制者或條件不符`);
            }
        });
    }


   private tryUploadPosition() {
        const pos = this.node.getPosition();
        const angle = this.node.angle;

        const xChanged = !this.lastSentPos || Math.abs(pos.x - this.lastSentPos.x) > 0.5;
        const yChanged = !this.lastSentPos || Math.abs(pos.y - this.lastSentPos.y) > 0.5;
        const rotChanged = this.lastSentRot === null || Math.abs(angle - this.lastSentRot) > 1;

        cc.log(`[BoxLogic] 📤 嘗試上傳 position，xChanged=${xChanged}, yChanged=${yChanged}, rotChanged=${rotChanged}`);

        if (xChanged || yChanged || rotChanged) {
            this.lastSentPos = pos.clone();
            this.lastSentRot = angle;

            const firebase = FirebaseManager.getInstance();
            firebase.database.ref(`boxes/${this.boxId}/position`).set({
                x: Math.round(pos.x),
                y: Math.round(pos.y),
                rotation: Math.round(angle)
            }).then(() => {
                cc.log(`[BoxLogic] ✅ 成功上傳位置：(${pos.x}, ${pos.y}, rot=${angle})`);
            }).catch((err) => {
                cc.error(`[BoxLogic] ❌ 上傳 Firebase 失敗：`, err);
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

            cc.log(`[BoxLogic] 🔍 localId=${localId}, controllerId=${remoteController}, isControlling=${this.isControlling}`);

            this.isRespawning = !!data.isRespawn;

            // 如果不是控制者才同步位置
            const pos = data.position;
            if (!this.isControlling && pos && !this.isRespawning) {
                if (this.rb && this.rb.enabled) this.rb.enabled = false;
                this.node.setPosition(pos.x, pos.y);
                if (typeof pos.rotation === "number") {
                    this.node.angle = pos.rotation;
                }
                this.scheduleOnce(() => {
                    if (this.rb && !this.rb.enabled) {
                        this.rb.enabled = true;
                        this.rb.awake = true;
                    }
                }, 0.01);
                cc.log(`[BoxLogic] ⬇️ 非控制者同步位置至 ${pos.x}, ${pos.y}, rot=${pos.rotation}`);
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
        const posPath = `boxes/${this.boxId}/position`;

        firebase.database.ref(posPath).set({
            x: Math.round(this.initialPosition.x),
            y: Math.round(this.initialPosition.y),
            rotation: Math.round(this.node.angle)
        }).then(() => {
            cc.log(`[BoxLogic] ✅ 強制覆蓋 Firebase 初始位置：${posPath}`);
        }).catch(err => {
            cc.error(`[BoxLogic] ❌ 寫入位置失敗：`, err);
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
