const { ccclass, property } = cc._decorator;

@ccclass
export default class GameManager extends cc.Component {

    onLoad() {
        // ✅ 啟用物理系統
        const physicsMgr = cc.director.getPhysicsManager();
        physicsMgr.enabled = true;

        // ✅ 顯示 debug hitbox（包含碰撞框與 AABB）
        physicsMgr.debugDrawFlags =
            cc.PhysicsManager.DrawBits.e_aabbBit |        // AABB 框
            // cc.PhysicsManager.DrawBits.e_pairBit |        // 接觸對應關係
            // cc.PhysicsManager.DrawBits.e_centerOfMassBit |// 質心
            cc.PhysicsManager.DrawBits.e_jointBit |       // Joint（如果有用）
            cc.PhysicsManager.DrawBits.e_shapeBit;        // 碰撞框

        // ✅ 設定重力（可自訂）
        physicsMgr.gravity = cc.v2(0, -1600);  // 比預設的 -320 更真實一點
    }
}
