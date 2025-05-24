// ContactManager.ts
const { ccclass, property } = cc._decorator;

@ccclass
export default class ContactManager extends cc.Component {

    @property(cc.Node)
    bridge: cc.Node = null;  // ?????��?????�?�?

    onLoad() {
        cc.director.getPhysicsManager().enabled = true;
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        if (selfCollider.node.name === "button1" && otherCollider.node.name === "Player") {
            this.bridge.getComponent("BridgeController").moveBridge();
        }
        if (selfCollider.node.name === "button2" && otherCollider.node.name === "Player") {
            this.bridge.getComponent("BridgeController").rotateBridge();
        }
    }
}
