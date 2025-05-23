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
        if (!this.isOscillating) return;

        const topY = this.originalY + this.maxOffsetY;
        const bottomY = this.originalY + this.minOffsetY;

        let deltaY = this.moveSpeed * dt;

        if (this.isGoingUp) {
            this.node.y += deltaY;
            if (this.node.y >= topY) {
                this.node.y = topY;
                this.isGoingUp = false;
            }
        } else {
            this.node.y -= deltaY;
            if (this.node.y <= bottomY) {
                this.node.y = bottomY;
                this.isGoingUp = true;
            }
        }
    }
}
