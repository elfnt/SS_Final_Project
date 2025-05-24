const { ccclass, property } = cc._decorator;

@ccclass
export default class FlashSensorActivator extends cc.Component {

    @property(cc.Node)
    screenMask: cc.Node = null;

    @property(cc.Node)
    cameraNode: cc.Node = null;

    private static triggered: boolean = false;
    private static flickerTween: cc.Tween = null;

    start() {
        if (this.screenMask) {
            this.screenMask.zIndex = 9999;
            this.screenMask.parent?.sortAllChildren();
        }
    }

    onBeginContact(contact: cc.PhysicsContact, self: cc.Collider, other: cc.Collider) {
        if (other.node.name !== 'Player') return;
        if (FlashSensorActivator.triggered) return; // 已觸發就不重複

        cc.log('[FlashSensorActivator] Player 碰到，開始閃爍');

        FlashSensorActivator.triggered = true;
        FlashSensorActivator.flickerTween = cc.tween(this.screenMask)
            .to(0.1, { opacity: 255 })
            .delay(0.5)
            .to(0.1, { opacity: 0 })
            .delay(0.5)
            .union()
            .repeatForever()
            .start();
    }

    update(dt: number) {
        if (this.screenMask && this.cameraNode) {
            this.screenMask.setPosition(this.cameraNode.getPosition());
        }
    }

    public static stopFlicker(mask: cc.Node) {
        if (FlashSensorActivator.flickerTween) {
            FlashSensorActivator.flickerTween.stop();
            FlashSensorActivator.flickerTween = null;
        }
        FlashSensorActivator.triggered = false;
        if (mask) mask.opacity = 0;
    }

    public static isActive(): boolean {
        return FlashSensorActivator.triggered;
    }
}
