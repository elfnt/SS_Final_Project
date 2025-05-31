const { ccclass, property } = cc._decorator;

@ccclass
export default class Dropbox extends cc.Component {

    private hasTriggered: boolean = false;
    private originalPosition: cc.Vec2 = null;
    private rb: cc.RigidBody = null;

    onLoad() {
        this.originalPosition = this.node.getPosition().clone();
        this.rb = this.getComponent(cc.RigidBody);

        // ✅ 監聽玩家重生事件
        cc.systemEvent.on("PLAYER_RESPAWNED", this.onPlayerRespawned, this);
    }

    onDestroy() {
        cc.systemEvent.off("PLAYER_RESPAWNED", this.onPlayerRespawned, this);
    }

    onBeginContact(contact: cc.PhysicsContact, selfCol: cc.PhysicsCollider, otherCol: cc.PhysicsCollider) {
        if (this.hasTriggered) return;

        if (otherCol.node.name === "Player") {
            this.hasTriggered = true;
            cc.log("[Dropbox] Contact with Player!");

            this.scheduleOnce(() => {
                if (this.rb) {
                    this.rb.type = cc.RigidBodyType.Dynamic;
                    this.rb.awake = true;
                }
            }, 1.0);
        }
    }

    private onPlayerRespawned() {
        this.reset();
    }

    public reset() {
        this.hasTriggered = false;

        this.node.setPosition(this.originalPosition);

        if (this.rb) {
            this.rb.type = cc.RigidBodyType.Static;
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;

            // ✅ 強制同步物理位置，不會偏移也能刷新接觸
            this.rb.syncPosition(true);
        }

        cc.log(`[Dropbox] Reset to (${this.originalPosition.x}, ${this.originalPosition.y})`);
    }

}
