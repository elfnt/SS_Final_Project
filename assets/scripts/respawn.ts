import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class AutoRespawn extends cc.Component {

    @property({ tooltip: "當 Y 低於這個值時自動重生" })
    fallThreshold: number = -1200;

    @property({ tooltip: "預設重生角度（角度制）" })
    angleISet: number = 0;

    private rb: cc.RigidBody = null;
    private respawnPoint: cc.Vec2 = null;
    private originalBodyType: number = null;
    private firebaseKey: string = null;

    onLoad() {
        this.respawnPoint = this.node.getPosition().clone();
        this.rb = this.getComponent(cc.RigidBody);
        if (this.rb) {
            this.originalBodyType = this.rb.type;
        }

        // ✅ 嘗試從 BoxController 或物件名稱取得 Firebase Key
        const boxController = this.getComponent("BoxController") as any;
        this.firebaseKey = boxController?.boxId || this.node.name;
    }

    update(dt: number) {
        if (this.node.y < this.fallThreshold) {
            this.respawn();
        }
    }

    private respawn() {
        this.node.setPosition(this.respawnPoint);
        this.node.angle = this.angleISet;

        if (this.rb) {
            this.rb.enabled = false;
            this.rb.type = this.originalBodyType;
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;

            this.scheduleOnce(() => {
                this.rb.enabled = true;
                this.rb.awake = true;
            }, 0.01);
        }

        cc.log(`[AutoRespawn] ${this.node.name} 重生於 (${this.respawnPoint.x}, ${this.respawnPoint.y}) 角度=${this.angleISet}`);
        this.updateFirebasePosition();
    }

    private updateFirebasePosition() {
        const firebaseManager = FirebaseManager.getInstance();
        if (!firebaseManager?.database || !this.firebaseKey) return;

        firebaseManager.database.ref(`boxes/${this.firebaseKey}/position`).set({
            x: Math.round(this.node.x),
            y: Math.round(this.node.y),
            rotation: Math.round(this.node.angle)
        });

        cc.log(`[AutoRespawn] ✅ 已同步 ${this.firebaseKey} 到 Firebase (${this.node.x}, ${this.node.y}, rot=${this.node.angle})`);
    }
}
