const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeMoveController extends cc.Component {

    @property
    maxOffsetY: number = 1000; // 上限：原始位置 + 1000

    @property
    minOffsetY: number = -50; // 下限：原始位置 - 50

    @property
    moveSpeed: number = 100; // px/sec

    private originalY: number = 0;
    private isOscillating: boolean = false;
    private isGoingUp: boolean = true;

    onLoad() {
        this.originalY = this.node.y;
    }

    startOscillation() {
        this.isOscillating = true;
        // 若到頂就往下、到底就往上
        const y = this.node.y;
        const topY = this.originalY + this.maxOffsetY;
        const bottomY = this.originalY + this.minOffsetY;

        if (Math.abs(y - topY) < 1) {
            this.isGoingUp = false;
        } else if (Math.abs(y - bottomY) < 1) {
            this.isGoingUp = true;
        }
    }

    stopOscillation() {
        this.isOscillating = false;
    }

    update(dt: number) {
    const rb = this.getComponent(cc.RigidBody);
    if (!rb || !this.isOscillating) {
        if (rb) rb.linearVelocity = cc.Vec2.ZERO;
        return;
    }

    const y = this.node.y;
    const topY = this.originalY + this.maxOffsetY;
    const bottomY = this.originalY + this.minOffsetY;

    // ✅ 每幀檢查是否該改方向
    if (y >= topY) {
        this.isGoingUp = false;
    } else if (y <= bottomY) {
        this.isGoingUp = true;
    }

    const deltaY = this.isGoingUp ? this.moveSpeed : -this.moveSpeed;
    rb.linearVelocity = cc.v2(0, deltaY);
}

}
