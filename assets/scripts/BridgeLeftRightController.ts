const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeOscillator extends cc.Component {

    @property
    moveDistance: number = 500; // ✅ 左右最大偏移量（±500）

    @property
    moveSpeed: number = 100; // ✅ 每秒移動速度

    private direction: number = 1;  // +1 表示往右，-1 表示往左
    private originX: number = 0;

    onLoad() {
        this.originX = this.node.x;
    }

    update(dt: number) {
        // 計算新位置
        this.node.x += this.direction * this.moveSpeed * dt;

        const offset = this.node.x - this.originX;

        if (Math.abs(offset) >= this.moveDistance) {
            // 超過最大偏移時，反向
            this.node.x = this.originX + this.moveDistance * this.direction;
            this.direction *= -1;
        }
    }
}
