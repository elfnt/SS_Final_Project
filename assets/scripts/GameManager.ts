const { ccclass, property } = cc._decorator;

@ccclass
export default class GameManager extends cc.Component {

    @property(cc.Node)
    egg: cc.Node = null;

    @property(cc.Node)
    cameraNode: cc.Node = null; // ✅ 可以自由拉位置的 Camera Node

    private offset: cc.Vec2 = cc.v2(0, 0); // ✅ 初始偏移

    onLoad() {
        const physicsMgr = cc.director.getPhysicsManager();
        physicsMgr.enabled = true;
        physicsMgr.debugDrawFlags =
            cc.PhysicsManager.DrawBits.e_aabbBit |
            cc.PhysicsManager.DrawBits.e_jointBit |
            cc.PhysicsManager.DrawBits.e_shapeBit;
        physicsMgr.gravity = cc.v2(0, -1600);
    }

    start() {
        if (this.egg && this.cameraNode) {
            // ✅ 計算 camera 與 egg 的初始世界座標差
            const eggPos = this.egg.convertToWorldSpaceAR(cc.v2(0, 0));
            const camPos = this.cameraNode.convertToWorldSpaceAR(cc.v2(0, 0));
            this.offset = camPos.sub(eggPos);
        }
    }

    update(dt: number) {
        if (this.egg && this.cameraNode) {
            const eggPos = this.egg.convertToWorldSpaceAR(cc.v2(0, 0));
            const newCamWorldPos = eggPos.add(this.offset);
            const newCamLocalPos = this.cameraNode.parent.convertToNodeSpaceAR(newCamWorldPos);
            this.cameraNode.setPosition(newCamLocalPos);
        }
    }
}
