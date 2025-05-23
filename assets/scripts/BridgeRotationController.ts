const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeRotationController extends cc.Component {

    @property
    rotateAngle: number = 15; // 最大旋轉 ±15 度

    @property
    rotateSpeed: number = 30; // 每秒旋轉速度 (degree/sec)

    private isRotating: boolean = false;
    private isTurningClockwise: boolean = true;
    private originalAngle: number = 0;

    onLoad() {
        this.originalAngle = this.node.angle;
    }

    startRotation() {
        this.isRotating = true;
    }

    stopRotation() {
        this.isRotating = false;
    }

    update(dt: number) {
        if (!this.isRotating) return;

        const maxAngle = this.originalAngle + this.rotateAngle;
        const minAngle = this.originalAngle - this.rotateAngle;

        let delta = this.rotateSpeed * dt;

        if (this.isTurningClockwise) {
            this.node.angle += delta;
            if (this.node.angle >= maxAngle) {
                this.node.angle = maxAngle;
                this.isTurningClockwise = false;
            }
        } else {
            this.node.angle -= delta;
            if (this.node.angle <= minAngle) {
                this.node.angle = minAngle;
                this.isTurningClockwise = true;
            }
        }
    }
}
