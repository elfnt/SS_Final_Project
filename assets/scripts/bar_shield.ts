import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class BarShieldController extends cc.Component {
    @property({ tooltip: "Firebase 上的物件 ID（例如 bar_shield）" })
    shieldId: string = "bar_shield";

    @property({ tooltip: "是否啟用自動重生（y < 門檻）" })
    enableAutoRespawn: boolean = true;

    @property({ tooltip: "y < ? 就會觸發重生" })
    fallThreshold: number = -1200;

    private originalPos: cc.Vec2 = null;
    private rb: cc.RigidBody = null;
    private hasInitialized = false;

    onLoad() {
        this.originalPos = this.node.getPosition().clone();
        this.rb = this.getComponent(cc.RigidBody);

        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database) {
            cc.warn("[BarShield] ❌ Firebase 尚未初始化");
            return;
        }

        // ✅ 初始化資料
        firebase.database.ref(`boxes/${this.shieldId}`).once("value", (snapshot) => {
            if (!snapshot.exists()) {
                firebase.database.ref(`boxes/${this.shieldId}`).set({
                    position: {
                        x: Math.round(this.originalPos.x),
                        y: Math.round(this.originalPos.y),
                        rotation: Math.round(this.node.angle)
                    }
                });
            }
        });

        // ✅ 監聽位置同步（非控制者玩家）
        firebase.database.ref(`boxes/${this.shieldId}/position`).on("value", (snapshot) => {
            if (!this.hasInitialized) return;
            const pos = snapshot.val();
            if (!pos) return;

            if (!this.rb || this.rb.type !== cc.RigidBodyType.Static) {
                this.rb.type = cc.RigidBodyType.Static;
            }

            this.node.setPosition(pos.x, pos.y);
            this.node.angle = pos.rotation ?? 0;
        });

        this.hasInitialized = true;

        cc.systemEvent.on("PLAYER_RESPAWNED", this.reset, this);
    }

    update(dt: number) {
        if (this.enableAutoRespawn && this.node.y < this.fallThreshold) {
            this.reset();
        }
    }

    public reset() {
        if (this.rb) {
            this.rb.type = cc.RigidBodyType.Static;
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;
        }

        this.node.setPosition(this.originalPos);
        this.node.angle = 0;

        const firebase = FirebaseManager.getInstance();
        firebase?.database?.ref(`boxes/${this.shieldId}/position`).set({
            x: Math.round(this.originalPos.x),
            y: Math.round(this.originalPos.y),
            rotation: 0
        });

        cc.log(`[BarShield] 🔄 已重置並同步至 Firebase`);
    }

    onDestroy() {
        cc.systemEvent.off("PLAYER_RESPAWNED", this.reset, this);
    }
}
