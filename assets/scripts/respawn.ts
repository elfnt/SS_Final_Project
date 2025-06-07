import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class AutoRespawn extends cc.Component {
    @property({ tooltip: "當 Y 低於這個值時自動重生（選填）" })
    fallThreshold: number = -1200;

    @property({ tooltip: "是否在玩家死亡時也自動重生" })
    resetOnPlayerDeath: boolean = true;

    @property({ tooltip: "預設重生角度（角度制）" })
    angleISet: number = 0;

    private rb: cc.RigidBody = null;
    private respawnPoint: cc.Vec2 = null;
    private originalBodyType: number = null;
    private firebaseKey: string = null;

    onLoad() {
        // 🟡 儲存初始資訊
        this.respawnPoint = this.node.getPosition().clone();
        this.rb = this.getComponent(cc.RigidBody);
        if (this.rb) {
            this.originalBodyType = this.rb.type;
        }

        // 🟡 優先從 BoxController 拿到 boxId，否則用 node 名稱
        const boxController = this.getComponent("BoxController") as any;
        this.firebaseKey = boxController?.boxId || this.node.name;

        // ✅ 初始化位置與剛體型態，並立即同步到 Firebase
        this.resetLocalPhysics();
        this.updateFirebasePosition();

        // ✅ 監聽玩家重生事件
        if (this.resetOnPlayerDeath) {
            cc.systemEvent.on("PLAYER_RESPAWNED", this.doSimpleReset, this);
        }
    }

    onDestroy() {
        cc.systemEvent.off("PLAYER_RESPAWNED", this.doSimpleReset, this);
    }

    update(dt: number) {
        if (this.fallThreshold != null && this.node.y < this.fallThreshold) {
            this.respawn(); // 真正掉落時進行完整重生（含 Firebase 更新）
        }
    }

    /** ✅ 完整重生（包含 Firebase 更新） */
    public respawn() {
        this.resetLocalPhysics();
        this.updateFirebasePosition();
        cc.log(`[AutoRespawn] ${this.node.name} 完整重生至 (${this.node.x}, ${this.node.y})，角度=${this.node.angle}`);
    }

    /** ✅ 玩家重生時觸發，只還原位置與剛體，不動 Firebase 狀態欄位 */
    private doSimpleReset() {
        this.resetLocalPhysics();
        this.updateFirebasePosition();
        cc.log(`[AutoRespawn] 玩家重生 → ${this.node.name} 被重設至起始位置`);
    }

    /** ✅ 重設位置與剛體型態 */
    private resetLocalPhysics() {
        this.node.setPosition(this.respawnPoint);
        this.node.angle = this.angleISet;

        if (this.rb) {
            this.rb.enabled = false;
            //this.rb.type = this.originalBodyType;
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;

            this.scheduleOnce(() => {
                this.rb.enabled = true;
                this.rb.awake = true;
            }, 0.01);
        }
    }

    /** ✅ 同步位置與角度至 Firebase（不包含其他狀態） */
    private updateFirebasePosition() {
        const firebaseManager = FirebaseManager.getInstance();
        if (!firebaseManager?.database || !this.firebaseKey) return;

        const pos = this.node.getPosition();
        firebaseManager.database.ref(`boxes/${this.firebaseKey}/position`).update({
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            rotation: Math.round(this.node.angle)
        });

        cc.log(`[AutoRespawn] ✅ Firebase 同步 ${this.firebaseKey} 的位置：(${pos.x}, ${pos.y})，角度=${this.node.angle}`);
    }
}
