const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeButtonSensor1 extends cc.Component {
    @property(cc.Node)
    bridge: cc.Node = null;

    onBeginContact(contact, selfCollider, otherCollider) {
        cc.log ("contact sensor1!");
        if (otherCollider.node.name === "Player") {
            this.bridge.getComponent("BridgeMoveController")?.startOscillation();
        }
    }

    onEndContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === "Player") {
            this.bridge.getComponent("BridgeMoveController")?.stopOscillation();
        }
    }
}
