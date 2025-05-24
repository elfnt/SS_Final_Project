const { ccclass, property } = cc._decorator;

@ccclass
export default class FlashSensor extends cc.Component {

    @property(cc.Node)
    screenMask: cc.Node = null;

    @property(cc.Node)
    cameraNode: cc.Node = null;

    private triggered: boolean = false;
    start() {
        cc.log("screenmask", this.screenMask);
        if (this.screenMask) {
            this.screenMask.zIndex = 9999;

            const parent = this.screenMask.parent;
            cc.log("parent = ",parent);
            if (parent) {
                parent.sortAllChildren();
                cc.log('[FlashSensor] sortAllChildren() 執行完成');
            } else {
                cc.warn('[FlashSensor] parent is null at start');
            }
        }
    }


    onBeginContact(contact: cc.PhysicsContact, self: cc.Collider, other: cc.Collider) {
        if (this.triggered) return;
        if (other.node.name === 'Player') {
            cc.log("triggered = true");
            this.triggered = true;

            if (this.screenMask) {
                this.screenMask.opacity = 0;
                cc.log("screenmask's opacity = 0");
                cc.tween(this.screenMask)
                    .to(0.1, { opacity: 255 })
                    .delay(1)
                    .to(0.1, { opacity: 0 })
                    .delay(0.5)
                    .call(() => {
                        this.triggered = false;
                    })
                    .start();
            }
        }
    }

    update(dt: number) {
        // 黏著 camera 移動
        if (this.cameraNode && this.screenMask) {
            this.screenMask.setPosition(this.cameraNode.getPosition());
        }
    }
}
