import FlashSensorActivator from "./FlashSensorActivator";

const { ccclass, property } = cc._decorator;

@ccclass
export default class FlashSensorDeactivator extends cc.Component {

    @property(cc.Node)
    screenMask: cc.Node = null;

    onBeginContact(contact: cc.PhysicsContact, self: cc.Collider, other: cc.Collider) {
        if (other.node.name !== 'Player') return;

        if (FlashSensorActivator.isActive()) {
            cc.log('[FlashSensorDeactivator] Player 碰到，關閉閃爍');
            FlashSensorActivator.stopFlicker(this.screenMask);
        } else {
            cc.log('[FlashSensorDeactivator] 已經是關閉狀態，無須處理');
        }
    }
}
