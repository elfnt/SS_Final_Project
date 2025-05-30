const { ccclass, property } = cc._decorator;

@ccclass
export default class AutoRespawn extends cc.Component {


    @property({ tooltip: "當 Y 低於這個值時重生" })
    fallThreshold: number = -1200;

    private rb: cc.RigidBody = null;
    private respawnPoint: cc.Vec2 = null;

    onLoad() {
        this.respawnPoint = this.node.getPosition().clone();
        this.rb = this.getComponent(cc.RigidBody);
    }

    update(dt: number) {
        if (this.node.y < this.fallThreshold) {
            this.respawn();
        }
    }

    public respawn() {
        this.node.setPosition(this.respawnPoint.x, this.respawnPoint.y);

        if (this.rb) {
            this.rb.enabled = true;
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;
        }

        cc.log(`[AutoRespawn] ${this.node.name} respawned to (${this.respawnPoint.x}, ${this.respawnPoint.y})`);
    }
}
