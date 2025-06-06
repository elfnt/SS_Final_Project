const { ccclass, property } = cc._decorator;

@ccclass
export default class EndMaskController extends cc.Component {

    @property(cc.Node)
    holeCircle: cc.Node = null;

    showEndingMask(targetWorldPos: cc.Vec2, onFinish: Function = null) {
        this.node.active = true;

        const localPos = this.node.convertToNodeSpaceAR(targetWorldPos);
        this.holeCircle.setPosition(localPos);
        this.holeCircle.setScale(10);

        cc.tween(this.holeCircle)
            .to(2, { scale: 0.3 }, { easing: "cubicInOut" })
            .call(() => {
                cc.log("結尾動畫結束");
                if (onFinish) onFinish();
            })
            .start();
    }
}
