const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeLeftRightController extends cc.Component {
    @property
    moveDistance: number = 500; // 最大偏移量（左右來回）

    @property
    moveSpeed: number = 200; // 移動速度

    private direction: number = 1;
    private originX: number = 0;
    private rb: cc.RigidBody = null;

    onLoad() {
        this.originX = this.node.x;
        this.rb = this.getComponent(cc.RigidBody);

        if (!this.rb) {
            cc.error("[Bridge] Missing RigidBody component!");
            return;
        }

        this.rb.type = cc.RigidBodyType.Kinematic; // 確保是 Kinematic
        this.rb.awake = true;
        this.rb.gravityScale = 0; // 不受重力影響
        this.rb.linearVelocity = cc.v2(this.moveSpeed * this.direction, 0);
    }

    update(dt: number) {
        if (!this.rb) return;

        const offset = this.node.x - this.originX;

        // 如果超出偏移距離，反向並更新速度
        if (Math.abs(offset) >= this.moveDistance) {
            this.direction *= -1;
            this.rb.linearVelocity = cc.v2(this.moveSpeed * this.direction, 0);
            this.rb.awake = true;
        }
    }
}
