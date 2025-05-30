const { ccclass, property } = cc._decorator;

@ccclass
export default class BoxSensor extends cc.Component {

    @property({ type: cc.Node, tooltip: "要被隱藏和關閉物理的目標節點" })
    targetBar: cc.Node = null;

    @property({ type: cc.Node, tooltip: "要變為不透明並變更剛體類型的 bar_shield 節點" })
    bar_shield: cc.Node = null;

    private hasTriggered: boolean = false;

    onBeginContact(contact, selfCollider, otherCollider) {
        if (this.hasTriggered) return;

        if (otherCollider.node.group === 'Item') {
            this.hasTriggered = true;

            // 關閉 targetBar 的剛體
            const rb = this.targetBar.getComponent(cc.RigidBody);
            if (rb) {
                rb.enabled = false;
            }

            // 關閉 targetBar 的碰撞盒
            const collider = this.targetBar.getComponent(cc.PhysicsBoxCollider);
            if (collider) {
                collider.enabled = false;
            }

            // 設定 targetBar 透明
            this.targetBar.opacity = 0;

            // 控制 bar_shield
            if (this.bar_shield) {
                this.bar_shield.opacity = 255;

                // 延遲一個 frame 再改剛體類型，避免 Box2D 錯誤
                this.scheduleOnce(() => {
                    const shieldRB = this.bar_shield.getComponent(cc.RigidBody);
                    if (shieldRB) {
                        shieldRB.type = cc.RigidBodyType.Dynamic;
                    }
                }, 0);
            }
        }
    }
}
