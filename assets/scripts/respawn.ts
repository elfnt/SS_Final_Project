const { ccclass, property } = cc._decorator;

@ccclass
export default class AutoRespawn extends cc.Component {

    @property({ tooltip: "當 Y 低於這個值時自動重生（選填）" })
    fallThreshold: number = -1200;

    @property({ tooltip: "是否在玩家死亡時也自動重生" })
    resetOnPlayerDeath: boolean = true;

    private rb: cc.RigidBody = null;
    private respawnPoint: cc.Vec2 = null;
    private originalBodyType: number = null;

    onLoad() {
        this.respawnPoint = this.node.getPosition().clone();
        this.rb = this.getComponent(cc.RigidBody);

        if (this.rb) {
            this.originalBodyType = this.rb.type;
        }

        if (this.resetOnPlayerDeath) {
            cc.systemEvent.on("PLAYER_RESPAWNED", this.respawn, this);
        }
    }

    onDestroy() {
        cc.systemEvent.off("PLAYER_RESPAWNED", this.respawn, this);
    }

    update(dt: number) {
        if (this.fallThreshold != null && this.node.y < this.fallThreshold) {
            this.respawn();
        }
    }

    public respawn() {
        this.node.setPosition(this.respawnPoint);

        if (this.rb) {
            this.rb.enabled = false;

            // ✅ 恢復原本的剛體類型
            this.rb.type = this.originalBodyType;
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;

            this.scheduleOnce(() => {
                this.rb.enabled = true;
                this.rb.awake = true; // ✅ 讓它立刻掉落
            }, 0.01);
        }

        cc.log(`[AutoRespawn] ${this.node.name} reset to (${this.respawnPoint.x}, ${this.respawnPoint.y})`);
    }

}
