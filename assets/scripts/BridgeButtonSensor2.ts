const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeButtonSensor2 extends cc.Component {
    @property(cc.Node)
    bridge: cc.Node = null;

    onBeginContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === "Player") {
            this.bridge.getComponent("BridgeRotationController")?.startRotation();
        }
    }

    onEndContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === "Player") {
            this.bridge.getComponent("BridgeRotationController")?.stopRotation();
        }
    }
}
