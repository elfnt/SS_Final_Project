const { ccclass, property } = cc._decorator;

@ccclass
export default class BoxSensor extends cc.Component {

    @property({ type: cc.Node, tooltip: "要被隱藏和關閉物理的目標節點" })
    targetBar: cc.Node = null;

    @property({ type: cc.Node, tooltip: "要變為不透明並變更剛體類型的 bar_shield 節點" })
    bar_shield: cc.Node = null;

    private hasTriggered: boolean = false;
    private targetConverted: boolean = false;

    onBeginContact(contact, selfCollider, otherCollider) {
        if (this.hasTriggered) return;

        if (otherCollider.node.group === 'Item') {
            this.hasTriggered = true;

            // 關閉 targetBar 的剛體與碰撞盒（但不移除，讓 update 負責轉 dynamic）
            const rb = this.targetBar.getComponent(cc.RigidBody);
            if (rb) rb.enabled = false;

            const collider = this.targetBar.getComponent(cc.PhysicsBoxCollider);
            if (collider) collider.enabled = false;

            // 設定透明
            this.targetBar.opacity = 0;

            // bar_shield 掉落
            if (this.bar_shield) {
                this.bar_shield.opacity = 255;
                this.scheduleOnce(() => {
                    const shieldRB = this.bar_shield.getComponent(cc.RigidBody);
                    if (shieldRB) {
                        shieldRB.type = cc.RigidBodyType.Dynamic;
                        shieldRB.awake = true;
                    }
                }, 0);
            }

            cc.log("[BoxSensor] 初次觸發成功，等待 update 接管 targetBar 動態");
        }
    }
    onLoad() {
        cc.systemEvent.on("RESET_SENSOR", this.resetSensor, this);
    }
    onDestroy() {
        cc.systemEvent.off("RESET_SENSOR", this.resetSensor, this);
    }

    update() {
        if (this.hasTriggered && !this.targetConverted) {
            const rb = this.targetBar.getComponent(cc.RigidBody);
            if (rb) {
                rb.enabled = true;
                rb.type = cc.RigidBodyType.Dynamic;
                rb.awake = true;
                this.targetConverted = true;
                cc.log("[BoxSensor] targetBar 已轉為 dynamic 並啟用");
            }
        }
    }
    public resetSensor() {
        this.hasTriggered = false;
        this.targetConverted = false;

        // ✅ 還原 targetBar 狀態
        const rb = this.targetBar.getComponent(cc.RigidBody);
        if (rb) {
            rb.enabled = false;
            rb.type = cc.RigidBodyType.Static;
            rb.linearVelocity = cc.Vec2.ZERO;
            rb.angularVelocity = 0;
        }

        const collider = this.targetBar.getComponent(cc.PhysicsBoxCollider);
        if (collider) {
            collider.enabled = true;
            collider.apply();
        }

        this.targetBar.opacity = 255;

        // ✅ 還原 bar_shield
        const shieldRB = this.bar_shield.getComponent(cc.RigidBody);
        if (shieldRB) {
            shieldRB.enabled = false;
            shieldRB.type = cc.RigidBodyType.Static;
            shieldRB.linearVelocity = cc.Vec2.ZERO;
            shieldRB.angularVelocity = 0;

            this.scheduleOnce(() => {
                shieldRB.enabled = true;
                shieldRB.awake = true;
            }, 0.01);
        }

        this.bar_shield.opacity = 0;

        cc.log("[BoxSensor] ✅ Reset 完成，可重新觸發");
    }

}