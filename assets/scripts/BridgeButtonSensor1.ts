const { ccclass, property } = cc._decorator;

@ccclass
export default class BridgeButtonSensor1 extends cc.Component {

    @property(cc.Node)
    bridge: cc.Node = null;

    private playerCount: number = 0;
    private itemCount: number = 0;

    onBeginContact(contact, selfCollider, otherCollider) {
        cc.log("contact sensor1!");

        if (otherCollider.node.name === "Player") {
            this.playerCount++;
        } else if (otherCollider.node.group === "Item") {
            this.itemCount++;
        }

        this.bridge.getComponent("BridgeMoveController")?.startOscillation();
    }

    onEndContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === "Player") {
            this.playerCount = Math.max(0, this.playerCount - 1);
        } else if (otherCollider.node.group === "Item") {
            this.itemCount = Math.max(0, this.itemCount - 1);
        }

        // 只有兩者都離開，才停下橋
        if (this.playerCount === 0 && this.itemCount === 0) {
            this.bridge.getComponent("BridgeMoveController")?.stopOscillation();
        }
    }
}
