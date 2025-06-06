import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class Dropbox extends cc.Component {

    @property({ tooltip: "Firebase 上的 dropbox ID，例如 drop1、drop2" })
    dropId: string = "drop1";

    private hasTriggered: boolean = false;
    private originalPosition: cc.Vec2 = null;
    private rb: cc.RigidBody = null;

    onLoad() {
        this.originalPosition = this.node.getPosition().clone();
        this.rb = this.getComponent(cc.RigidBody);
        this.listenToFirebase();

        // ✅ 監聽蛋與玩家重生事件
        cc.systemEvent.on("PLAYER_RESPAWNED", this.onPlayerRespawned, this);
        cc.systemEvent.on("EGG_RESPAWNED", this.onEggRespawned, this);
    }

    onDestroy() {
        cc.systemEvent.off("PLAYER_RESPAWNED", this.onPlayerRespawned, this);
        cc.systemEvent.off("EGG_RESPAWNED", this.onEggRespawned, this);
    }

    onBeginContact(contact: cc.PhysicsContact, selfCol: cc.PhysicsCollider, otherCol: cc.PhysicsCollider) {
        if (this.hasTriggered || otherCol.node.name !== "Egg") return;

        this.hasTriggered = true;
        cc.log(`[Dropbox] ✅ 玩家觸發 ${this.dropId}，開始倒數`);

        const firebase = FirebaseManager.getInstance();
        firebase.database.ref(`dropboxes/${this.dropId}`).update({ isFalling: true });

        this.scheduleOnce(() => {
            this.activatePhysics();
        }, 2);
    }

    private listenToFirebase() {
        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database || !this.dropId) return;

        firebase.database.ref(`dropboxes/${this.dropId}/isFalling`).on("value", (snapshot) => {
            const val = snapshot.val();
            if (val === true && !this.hasTriggered) {
                this.hasTriggered = true;
                cc.log(`[Dropbox] 🔁 Firebase觸發 ${this.dropId}，倒數開始`);

                this.scheduleOnce(() => {
                    this.activatePhysics();
                }, 2);
            }
        });
    }

    private activatePhysics() {
        if (this.rb) {
            this.rb.type = cc.RigidBodyType.Dynamic;
            this.rb.awake = true;
        }
        cc.log(`[Dropbox] 🧲 ${this.dropId} 已變為 Dynamic`);
    }

    private onPlayerRespawned() {
        this.reset();
    }

    private onEggRespawned() {
        cc.log(`[Dropbox] 🥚 接收到蛋重生 EGG_RESPAWNED -> Reset ${this.dropId}`);
        this.reset();
    }

    public reset() {
        this.hasTriggered = false;
        this.node.setPosition(this.originalPosition);

        if (this.rb) {
            this.rb.type = cc.RigidBodyType.Static;
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;
            this.rb.syncPosition(true);
        }

        const firebase = FirebaseManager.getInstance();
        firebase.database.ref(`dropboxes/${this.dropId}`).update({ isFalling: false });

        cc.log(`[Dropbox] 🔄 ${this.dropId} 重置`);
    }
}
