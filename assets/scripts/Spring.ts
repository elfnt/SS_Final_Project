const { ccclass, property } = cc._decorator;

@ccclass
export default class Spring extends cc.Component {

    @property({ tooltip: "彈跳力道" })
    bounceForce: number = 1000;

    onBeginContact(contact: cc.PhysicsContact, selfCollider: cc.PhysicsBoxCollider, otherCollider: cc.PhysicsCollider) {
        if (!otherCollider) return;

        const normal = contact.getWorldManifold().normal;
        cc.log(`[Spring] 碰撞方向 normal: (${normal.x}, ${normal.y})`);

        // ✅ 正確判斷：物體從上往下撞彈簧（normal 指向上方）
        if (normal.y >= 0.9) {
            const rb = otherCollider.node.getComponent(cc.RigidBody);
            if (rb) {
                rb.linearVelocity = cc.v2(rb.linearVelocity.x, 0); // 重設 Y 方向速度
                rb.applyLinearImpulse(cc.v2(0, this.bounceForce), rb.getWorldCenter(), true);
                cc.log(`[Spring] 彈跳成功！對象: ${otherCollider.node.name}`);
            }
        }
    }
}
