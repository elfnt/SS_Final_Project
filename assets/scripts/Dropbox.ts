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
            }, 0.5);
        }
    }

    private onPlayerRespawned() {
        this.reset();
    }

    public reset() {
        this.hasTriggered = false;

        this.node.setPosition(this.originalPosition);

        if (this.rb) {
            this.rb.enabled = false;
            this.rb.type = cc.RigidBodyType.Kinematic;
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;

            this.scheduleOnce(() => {
                this.rb.enabled = true;
            }, 0.01);
        }

        cc.log(`[Dropbox] Reset to (${this.originalPosition.x}, ${this.originalPosition.y})`);
    }
}
