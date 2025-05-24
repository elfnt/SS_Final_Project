const { ccclass, property } = cc._decorator;

@ccclass
export default class GameManager extends cc.Component {

    @property(cc.Node)
    egg: cc.Node = null;

    onLoad() {
        const physicsMgr = cc.director.getPhysicsManager();
        physicsMgr.enabled = true;
        physicsMgr.debugDrawFlags =
            cc.PhysicsManager.DrawBits.e_aabbBit |
            cc.PhysicsManager.DrawBits.e_jointBit |
            cc.PhysicsManager.DrawBits.e_shapeBit;
        //physicsMgr.debugDrawFlags = 0;
        physicsMgr.gravity = cc.v2(0, -1600);
    }

    start() {
        if (this.egg) {
            // ✅ 計算 egg 的初始世界座標
            const eggPos = this.egg.convertToWorldSpaceAR(cc.v2(0, 0));
        }
    }

    update(dt: number) {
        // Remove camera follow logic from GameManager
        // Camera will now be controlled by Player or Egg script
    }
}