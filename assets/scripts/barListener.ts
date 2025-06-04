import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class BarListener extends cc.Component {

    @property({ tooltip: "Firebase 觸發節點 ID（例如 boxSensor1）" })
    triggerId: string = "boxSensor1";

    onLoad() {
        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database) return;

        const ref = firebase.database.ref(`triggers/${this.triggerId}`);
        ref.on("value", (snapshot) => {
            const data = snapshot.val();
            if (data?.triggered) {
                this.hideSelf();
            }
        });
    }

    hideSelf() {
        const rb = this.getComponent(cc.RigidBody);
        if (rb) rb.enabled = false;

        const collider = this.getComponent(cc.PhysicsBoxCollider);
        if (collider) collider.enabled = false;

        this.node.opacity = 0;

        cc.log(`[BarListener] bar 已隱藏與停用物理，來自 trigger: ${this.triggerId}`);
    }
}
